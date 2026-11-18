import { describe, expect, it } from "vitest";
import {
  addPermission,
  appendUserMessage,
  createAgentPanelState,
  reduceAgentEvent,
  resolvePermission,
} from "./panel-state";

describe("agent panel state", () => {
  it("merges streamed assistant chunks with the same message id", () => {
    let state = createAgentPanelState({
      agentId: "opencode",
      agentLabel: "OpenCode",
      now: () => 10,
    });

    state = reduceAgentEvent(state, {
      type: "text",
      messageId: "message-1",
      text: "Hello",
    });
    state = reduceAgentEvent(state, {
      type: "text",
      messageId: "message-1",
      text: " world",
    });

    expect(state.entries).toEqual([
      {
        type: "assistant",
        id: "message-1",
        at: 10,
        text: "Hello world",
        streaming: true,
      },
    ]);
  });

  it("starts a new fallback assistant message for each user turn", () => {
    let state = createAgentPanelState({
      agentId: "opencode",
      agentLabel: "OpenCode",
      now: () => 15,
    });
    state = appendUserMessage(state, "First");
    state = reduceAgentEvent(state, { type: "text", text: "Answer one" });
    state = appendUserMessage(state, "Second");
    state = reduceAgentEvent(state, { type: "text", text: "Answer two" });

    expect(
      state.entries
        .filter((entry) => entry.type === "assistant")
        .map((entry) => entry.text),
    ).toEqual(["Answer one", "Answer two"]);
  });

  it("updates one tool card by tool call id", () => {
    let state = createAgentPanelState({
      agentId: "opencode",
      agentLabel: "OpenCode",
      now: () => 20,
    });

    state = reduceAgentEvent(state, {
      type: "tool",
      toolCallId: "tool-1",
      title: "Read main.tex",
      kind: "read",
      status: "in_progress",
      locations: [{ path: "/workspace/main.tex", line: 4 }],
    });
    state = reduceAgentEvent(state, {
      type: "tool",
      toolCallId: "tool-1",
      status: "completed",
    });

    expect(state.entries).toEqual([
      {
        type: "tool",
        id: "tool:tool-1",
        toolCallId: "tool-1",
        at: 20,
        title: "Read main.tex",
        kind: "read",
        status: "completed",
        locations: [{ path: "/workspace/main.tex", line: 4 }],
      },
    ]);
  });

  it("adds a user message and resolves its inline permission", () => {
    let state = createAgentPanelState({
      agentId: "codex",
      agentLabel: "Codex",
      now: () => 30,
    });
    state = appendUserMessage(state, "Fix the build", "main.tex · selection");
    state = addPermission(state, {
      permissionId: "permission-1",
      title: "Edit main.tex",
      toolCallId: "tool-2",
      locations: [{ path: "/workspace/main.tex" }],
      options: [
        { id: "allow", label: "Allow once", kind: "allow_once" },
        { id: "reject", label: "Reject", kind: "reject_once" },
      ],
    });
    state = resolvePermission(state, "permission-1", "allow");

    expect(state.entries[0]).toEqual({
      type: "user",
      id: "user-1",
      at: 30,
      text: "Fix the build",
      contextLabel: "main.tex · selection",
    });
    expect(state.entries[1]).toEqual({
      type: "permission",
      id: "permission-1",
      at: 30,
      title: "Edit main.tex",
      toolCallId: "tool-2",
      locations: [{ path: "/workspace/main.tex" }],
      options: [
        { id: "allow", label: "Allow once", kind: "allow_once" },
        { id: "reject", label: "Reject", kind: "reject_once" },
      ],
      resolvedOptionId: "allow",
    });
  });

  it("replaces the available slash commands", () => {
    let state = createAgentPanelState({
      agentId: "opencode",
      agentLabel: "OpenCode",
      now: () => 35,
    });
    state = reduceAgentEvent(state, {
      type: "commands",
      commands: [{ name: "review", description: "Review" }],
    });
    state = reduceAgentEvent(state, {
      type: "commands",
      commands: [{ name: "compact", description: "Compact" }],
    });

    expect(state.availableCommands).toEqual([
      { name: "compact", description: "Compact" },
    ]);
  });

  it("updates model config without losing other options", () => {
    let state = createAgentPanelState({
      agentId: "opencode",
      agentLabel: "OpenCode",
      now: () => 40,
    });
    state = reduceAgentEvent(state, {
      type: "config",
      options: [
        {
          id: "model",
          name: "Model",
          category: "model",
          currentValue: "provider/one",
          options: [
            { value: "provider/one", label: "One" },
            { value: "provider/two", label: "Two" },
          ],
        },
        {
          id: "mode",
          name: "Mode",
          category: "mode",
          currentValue: "build",
          options: [{ value: "build", label: "Build" }],
        },
      ],
    });
    state = reduceAgentEvent(state, {
      type: "config",
      options: [
        {
          id: "model",
          name: "Model",
          category: "model",
          currentValue: "provider/two",
          options: [
            { value: "provider/one", label: "One" },
            { value: "provider/two", label: "Two" },
          ],
        },
      ],
    });

    expect(state.configOptions.map((option) => option.id)).toEqual([
      "model",
      "mode",
    ]);
    expect(state.currentModel).toBe("provider/two");
  });
});
