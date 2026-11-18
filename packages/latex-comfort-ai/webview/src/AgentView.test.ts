import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AgentUiSnapshot } from "@latex-comfort/shared";
import { AgentView } from "./AgentView";

function snapshot(overrides: Partial<AgentUiSnapshot> = {}): AgentUiSnapshot {
  return {
    revision: 1,
    threadId: "thread-1",
    agentId: "opencode",
    agentLabel: "OpenCode",
    phase: "idle",
    title: "New thread",
    entries: [],
    configOptions: [
      {
        id: "model",
        name: "Model",
        category: "model",
        currentValue: "provider/model",
        options: [
          { value: "provider/model", label: "Model One" },
          { value: "provider/other", label: "Model Two" },
        ],
      },
    ],
    currentModel: "provider/model",
    authMethods: [],
    threads: [],
    turns: [],
    ...overrides,
  };
}

const noop = vi.fn();

function render(value: AgentUiSnapshot): string {
  return renderToStaticMarkup(
    createElement(AgentView, {
      snapshot: value,
      onSend: noop,
      onCancel: noop,
      onNewThread: noop,
      onOpenThread: noop,
      onDeleteThread: noop,
      onSelectAgent: noop,
      onSelectConfig: noop,
      onResolvePermission: noop,
      onAuthenticate: noop,
      onOpenDiff: noop,
      onOpenTurnDiffs: noop,
      onRestoreTurn: noop,
      onOpenLocation: noop,
      onOpenSettings: noop,
    }),
  );
}

describe("AgentView", () => {
  it("renders Lattice's new-thread starters, composer, and model control", () => {
    const html = render(snapshot());

    expect(html).toContain("lattice-empty-thread");
    expect(html).toContain("Work on this paper");
    expect(html).toContain("Polish");
    expect(html).toContain("Revise");
    expect(html).toContain("Proofread");
    expect(html).toContain("Check references");
    expect(html).toContain("Model One");
    expect(html).toContain("OpenCode");
    expect(html).toContain("Do anything in Lattice");
  });

  it("renders messages, tools, and an inline permission card", () => {
    const html = render(
      snapshot({
        phase: "waiting_permission",
        entries: [
          {
            type: "user",
            id: "user-1",
            at: 1,
            text: "Fix the introduction",
            contextLabel: "main.tex · selection",
          },
          {
            type: "assistant",
            id: "message-1",
            at: 2,
            text: "I will update the paragraph.",
          },
          {
            type: "tool",
            id: "tool:tool-1",
            at: 3,
            toolCallId: "tool-1",
            title: "Edit main.tex",
            kind: "edit",
            status: "pending",
            locations: [{ path: "main.tex", line: 12 }],
          },
          {
            type: "permission",
            id: "permission-1",
            at: 4,
            title: "Edit main.tex",
            options: [
              { id: "allow", label: "Allow once", kind: "allow_once" },
              { id: "reject", label: "Reject", kind: "reject_once" },
            ],
          },
        ],
      }),
    );

    expect(html).toContain("Fix the introduction");
    expect(html).toContain("I will update the paragraph.");
    expect(html).toContain("Edit main.tex");
    expect(html).toContain("Approve this tool call?");
    expect(html).toContain("Allow once");
    expect(html).toContain("Reject");
    expect(html).toContain("Waiting for permission");
  });

  it("renders authentication actions instead of a dead prompt", () => {
    const html = render(
      snapshot({
        phase: "authentication_required",
        authMethods: [
          {
            id: "login",
            label: "Sign in with OpenCode",
            type: "terminal",
          },
        ],
      }),
    );

    expect(html).toContain("Sign in required");
    expect(html).toContain("Sign in with OpenCode");
  });

  it("renders a stop control while the agent is running", () => {
    const html = render(snapshot({ phase: "running" }));
    expect(html).toContain("Stop agent");
  });
});
