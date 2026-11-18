import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createInteractiveRuntime } from "./interactive-runtime";
import type { AgentEvent } from "./types";

const FAKE_AGENT = fileURLToPath(
  new URL("./test-fixtures/fake-acp-agent.mjs", import.meta.url),
);

describe("createInteractiveRuntime", () => {
  it("spawns a stdio ACP agent and keeps it alive for multiple prompts", async () => {
    const events: AgentEvent[] = [];
    const runtime = await createInteractiveRuntime({
      definition: {
        id: "codex",
        label: "Fake ACP",
        command: process.execPath,
        args: [FAKE_AGENT],
        missingCommandMessage: "fake agent missing",
      },
      cwd: process.cwd(),
      onEvent: (event) => events.push(event),
      requestPermission: async () => undefined,
      authenticate: async () => ({ type: "cancelled" }),
    });

    const started = await runtime.start();
    expect(started.configOptions).toEqual([]);
    await runtime.prompt("First");
    await runtime.prompt("Second");
    await runtime.dispose();

    expect(events).toEqual([
      { type: "text", text: "Hello from the fake agent." },
      { type: "text", text: "Hello from the fake agent." },
    ]);
  });
});
