import { Readable, Writable } from "node:stream";
import {
  agent,
  methods,
  ndJsonStream,
  PROTOCOL_VERSION,
} from "@agentclientprotocol/sdk";

const app = agent({ name: "latex-comfort-test-agent" })
  .onRequest(methods.agent.initialize, () => ({
    protocolVersion: PROTOCOL_VERSION,
    agentCapabilities: {},
    agentInfo: { name: "latex-comfort-test-agent", version: "1.0.0" },
  }))
  .onRequest(methods.agent.session.new, () => ({ sessionId: "fake-session" }))
  .onRequest(methods.agent.session.prompt, async ({ client, params }) => {
    await client.notify(methods.client.session.update, {
      sessionId: params.sessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Hello from the fake agent." },
      },
    });
    return { stopReason: "end_turn" };
  })
  .onRequest(methods.agent.session.close, () => ({}));

const connection = app.connect(
  ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)),
);

await connection.closed;
