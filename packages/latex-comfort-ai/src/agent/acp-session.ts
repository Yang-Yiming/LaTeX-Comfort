import * as acp from "@agentclientprotocol/sdk";
import { mapSessionUpdate } from "./acp-events";
import {
  agentProposedDiffs,
  agentToolKind,
} from "./permission-content";
import type {
  AgentAuthMethod,
  AgentEvent,
  AgentModelOption,
  AgentModelSelection,
  AgentPermissionRequest,
} from "./types";

export interface AcpSessionOptions {
  target: acp.Stream | acp.AgentApp;
  agentId: "opencode" | "codex";
  cwd: string;
  prompt: string;
  onEvent(event: AgentEvent): void;
  requestPermission(request: AgentPermissionRequest): Promise<string | undefined>;
  selectModel?(selection: AgentModelSelection): Promise<string | undefined>;
  authenticate?(request: {
    agentId: "opencode" | "codex";
    methods: AgentAuthMethod[];
  }): Promise<
    | { type: "agent"; methodId: string }
    | { type: "completed" }
    | { type: "cancelled" }
  >;
  signal?: AbortSignal;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function flattenModelOptions(value: unknown): AgentModelOption[] {
  if (!Array.isArray(value)) return [];
  const options: AgentModelOption[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    if (typeof entry.value === "string" && typeof entry.name === "string") {
      options.push({ value: entry.value, label: entry.name });
      continue;
    }
    if (Array.isArray(entry.options)) {
      options.push(...flattenModelOptions(entry.options));
    }
  }
  return options;
}

function findModelSelection(
  response: acp.NewSessionResponse,
): { configId: string; selection: AgentModelSelection } | undefined {
  const configOptions = response.configOptions;
  if (!Array.isArray(configOptions)) return undefined;
  for (const entry of configOptions) {
    if (!isRecord(entry)) continue;
    if (entry.type !== "select") continue;
    if (entry.id !== "model" && entry.category !== "model") continue;
    const options = flattenModelOptions(entry.options);
    if (options.length === 0) continue;
    return {
      configId: typeof entry.id === "string" ? entry.id : "model",
      selection: {
        current:
          typeof entry.currentValue === "string" ? entry.currentValue : undefined,
        options,
      },
    };
  }
  return undefined;
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

export async function runAcpSession(options: AcpSessionOptions): Promise<void> {
  if (options.signal?.aborted) throw cancellableAbort();

  const client = acp
    .client({ name: "latex-comfort" })
    .onRequest(acp.methods.client.session.requestPermission, async ({ params }) => {
      const request: AgentPermissionRequest = {
        ...(params.toolCall.toolCallId
          ? { toolCallId: params.toolCall.toolCallId }
          : {}),
        ...(agentToolKind(params.toolCall.kind)
          ? { toolKind: agentToolKind(params.toolCall.kind) }
          : {}),
        title: params.toolCall.title?.trim() || "Allow this agent action?",
        ...(agentProposedDiffs(params.toolCall.content)
          ? { diffs: agentProposedDiffs(params.toolCall.content) }
          : {}),
        options: params.options.map((option) => ({
          id: option.optionId,
          label: option.name,
          kind: option.kind,
        })),
      };
      const selected = await options.requestPermission(request);
      const option = params.options.find((candidate) => candidate.optionId === selected);
      return option
        ? { outcome: { outcome: "selected", optionId: option.optionId } }
        : { outcome: { outcome: "cancelled" } };
    });

  await client.connectWith(options.target, async (ctx) => {
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

    const authMethods = (initialized.authMethods ?? []).map(authMethodView);
    const authenticate = async () => {
      if (authMethods.length === 0 || !options.authenticate) {
        throw new Error(
          "The agent requires authentication. Sign in with the agent CLI, then run the agent again.",
        );
      }
      const decision = await options.authenticate({
        agentId: options.agentId,
        methods: authMethods,
      });
      if (decision.type === "cancelled") throw cancellableAbort();
      if (decision.type === "agent") {
        await ctx.request(acp.methods.agent.authenticate, {
          methodId: decision.methodId,
        });
      }
    };

    let session: acp.ActiveSession;
    try {
      session = await ctx.buildSession(options.cwd).start();
    } catch (error) {
      if (!isAuthenticationRequired(error)) throw error;
      await authenticate();
      session = await ctx.buildSession(options.cwd).start();
    }

    try {
      const model = findModelSelection(session.newSessionResponse);
      if (model && options.selectModel) {
        const selected = await options.selectModel(model.selection);
        if (!selected) throw cancellableAbort();
        if (selected !== model.selection.current) {
          await ctx.request(acp.methods.agent.session.setConfigOption, {
            sessionId: session.sessionId,
            configId: model.configId,
            value: selected,
          });
        }
      }

      let cancelRequested = false;
      const cancel = () => {
        cancelRequested = true;
        void ctx
          .notify(acp.methods.agent.session.cancel, {
            sessionId: session.sessionId,
          })
          .catch(() => undefined);
      };
      options.signal?.addEventListener("abort", cancel, { once: true });

      const runPrompt = async () => {
        const prompt = session.prompt(options.prompt);
        for (;;) {
          const message = await session.nextUpdate();
          if (message.kind === "stop") break;
          for (const event of mapSessionUpdate(message.update)) {
            options.onEvent(event);
          }
        }
        await prompt;
      };

      try {
        try {
          await runPrompt();
        } catch (error) {
          if (!isAuthenticationRequired(error)) throw error;
          await authenticate();
          await runPrompt();
        }
        if (cancelRequested) throw cancellableAbort();
      } finally {
        options.signal?.removeEventListener("abort", cancel);
      }
    } finally {
      session.dispose();
      await ctx
        .request(acp.methods.agent.session.close, {
          sessionId: session.sessionId,
        })
        .catch(() => undefined);
    }
  });
}
