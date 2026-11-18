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
      agentId: "opencode",
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

  it("selects a model before prompting", async () => {
    let selectedModel: string | undefined;
    let prompted = false;
    const configOptions: Array<Extract<acp.SessionConfigOption, { type: "select" }>> = [
      {
        id: "model",
        name: "Model",
        category: "model",
        type: "select",
        currentValue: "provider/bad-model",
        options: [
          { value: "provider/bad-model", name: "Bad model" },
          { value: "provider/good-model", name: "Good model" },
        ],
      },
    ];

    const fakeAgent = acp
      .agent({ name: "model-agent" })
      .onRequest(acp.methods.agent.initialize, () => ({
        protocolVersion: acp.PROTOCOL_VERSION,
      }))
      .onRequest(acp.methods.agent.session.new, () => ({
        sessionId: "session-model",
        configOptions,
      }))
      .onRequest(acp.methods.agent.session.setConfigOption, ({ params }) => {
        selectedModel = String(params.value);
        return {
          configOptions: configOptions.map((option) => ({
            ...option,
            currentValue: selectedModel ?? option.currentValue,
          })),
        };
      })
      .onRequest(acp.methods.agent.session.prompt, () => {
        prompted = true;
        return { stopReason: "end_turn" };
      });

    await runAcpSession({
      target: fakeAgent,
      agentId: "opencode",
      cwd: "/workspace",
      prompt: "Use the good model",
      selectModel: async (selection) => {
        expect(selection.current).toBe("provider/bad-model");
        expect(selection.options).toEqual([
          { value: "provider/bad-model", label: "Bad model" },
          { value: "provider/good-model", label: "Good model" },
        ]);
        return "provider/good-model";
      },
      onEvent: () => undefined,
      requestPermission: async () => undefined,
    });

    expect(selectedModel).toBe("provider/good-model");
    expect(prompted).toBe(true);
  });

  it("authenticates and retries the prompt once when auth is required", async () => {
    let authenticated = false;
    const events: AgentEvent[] = [];

    const fakeAgent = acp
      .agent({ name: "auth-agent" })
      .onRequest(acp.methods.agent.initialize, () => ({
        protocolVersion: acp.PROTOCOL_VERSION,
        authMethods: [
          {
            id: "fake-login",
            name: "Fake login",
            description: "Authenticate the test agent",
          },
        ],
      }))
      .onRequest(acp.methods.agent.authenticate, () => {
        authenticated = true;
        return {};
      })
      .onRequest(acp.methods.agent.session.new, () => ({
        sessionId: "session-auth",
      }))
      .onRequest(acp.methods.agent.session.prompt, async ({ client, params }) => {
        if (!authenticated) {
          throw new acp.RequestError(
            -32000,
            "Authentication required: provider authentication required",
          );
        }
        await client.notify(acp.methods.client.session.update, {
          sessionId: params.sessionId,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "Authenticated" },
          },
        });
        return { stopReason: "end_turn" };
      });

    await runAcpSession({
      target: fakeAgent,
      agentId: "opencode",
      cwd: "/workspace",
      prompt: "Run after login",
      authenticate: async ({ methods }) => {
        expect(methods).toEqual([
          {
            id: "fake-login",
            label: "Fake login",
            description: "Authenticate the test agent",
            type: "agent",
          },
        ]);
        return { type: "agent", methodId: "fake-login" };
      },
      onEvent: (event) => events.push(event),
      requestPermission: async () => undefined,
    });

    expect(authenticated).toBe(true);
    expect(events).toEqual([{ type: "text", text: "Authenticated" }]);
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
        agentId: "opencode",
        cwd: "/workspace",
        prompt: "Do the task",
        onEvent: () => undefined,
        requestPermission: async () => undefined,
      }),
    ).rejects.toThrow("protocol version");
  });
});
