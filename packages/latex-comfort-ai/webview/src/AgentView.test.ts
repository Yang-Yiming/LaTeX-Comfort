import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AgentUiSnapshot } from "@latex-comfort/shared";
import { AgentView, fileMentionQuery, slashCommandQuery } from "./AgentView";

function snapshot(overrides: Partial<AgentUiSnapshot> = {}): AgentUiSnapshot {
  return {
    revision: 1,
    threadId: "thread-1",
    agentId: "opencode",
    agentLabel: "OpenCode",
    phase: "idle",
    approvalMode: "approval-required",
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
    availableCommands: [],
    promptCapabilities: {
      image: true,
      audio: false,
      embeddedContext: true,
    },
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
      onSelectApprovalMode: noop,
      onConfigureOpenCodeReview: noop,
      onResolvePermission: noop,
      onOpenPermissionDiff: noop,
      onAuthenticate: noop,
      onOpenDiff: noop,
      onOpenTurnDiffs: noop,
      onRestoreTurn: noop,
      onOpenLocation: noop,
      onOpenSettings: noop,
      fileMentions: null,
      onSearchFiles: noop,
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

  it("detects slash command and file mention queries", () => {
    expect(slashCommandQuery("/")).toBe("");
    expect(slashCommandQuery("/rev")).toBe("rev");
    expect(slashCommandQuery("/review focus")).toBeNull();
    expect(slashCommandQuery("please /review")).toBeNull();
    expect(fileMentionQuery("@")).toEqual({ query: "", start: 0 });
    expect(fileMentionQuery("use @intro")).toEqual({ query: "intro", start: 4 });
    expect(fileMentionQuery("use @intro now")).toBeNull();
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
            attachments: [{ name: "figure.png", kind: "image" }],
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
            toolKind: "edit",
            diffs: [
              {
                path: "main.tex",
                oldText: "old sentence\n",
                newText: "new sentence\n",
                additions: 1,
                deletions: 1,
                hunks: [
                  {
                    beforeText: "old sentence\n",
                    afterText: "new sentence\n",
                    beforeStart: 3,
                    afterStart: 3,
                  },
                ],
              },
            ],
            options: [
              { id: "allow", label: "Allow once", kind: "allow_once" },
              { id: "reject", label: "Reject", kind: "reject_once" },
            ],
          },
        ],
      }),
    );

    expect(html).toContain("Fix the introduction");
    expect(html).toContain("figure.png");
    expect(html).toContain("I will update the paragraph.");
    expect(html).toContain("Edit main.tex");
    expect(html).toContain("Approve this tool call?");
    expect(html).toContain("Allow once");
    expect(html).toContain("Reject");
    expect(html).toContain("Waiting for permission");
    expect(html).toContain("Open full diff");
    expect(html).toContain("− old sentence");
    expect(html).toContain("+ new sentence");
  });

  it("renders the approval mode picker and auto-resolved edits", () => {
    const html = render(
      snapshot({
        approvalMode: "auto",
        entries: [
          {
            type: "permission",
            id: "permission-1",
            at: 4,
            title: "Edit main.tex",
            toolKind: "edit",
            autoResolved: true,
            resolvedOptionId: "allow",
            diffs: [
              {
                path: "main.tex",
                oldText: "",
                newText: "new line\n",
                additions: 1,
                deletions: 0,
                hunks: [
                  {
                    beforeText: "",
                    afterText: "new line\n",
                    beforeStart: 0,
                    afterStart: 0,
                  },
                ],
              },
            ],
            options: [
              { id: "allow", label: "Allow once", kind: "allow_once" },
              { id: "reject", label: "Reject", kind: "reject_once" },
            ],
          },
        ],
      }),
    );

    expect(html).toContain("Ask for risky actions");
    expect(html).toContain("Auto-allowed");
    expect(html).toContain("+1 −0");
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
