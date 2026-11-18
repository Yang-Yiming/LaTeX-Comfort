import * as acp from "@agentclientprotocol/sdk";
import { describe, expect, it, vi } from "vitest";
import { InteractiveAcpSession } from "./interactive-session";
import type { AgentEvent } from "./types";

describe("InteractiveAcpSession", () => {
  it("keeps one ACP session across multiple prompt turns", async () => {
    let promptCount = 0;
    const events: AgentEvent[] = [];

    const fakeAgent = acp
      .agent({ name: "interactive-agent" })
      .onRequest(acp.methods.agent.initialize, () => ({
        protocolVersion: acp.PROTOCOL_VERSION,
      }))
      .onRequest(acp.methods.agent.session.new, () => ({
        sessionId: "session-interactive",
        configOptions: [
          {
            id: "model",
            name: "Model",
            category: "model",
            type: "select",
            currentValue: "provider/current",
            options: [
              { value: "provider/current", name: "Current" },
              { value: "provider/next", name: "Next" },
            ],
          },
        ],
        availableCommands: [
          {
            name: "review",
            description: "Review the current selection",
            input: { hint: "What should the review focus on?" },
          },
        ],
      }))
      .onRequest(acp.methods.agent.session.prompt, async ({ client, params }) => {
        promptCount += 1;
        await client.notify(acp.methods.client.session.update, {
          sessionId: params.sessionId,
          update: {
            sessionUpdate: "agent_message_chunk",
            messageId: `message-${promptCount}`,
            content: { type: "text", text: `Reply ${promptCount}` },
          },
        });
        return { stopReason: "end_turn" };
      });

    const session = new InteractiveAcpSession({
      target: fakeAgent,
      agentId: "opencode",
      cwd: "/workspace",
      onEvent: (event) => events.push(event),
      requestPermission: async () => undefined,
    });

    const started = await session.start();
    expect(started.sessionId).toBe("session-interactive");
    expect(started.availableCommands).toEqual([
      {
        name: "review",
        description: "Review the current selection",
        inputHint: "What should the review focus on?",
      },
    ]);
    expect(started.configOptions[0]).toEqual({
      id: "model",
      name: "Model",
      category: "model",
      currentValue: "provider/current",
      options: [
        { value: "provider/current", label: "Current" },
        { value: "provider/next", label: "Next" },
      ],
    });

    await session.prompt("First");
    await session.prompt("Second");
    await session.dispose();

    expect(promptCount).toBe(2);
    expect(events).toEqual([
      { type: "text", messageId: "message-1", text: "Reply 1" },
      { type: "text", messageId: "message-2", text: "Reply 2" },
    ]);
  });

  it("preserves tool identity and asks for permission inline", async () => {
    const events: AgentEvent[] = [];
    const requestPermission = vi.fn(async () => "allow");

    const fakeAgent = acp
      .agent({ name: "tool-agent" })
      .onRequest(acp.methods.agent.initialize, () => ({
        protocolVersion: acp.PROTOCOL_VERSION,
      }))
      .onRequest(acp.methods.agent.session.new, () => ({
        sessionId: "session-tools",
      }))
      .onRequest(acp.methods.agent.session.prompt, async ({ client, params }) => {
        await client.notify(acp.methods.client.session.update, {
          sessionId: params.sessionId,
          update: {
            sessionUpdate: "tool_call",
            toolCallId: "tool-7",
            title: "Edit main.tex",
            name: "edit",
            kind: "edit",
            status: "pending",
            locations: [{ path: "/workspace/main.tex", line: 12 }],
          },
        });
        const answer = await client.request(
          acp.methods.client.session.requestPermission,
          {
            sessionId: params.sessionId,
            toolCall: {
              toolCallId: "tool-7",
              title: "Edit main.tex",
              status: "pending",
              locations: [{ path: "/workspace/main.tex", line: 12 }],
            },
            options: [
              { optionId: "allow", name: "Allow once", kind: "allow_once" },
              { optionId: "reject", name: "Reject", kind: "reject_once" },
            ],
          },
        );
        if (answer.outcome.outcome !== "selected") {
          throw new Error("permission was cancelled");
        }
        await client.notify(acp.methods.client.session.update, {
          sessionId: params.sessionId,
          update: {
            sessionUpdate: "tool_call_update",
            toolCallId: "tool-7",
            status: "completed",
          },
        });
        return { stopReason: "end_turn" };
      });

    const session = new InteractiveAcpSession({
      target: fakeAgent,
      agentId: "opencode",
      cwd: "/workspace",
      onEvent: (event) => events.push(event),
      requestPermission,
    });

    await session.start();
    await session.prompt("Edit the paragraph");
    await session.dispose();

    expect(requestPermission).toHaveBeenCalledWith({
      toolCallId: "tool-7",
      title: "Edit main.tex",
      locations: [{ path: "/workspace/main.tex", line: 12 }],
      options: [
        { id: "allow", label: "Allow once", kind: "allow_once" },
        { id: "reject", label: "Reject", kind: "reject_once" },
      ],
    });
    expect(events).toEqual([
      {
        type: "tool",
        toolCallId: "tool-7",
        title: "Edit main.tex",
        name: "edit",
        kind: "edit",
        status: "pending",
        locations: [{ path: "/workspace/main.tex", line: 12 }],
      },
      {
        type: "tool",
        toolCallId: "tool-7",
        status: "completed",
      },
    ]);
  });

  it("updates a select config option through the agent", async () => {
    let selected: string | undefined;
    const fakeAgent = acp
      .agent({ name: "config-agent" })
      .onRequest(acp.methods.agent.initialize, () => ({
        protocolVersion: acp.PROTOCOL_VERSION,
      }))
      .onRequest(acp.methods.agent.session.new, () => ({
        sessionId: "session-config",
        configOptions: [
          {
            id: "model",
            name: "Model",
            category: "model",
            type: "select",
            currentValue: "provider/current",
            options: [
              { value: "provider/current", name: "Current" },
              { value: "provider/next", name: "Next" },
            ],
          },
        ],
      }))
      .onRequest(acp.methods.agent.session.setConfigOption, ({ params }) => {
        selected = String(params.value);
        return {
          configOptions: [
            {
              id: "model",
              name: "Model",
              category: "model",
              type: "select",
              currentValue: selected,
              options: [
                { value: "provider/current", name: "Current" },
                { value: "provider/next", name: "Next" },
              ],
            },
          ],
        };
      })
      .onRequest(acp.methods.agent.session.prompt, () => ({
        stopReason: "end_turn",
      }));

    const session = new InteractiveAcpSession({
      target: fakeAgent,
      agentId: "opencode",
      cwd: "/workspace",
      onEvent: () => undefined,
      requestPermission: async () => undefined,
    });

    const started = await session.start();
    const updated = await session.setConfigOption("model", "provider/next");
    await session.dispose();

    expect(selected).toBe("provider/next");
    expect(started.configOptions[0]?.currentValue).toBe("provider/current");
    expect(updated[0]?.currentValue).toBe("provider/next");
  });
});
