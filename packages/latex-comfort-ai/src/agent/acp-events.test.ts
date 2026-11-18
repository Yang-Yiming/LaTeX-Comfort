import { describe, expect, it } from "vitest";
import { mapSessionUpdate } from "./acp-events";

describe("mapSessionUpdate", () => {
  it("maps streamed agent text with its message id", () => {
    expect(
      mapSessionUpdate({
        sessionUpdate: "agent_message_chunk",
        messageId: "message-1",
        content: { type: "text", text: "Hello" },
      }),
    ).toEqual([{ type: "text", messageId: "message-1", text: "Hello" }]);
  });

  it("maps streamed agent thinking", () => {
    expect(
      mapSessionUpdate({
        sessionUpdate: "agent_thought_chunk",
        content: { type: "text", text: "Considering" },
      }),
    ).toEqual([{ type: "thinking", text: "Considering" }]);
  });

  it("maps a new tool call with stable identity and locations", () => {
    expect(
      mapSessionUpdate({
        sessionUpdate: "tool_call",
        toolCallId: "tool-1",
        title: "Read main.tex",
        name: "read",
        kind: "read",
        status: "pending",
        locations: [{ path: "/workspace/main.tex", line: 12 }],
      }),
    ).toEqual([
      {
        type: "tool",
        toolCallId: "tool-1",
        title: "Read main.tex",
        name: "read",
        kind: "read",
        status: "pending",
        locations: [{ path: "/workspace/main.tex", line: 12 }],
      },
    ]);
  });

  it("maps a tool call update without losing its identity", () => {
    expect(
      mapSessionUpdate({
        sessionUpdate: "tool_call_update",
        toolCallId: "tool-1",
        status: "completed",
      }),
    ).toEqual([{ type: "tool", toolCallId: "tool-1", status: "completed" }]);
  });

  it("maps model config options", () => {
    expect(
      mapSessionUpdate({
        sessionUpdate: "config_option_update",
        configOptions: [
          {
            id: "model",
            name: "Model",
            category: "model",
            type: "select",
            currentValue: "provider/model",
            options: [{ value: "provider/model", name: "Model" }],
          },
        ],
      }),
    ).toEqual([
      {
        type: "config",
        options: [
          {
            id: "model",
            name: "Model",
            category: "model",
            currentValue: "provider/model",
            options: [{ value: "provider/model", label: "Model" }],
          },
        ],
      },
    ]);
  });

  it("maps available slash commands", () => {
    expect(
      mapSessionUpdate({
        sessionUpdate: "available_commands_update",
        availableCommands: [
          {
            name: "review",
            description: "Review the current selection",
            input: { hint: "What should the review focus on?" },
          },
          { name: "compact", description: "Compact the conversation" },
          { name: "", description: "ignored" },
        ],
      }),
    ).toEqual([
      {
        type: "commands",
        commands: [
          {
            name: "review",
            description: "Review the current selection",
            inputHint: "What should the review focus on?",
          },
          { name: "compact", description: "Compact the conversation" },
        ],
      },
    ]);
  });

  it("maps session notices", () => {
    expect(
      mapSessionUpdate({
        sessionUpdate: "notice",
        severity: "warning",
        title: "Network unavailable",
        description: "The agent will retry.",
      }),
    ).toEqual([
      {
        type: "notice",
        severity: "warning",
        message: "Network unavailable: The agent will retry.",
      },
    ]);
  });

  it("maps replayed user messages and ignores unknown updates", () => {
    expect(
      mapSessionUpdate({
        sessionUpdate: "user_message_chunk",
        messageId: "user-message-1",
        content: { type: "text", text: "Hello" },
      }),
    ).toEqual([
      { type: "user", messageId: "user-message-1", text: "Hello" },
    ]);
    expect(
      mapSessionUpdate({
        sessionUpdate: "future_opencode_update",
        data: { value: true },
      }),
    ).toEqual([]);
    expect(mapSessionUpdate(null)).toEqual([]);
  });
});
