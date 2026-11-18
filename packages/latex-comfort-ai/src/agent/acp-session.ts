import * as acp from "@agentclientprotocol/sdk";
import { mapSessionUpdate } from "./acp-events";
import type { AgentEvent, AgentPermissionRequest } from "./types";

export interface AcpSessionOptions {
  target: acp.Stream | acp.AgentApp;
  cwd: string;
  prompt: string;
  onEvent(event: AgentEvent): void;
  requestPermission(request: AgentPermissionRequest): Promise<string | undefined>;
  signal?: AbortSignal;
}

function cancellableAbort(): Error {
  const error = new Error("The agent run was cancelled.");
  error.name = "AbortError";
  return error;
}

export async function runAcpSession(options: AcpSessionOptions): Promise<void> {
  if (options.signal?.aborted) throw cancellableAbort();

  const client = acp
    .client({ name: "latex-comfort" })
    .onRequest(acp.methods.client.session.requestPermission, async ({ params }) => {
      const request: AgentPermissionRequest = {
        title: params.toolCall.title?.trim() || "Allow this agent action?",
        options: params.options.map((option) => ({
          id: option.optionId,
          label: option.name,
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
      },
      clientInfo: { name: "latex-comfort", version: "0.1.0" },
    });

    if (initialized.protocolVersion !== acp.PROTOCOL_VERSION) {
      throw new Error(
        `The agent negotiated unsupported ACP protocol version ${initialized.protocolVersion}.`,
      );
    }

    const session = await ctx.buildSession(options.cwd).start();
    let cancelRequested = false;
    const cancel = () => {
      cancelRequested = true;
      void ctx
        .notify(acp.methods.agent.session.cancel, { sessionId: session.sessionId })
        .catch(() => undefined);
    };
    options.signal?.addEventListener("abort", cancel, { once: true });

    try {
      const prompt = session.prompt(options.prompt);
      for (;;) {
        const message = await session.nextUpdate();
        if (message.kind === "stop") break;
        for (const event of mapSessionUpdate(message.update)) {
          options.onEvent(event);
        }
      }
      await prompt;
      if (cancelRequested) throw cancellableAbort();
    } finally {
      options.signal?.removeEventListener("abort", cancel);
      session.dispose();
      await ctx
        .request(acp.methods.agent.session.close, { sessionId: session.sessionId })
        .catch(() => undefined);
    }
  });
}
