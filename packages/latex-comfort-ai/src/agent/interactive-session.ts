import * as acp from "@agentclientprotocol/sdk";
import { mapConfigOptions, mapSessionUpdate } from "./acp-events";
import type {
  AgentAuthMethod,
  AgentConfigOption,
  AgentEvent,
  AgentPermissionRequest,
} from "./types";

type AgentDecision =
  | { type: "agent"; methodId: string }
  | { type: "completed" }
  | { type: "cancelled" };

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
}

export interface InteractiveSessionStart {
  sessionId: string;
  configOptions: AgentConfigOption[];
  authMethods: AgentAuthMethod[];
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
  private activeSession: acp.ActiveSession | undefined;
  private authMethods: AgentAuthMethod[] = [];
  private configOptions: AgentConfigOption[] = [];
  private disposed = false;
  private promptRunning = false;
  private cancelRequested = false;

  constructor(private readonly options: InteractiveAcpSessionOptions) {}

  async start(): Promise<InteractiveSessionStart> {
    if (this.disposed) throw new Error("The agent session has been disposed.");
    if (this.activeSession) {
      return {
        sessionId: this.activeSession.sessionId,
        configOptions: this.configOptions,
        authMethods: this.authMethods,
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
      );

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

    let session: acp.ActiveSession;
    try {
      session = await ctx.buildSession(this.options.cwd).start();
    } catch (error) {
      if (!isAuthenticationRequired(error)) throw error;
      await this.authenticate();
      session = await ctx.buildSession(this.options.cwd).start();
    }
    this.activeSession = session;
    this.configOptions = mapConfigOptions(session.newSessionResponse.configOptions);

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

    return {
      sessionId: session.sessionId,
      configOptions: this.configOptions,
      authMethods: this.authMethods,
    };
  }

  async prompt(prompt: string): Promise<void> {
    if (this.disposed) throw new Error("The agent session has been disposed.");
    if (this.promptRunning) throw new Error("The agent is already running.");
    const session = this.activeSession;
    const connection = this.connection;
    if (!session || !connection) {
      throw new Error("The agent session has not started.");
    }

    this.promptRunning = true;
    this.cancelRequested = false;
    try {
      try {
        await this.runPrompt(session, prompt);
      } catch (error) {
        if (!isAuthenticationRequired(error)) throw error;
        await this.authenticate();
        await this.runPrompt(session, prompt);
      }
      if (this.cancelRequested) throw cancellableAbort();
    } finally {
      this.promptRunning = false;
    }
  }

  async cancel(): Promise<void> {
    const session = this.activeSession;
    const connection = this.connection;
    if (!session || !connection) return;
    this.cancelRequested = true;
    await connection.agent
      .notify(acp.methods.agent.session.cancel, {
        sessionId: session.sessionId,
      })
      .catch(() => undefined);
  }

  async setConfigOption(
    configId: string,
    value: string,
  ): Promise<AgentConfigOption[]> {
    const session = this.activeSession;
    const connection = this.connection;
    if (!session || !connection) {
      throw new Error("The agent session has not started.");
    }
    const response = await connection.agent.request(
      acp.methods.agent.session.setConfigOption,
      {
        sessionId: session.sessionId,
        configId,
        value,
      },
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
    const session = this.activeSession;
    const connection = this.connection;
    this.activeSession = undefined;
    this.connection = undefined;

    session?.dispose();
    if (session && connection) {
      await connection.agent
        .request(acp.methods.agent.session.close, {
          sessionId: session.sessionId,
        })
        .catch(() => undefined);
    }
    connection?.close();
  }

  private async runPrompt(
    session: acp.ActiveSession,
    prompt: string,
  ): Promise<void> {
    const response = session.prompt(prompt);
    for (;;) {
      const message = await session.nextUpdate();
      if (message.kind === "stop") break;
      for (const event of mapSessionUpdate(message.update)) {
        if (event.type === "config") this.configOptions = event.options;
        this.options.onEvent(event);
      }
    }
    await response;
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
