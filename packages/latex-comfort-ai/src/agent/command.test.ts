import { describe, expect, it, vi } from "vitest";
import { runAgentCommand } from "./command";
import type { AgentSettings } from "./types";

const SETTINGS: AgentSettings = {
  opencodePath: "opencode",
  codexAcpPath: "codex-acp",
  codexPath: "codex",
};

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    settings: SETTINGS,
    selectAgent: vi.fn(async () => "opencode" as const),
    inputPrompt: vi.fn(async () => "Proofread the project"),
    workspaceDirectory: vi.fn(() => "/workspace"),
    activeFileDirectory: vi.fn(() => "/workspace/paper"),
    requestPermission: vi.fn(async () => undefined),
    withCancellation: vi.fn(async (task: (signal: AbortSignal) => Promise<void>) =>
      task(new AbortController().signal),
    ),
    runAgent: vi.fn(async () => undefined),
    output: {
      show: vi.fn(),
      append: vi.fn(),
      appendLine: vi.fn(),
    },
    ...overrides,
  };
}

describe("runAgentCommand", () => {
  it("uses the workspace folder and runs the selected agent", async () => {
    const deps = dependencies();

    await runAgentCommand(deps);

    expect(deps.runAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        definition: expect.objectContaining({
          id: "opencode",
          command: "opencode",
          args: ["acp"],
        }),
        cwd: "/workspace",
        prompt: "Proofread the project",
      }),
    );
    expect(deps.output.show).toHaveBeenCalled();
  });

  it("falls back to the active file directory", async () => {
    const deps = dependencies({
      workspaceDirectory: vi.fn(() => undefined),
    });

    await runAgentCommand(deps);

    expect(deps.runAgent).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: "/workspace/paper" }),
    );
  });

  it("rejects when there is no workspace or file directory", async () => {
    const deps = dependencies({
      workspaceDirectory: vi.fn(() => undefined),
      activeFileDirectory: vi.fn(() => undefined),
    });

    await expect(runAgentCommand(deps)).rejects.toThrow("Open a folder");
    expect(deps.runAgent).not.toHaveBeenCalled();
  });

  it("does nothing when the agent or prompt selection is dismissed", async () => {
    const noAgent = dependencies({ selectAgent: vi.fn(async () => undefined) });
    await runAgentCommand(noAgent);
    expect(noAgent.runAgent).not.toHaveBeenCalled();

    const noPrompt = dependencies({ inputPrompt: vi.fn(async () => "  ") });
    await runAgentCommand(noPrompt);
    expect(noPrompt.runAgent).not.toHaveBeenCalled();
  });

  it("treats cancellation as a completed command", async () => {
    const abort = new Error("cancelled");
    abort.name = "AbortError";
    const deps = dependencies({
      runAgent: vi.fn(async () => {
        throw abort;
      }),
    });

    await expect(runAgentCommand(deps)).resolves.toBeUndefined();
    expect(deps.output.appendLine).toHaveBeenCalledWith("Agent run cancelled.");
  });

  it("streams text and tool events to the output channel", async () => {
    const deps = dependencies({
      runAgent: vi.fn(async (request: { onEvent(event: unknown): void }) => {
        request.onEvent({ type: "text", text: "Hello" });
        request.onEvent({ type: "tool", title: "Read main.tex", status: "completed" });
      }),
    });

    await runAgentCommand(deps);

    expect(deps.output.append).toHaveBeenCalledWith("Hello");
    expect(deps.output.appendLine).toHaveBeenCalledWith(
      "[tool] Read main.tex (completed)",
    );
  });
});
