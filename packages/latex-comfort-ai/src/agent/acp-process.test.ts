import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runAcpAgent } from "./runner";
import type { AgentEvent } from "./types";

const FAKE_AGENT = fileURLToPath(
  new URL("./test-fixtures/fake-acp-agent.mjs", import.meta.url),
);

describe("runAcpAgent", () => {
  it("runs a real stdio ACP child and streams its response", async () => {
    const events: AgentEvent[] = [];

    await runAcpAgent({
      definition: {
        id: "codex",
        label: "Fake ACP",
        command: process.execPath,
        args: [FAKE_AGENT],
        env: undefined,
        missingCommandMessage: "fake agent missing",
      },
      cwd: process.cwd(),
      prompt: "Say hello",
      onEvent: (event) => events.push(event),
      requestPermission: async () => undefined,
    });

    expect(events).toEqual([
      { type: "text", text: "Hello from the fake agent." },
    ]);
  });
});
