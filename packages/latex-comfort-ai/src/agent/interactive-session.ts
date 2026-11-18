import * as acp from "@agentclientprotocol/sdk";
import { mapAvailableCommands, mapConfigOptions, mapSessionUpdate } from "./acp-events";
import type { AgentRemoteSession } from "./history-types";
import type {
  AgentAuthMethod,
  AgentCommand,
  AgentConfigOption,
  AgentEvent,
  AgentPermissionRequest,
} from "./types";

type AgentDecision =
  | { type: "agent"; methodId: string }
  | { type: "completed" }
  | { type: "cancelled" };

interface UpdateWaiter {
  accept(update: acp.SessionUpdate): void;
}

export interface InteractiveAcpSessionOptions {
  target: acp.Stream | acp.AgentApp;
  agentId: "opencode" | "codex";
  cwd: string;
  onEvent(event: AgentEvent): void;
  requestPermission(request: AgentPermissionRequest): Promise<string | undefined>;
  authenticate?(request: {
    agentId: "opencode" | "codex";
    methods: AgentAuthMethod[];
  }): Promise<AgentDecision>;
  initialConfig?: Record<string, string>;
  preferredModel?: string;
  resumeSessionId?: string;
  replayHistory?: boolean;
}

export interface InteractiveSessionStart {
  sessionId: string;
  configOptions: AgentConfigOption[];
  availableCommands: AgentCommand[];
  authMethods: AgentAuthMethod[];
  resumed: boolean;
  capabilities: {
    list: boolean;
    load: boolean;
    resume: boolean;
    delete: boolean;
    close: boolean;
  };
}

function cancellableAbort(): Error {
  const error = new Error("The agent run was cancelled.");
  error.name = "AbortError";
  return error;
}

function isAuthenticationRequired(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /authentication required|auth required|unauthenticated|login required|provider authentication required/i.test(
    message,
  );
}

function authMethodView(method: acp.AuthMethod): AgentAuthMethod {
  if ("type" in method && method.type === "terminal") {
    return {
      id: method.id,
      label: method.name,
      ...(method.description ? { description: method.description } : {}),
      type: "terminal",
      ...(method.args ? { args: method.args } : {}),
      ...(method.env ? { env: method.env } : {}),
    };
  }
  return {
    id: method.id,
    label: method.name,
    ...(method.description ? { description: method.description } : {}),
    type: "agent",
  };
}

/**
 * One long-lived ACP connection and session. A prompt turn is allowed at a
 * time, but the same session can be prompted repeatedly until disposed.
 */
export class InteractiveAcpSession {
  private connection: acp.ClientConnection | undefined;
  private sessionId: string | undefined;
  private authMethods: AgentAuthMethod[] = [];
  private configOptions: AgentConfigOption[] = [];
  private availableCommands: AgentCommand[] = [];
  private disposed = false;
  private promptRunning = false;
  private cancelRequested = false;
  private suppressReplayUpdates = false;
  private replayHistoryUpdates = false;
  private readonly updateQueue: acp.SessionUpdate[] = [];
  private readonly updateWaiters: UpdateWaiter[] = [];
  private capabilities: InteractiveSessionStart["capabilities"] = {
    list: false,
    load: false,
    resume: false,
    delete: false,
    close: false,
  };

  constructor(private readonly options: InteractiveAcpSessionOptions) {}

  async start(): Promise<InteractiveSessionStart> {
    if (this.disposed) throw new Error("The agent session has been disposed.");
    if (this.sessionId) {
      return {
        sessionId: this.sessionId,
        configOptions: this.configOptions,
        availableCommands: this.availableCommands,
        authMethods: this.authMethods,
        resumed: true,
        capabilities: this.capabilities,
      };
    }

    const client = acp
      .client({ name: "latex-comfort" })
      .onRequest(
        acp.methods.client.session.requestPermission,
        async ({ params }) => {
          const request: AgentPermissionRequest = {
            ...(params.toolCall.toolCallId
              ? { toolCallId: params.toolCall.toolCallId }
              : {}),
            title: params.toolCall.title?.trim() || "Allow this agent action?",
            ...(params.toolCall.locations
              ? {
                  locations: params.toolCall.locations.map((location) => ({
                    path: location.path,
                    ...(typeof location.line === "number"
                      ? { line: location.line }
                      : {}),
                  })),
                }
              : {}),
            options: params.options.map((option) => ({
              id: option.optionId,
              label: option.name,
              kind: option.kind,
            })),
          };
          const selected = await this.options.requestPermission(request);
          const option = params.options.find(
            (candidate) => candidate.optionId === selected,
          );
          return option
            ? {
                outcome: {
                  outcome: "selected" as const,
                  optionId: option.optionId,
                },
              }
            : { outcome: { outcome: "cancelled" as const } };
        },
      )
      .onNotification(acp.methods.client.session.update, ({ params }) => {
        if (params.sessionId !== this.sessionId) return;
        if (this.suppressReplayUpdates) return;
        if (this.replayHistoryUpdates) {
          this.applyUpdate(params.update);
          return;
        }
        this.pushUpdate(params.update);
      });

    const connection =
      "writable" in this.options.target
        ? client.connect(this.options.target)
        : client.connect(this.options.target);
    this.connection = connection;
    const ctx = connection.agent;

    const initialized = await ctx.request(acp.methods.agent.initialize, {
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
        auth: { terminal: true },
      },
      clientInfo: { name: "latex-comfort", version: "0.1.0" },
    });

    if (initialized.protocolVersion !== acp.PROTOCOL_VERSION) {
      throw new Error(
        `The agent negotiated unsupported ACP protocol version ${initialized.protocolVersion}.`,
      );
    }
    this.authMethods = (initialized.authMethods ?? []).map(authMethodView);
    const sessionCapabilities = initialized.agentCapabilities?.sessionCapabilities;
    this.capabilities = {
      list: Boolean(sessionCapabilities?.list),
      load: Boolean(initialized.agentCapabilities?.loadSession),
      resume: Boolean(sessionCapabilities?.resume),
      delete: Boolean(sessionCapabilities?.delete),
      close: Boolean(sessionCapabilities?.close),
    };

    let resumed = false;
    const requestedSessionId = this.options.resumeSessionId;
    if (requestedSessionId) {
      this.sessionId = requestedSessionId;
      try {
        resumed = await this.resumeOrLoad(requestedSessionId);
      } catch (error) {
        if (isAuthenticationRequired(error)) {
          await this.authenticate();
          try {
            resumed = await this.resumeOrLoad(requestedSessionId);
          } catch {
            resumed = false;
          }
        } else {
          resumed = false;
        }
      }
      if (!resumed) this.sessionId = undefined;
    }

    if (!resumed) {
      const response = await this.createSession();
      this.sessionId = response.sessionId;
      this.configOptions = mapConfigOptions(response.configOptions);
      this.availableCommands = mapAvailableCommands(
        (response as { availableCommands?: unknown }).availableCommands,
      );
    }

    for (const [configId, value] of Object.entries(
      this.options.initialConfig ?? {},
    )) {
      const current = this.configOptions.find(
        (option) => option.id === configId,
      )?.currentValue;
      if (current !== value) await this.setConfigOption(configId, value);
    }

    const model = this.configOptions.find(
      (option) => option.id === "model" || option.category === "model",
    );
    if (
      model &&
      this.options.preferredModel &&
      model.currentValue !== this.options.preferredModel
    ) {
      await this.setConfigOption(model.id, this.options.preferredModel);
    }

    if (!this.sessionId) {
      throw new Error("The agent did not return a session id.");
    }
    return {
      sessionId: this.sessionId,
      configOptions: this.configOptions,
      availableCommands: this.availableCommands,
      authMethods: this.authMethods,
      resumed,
      capabilities: this.capabilities,
    };
  }

  async prompt(prompt: string): Promise<void> {
    if (this.disposed) throw new Error("The agent session has been disposed.");
    if (this.promptRunning) throw new Error("The agent is already running.");
    if (!this.sessionId || !this.connection) {
      throw new Error("The agent session has not started.");
    }

    this.promptRunning = true;
    this.cancelRequested = false;
    try {
      try {
        await this.runPrompt(prompt);
      } catch (error) {
        if (!isAuthenticationRequired(error)) throw error;
        await this.authenticate();
        await this.runPrompt(prompt);
      }
      if (this.cancelRequested) throw cancellableAbort();
    } finally {
      this.promptRunning = false;
    }
  }

  async cancel(): Promise<void> {
    const sessionId = this.sessionId;
    const connection = this.connection;
    if (!sessionId || !connection) return;
    this.cancelRequested = true;
    await connection.agent
      .notify(acp.methods.agent.session.cancel, { sessionId })
      .catch(() => undefined);
  }

  async listSessions(): Promise<AgentRemoteSession[]> {
    const connection = this.connection;
    if (!connection || !this.capabilities.list) return [];
    const sessions: AgentRemoteSession[] = [];
    let cursor: string | undefined;
    do {
      const response = await connection.agent.request(
        acp.methods.agent.session.list,
        {
          cwd: this.options.cwd,
          ...(cursor ? { cursor } : {}),
        },
      );
      for (const session of response.sessions) {
        if (session.cwd !== this.options.cwd) continue;
        sessions.push({
          sessionId: session.sessionId,
          ...(session.title ? { title: session.title } : {}),
          ...(session.updatedAt ? { updatedAt: session.updatedAt } : {}),
        });
      }
      cursor = response.nextCursor ?? undefined;
    } while (cursor);
    return sessions;
  }

  async deleteSession(sessionId: string): Promise<void> {
    const connection = this.connection;
    if (!connection || !this.capabilities.delete) return;
    await connection.agent.request(acp.methods.agent.session.delete, {
      sessionId,
    });
  }

  async setConfigOption(
    configId: string,
    value: string,
  ): Promise<AgentConfigOption[]> {
    const sessionId = this.sessionId;
    const connection = this.connection;
    if (!sessionId || !connection) {
      throw new Error("The agent session has not started.");
    }
    const response = await connection.agent.request(
      acp.methods.agent.session.setConfigOption,
      { sessionId, configId, value },
    );
    const mapped = mapConfigOptions(response.configOptions);
    if (mapped.length > 0) {
      this.configOptions = mapped;
      this.options.onEvent({ type: "config", options: mapped });
    } else {
      this.configOptions = this.configOptions.map((option) =>
        option.id === configId ? { ...option, currentValue: value } : option,
      );
      this.options.onEvent({
        type: "config",
        options: this.configOptions,
      });
    }
    return this.configOptions;
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const sessionId = this.sessionId;
    const connection = this.connection;
    this.sessionId = undefined;
    this.connection = undefined;

    if (sessionId && connection) {
      await connection.agent
        .request(acp.methods.agent.session.close, { sessionId })
        .catch(() => undefined);
    }
    connection?.close();
  }

  private async createSession(): Promise<acp.NewSessionResponse> {
    const connection = this.connection;
    if (!connection) throw new Error("The agent connection is unavailable.");
    try {
      return await connection.agent.request(acp.methods.agent.session.new, {
        cwd: this.options.cwd,
        mcpServers: [],
      });
    } catch (error) {
      if (!isAuthenticationRequired(error)) throw error;
      await this.authenticate();
      return connection.agent.request(acp.methods.agent.session.new, {
        cwd: this.options.cwd,
        mcpServers: [],
      });
    }
  }

  private async resumeOrLoad(sessionId: string): Promise<boolean> {
    const connection = this.connection;
    if (!connection) return false;
    if (this.capabilities.resume) {
      const response = await connection.agent.request(
        acp.methods.agent.session.resume,
        {
          sessionId,
          cwd: this.options.cwd,
          mcpServers: [],
        },
      );
      this.configOptions = mapConfigOptions(response.configOptions);
      this.availableCommands = mapAvailableCommands(
        (response as { availableCommands?: unknown }).availableCommands,
      );
      return true;
    }
    if (this.capabilities.load) {
      const replay = this.options.replayHistory === true;
      this.suppressReplayUpdates = !replay;
      this.replayHistoryUpdates = replay;
      try {
        const response = await connection.agent.request(
          acp.methods.agent.session.load,
          {
            sessionId,
            cwd: this.options.cwd,
            mcpServers: [],
          },
        );
        this.configOptions = mapConfigOptions(response.configOptions);
        this.availableCommands = mapAvailableCommands(
        (response as { availableCommands?: unknown }).availableCommands,
      );
        return true;
      } finally {
        this.suppressReplayUpdates = false;
        this.replayHistoryUpdates = false;
      }
    }
    return false;
  }

  private async runPrompt(prompt: string): Promise<void> {
    const connection = this.connection;
    const sessionId = this.sessionId;
    if (!connection || !sessionId) {
      throw new Error("The agent session has not started.");
    }
    const response = connection.agent.request(
      acp.methods.agent.session.prompt,
      {
        sessionId,
        prompt: [{ type: "text", text: prompt }],
      },
    );

    for (;;) {
      const next = await this.nextUpdateOrStop(response);
      if (next.kind === "stop") {
        while (this.updateQueue.length > 0) {
          const update = this.updateQueue.shift();
          if (update) this.applyUpdate(update);
        }
        break;
      }
      this.applyUpdate(next.update);
    }
    await response;
  }

  private applyUpdate(update: acp.SessionUpdate): void {
    for (const event of mapSessionUpdate(update)) {
      if (event.type === "user" && !this.replayHistoryUpdates) continue;
      if (event.type === "config") this.configOptions = event.options;
      if (event.type === "commands") this.availableCommands = event.commands;
      this.options.onEvent(event);
    }
  }

  private pushUpdate(update: acp.SessionUpdate): void {
    const waiter = this.updateWaiters.shift();
    if (waiter) {
      waiter.accept(update);
      return;
    }
    this.updateQueue.push(update);
  }

  private nextUpdateOrStop(
    response: Promise<acp.PromptResponse>,
  ): Promise<
    | { kind: "update"; update: acp.SessionUpdate }
    | { kind: "stop" }
  > {
    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (
        value:
          | { kind: "update"; update: acp.SessionUpdate }
          | { kind: "stop" },
      ) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const waiter: UpdateWaiter = {
        accept: (update) => settle({ kind: "update", update }),
      };
      this.updateWaiters.push(waiter);
      void response.then(
        () => {
          if (!settled) {
            const index = this.updateWaiters.indexOf(waiter);
            if (index >= 0) this.updateWaiters.splice(index, 1);
          }
          settle({ kind: "stop" });
        },
        (error: unknown) => {
          if (!settled) {
            const index = this.updateWaiters.indexOf(waiter);
            if (index >= 0) this.updateWaiters.splice(index, 1);
          }
          reject(error);
        },
      );
    });
  }

  private async authenticate(): Promise<void> {
    const connection = this.connection;
    if (!connection) throw new Error("The agent session has not started.");
    if (this.authMethods.length === 0 || !this.options.authenticate) {
      throw new Error(
        "The agent requires authentication. Sign in with the agent CLI, then open a new thread.",
      );
    }
    const decision = await this.options.authenticate({
      agentId: this.options.agentId,
      methods: this.authMethods,
    });
    if (decision.type === "cancelled") throw cancellableAbort();
    if (decision.type === "agent") {
      await connection.agent.request(acp.methods.agent.authenticate, {
        methodId: decision.methodId,
      });
    }
  }
}
