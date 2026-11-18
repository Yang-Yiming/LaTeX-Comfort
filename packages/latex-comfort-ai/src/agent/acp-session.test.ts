import * as acp from "@agentclientprotocol/sdk";
import { describe, expect, it } from "vitest";
import { runAcpSession } from "./acp-session";
import type { AgentEvent } from "./types";

describe("runAcpSession", () => {
  it("initializes, prompts, maps updates, and resolves a permission request", async () => {
    const events: AgentEvent[] = [];
    const permissions: string[] = [];

    const fakeAgent = acp
      .agent({ name: "fake-agent" })
      .onRequest(acp.methods.agent.initialize, () => ({
        protocolVersion: acp.PROTOCOL_VERSION,
        agentCapabilities: {},
        agentInfo: { name: "fake-agent", version: "1.0.0" },
      }))
      .onRequest(acp.methods.agent.session.new, () => ({
        sessionId: "session-1",
      }))
      .onRequest(acp.methods.agent.session.prompt, async ({ client, params }) => {
        await client.notify(acp.methods.client.session.update, {
          sessionId: params.sessionId,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "Hello" },
          },
        });
        const answer = await client.request(
          acp.methods.client.session.requestPermission,
          {
            sessionId: params.sessionId,
            toolCall: {
              toolCallId: "tool-1",
              title: "Run a test",
              status: "pending",
            },
            options: [
              {
                optionId: "allow",
                name: "Allow once",
                kind: "allow_once",
              },
            ],
          },
        );
        if (answer.outcome.outcome !== "selected") {
          throw new Error("permission was unexpectedly cancelled");
        }
        await client.notify(acp.methods.client.session.update, {
          sessionId: params.sessionId,
          update: {
            sessionUpdate: "tool_call_update",
            toolCallId: "tool-1",
            title: "Run a test",
            status: "completed",
          },
        });
        return { stopReason: "end_turn" };
      });

    await runAcpSession({
      target: fakeAgent,
      cwd: "/workspace",
      prompt: "Do the task",
      onEvent: (event) => events.push(event),
      requestPermission: async (request) => {
        permissions.push(request.title);
        return request.options[0]?.id;
      },
    });

    expect(permissions).toEqual(["Run a test"]);
    expect(events).toEqual([
      { type: "text", text: "Hello" },
      { type: "tool", title: "Run a test", status: "completed" },
    ]);
  });

  it("rejects when the agent negotiates an unsupported protocol version", async () => {
    const fakeAgent = acp
      .agent({ name: "future-agent" })
      .onRequest(acp.methods.agent.initialize, () => ({
        protocolVersion: acp.PROTOCOL_VERSION + 1,
      }));

    await expect(
      runAcpSession({
        target: fakeAgent,
        cwd: "/workspace",
        prompt: "Do the task",
        onEvent: () => undefined,
        requestPermission: async () => undefined,
      }),
    ).rejects.toThrow("protocol version");
  });
});
