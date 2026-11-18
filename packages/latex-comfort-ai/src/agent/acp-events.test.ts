import { describe, expect, it } from "vitest";
import { mapSessionUpdate } from "./acp-events";

describe("mapSessionUpdate", () => {
  it("maps streamed agent text", () => {
    expect(
      mapSessionUpdate({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Hello" },
      }),
    ).toEqual([{ type: "text", text: "Hello" }]);
  });

  it("maps streamed agent thinking", () => {
    expect(
      mapSessionUpdate({
        sessionUpdate: "agent_thought_chunk",
        content: { type: "text", text: "Considering" },
      }),
    ).toEqual([{ type: "thinking", text: "Considering" }]);
  });

  it("maps a new tool call", () => {
    expect(
      mapSessionUpdate({
        sessionUpdate: "tool_call",
        toolCallId: "tool-1",
        title: "Read main.tex",
        status: "pending",
      }),
    ).toEqual([{ type: "tool", title: "Read main.tex", status: "pending" }]);
  });

  it("maps a tool call update with title and status", () => {
    expect(
      mapSessionUpdate({
        sessionUpdate: "tool_call_update",
        toolCallId: "tool-1",
        title: "Read main.tex",
        status: "completed",
      }),
    ).toEqual([{ type: "tool", title: "Read main.tex", status: "completed" }]);
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
        message: "Network unavailable: The agent will retry.",
      },
    ]);
  });

  it("ignores user echoes and unknown updates", () => {
    expect(
      mapSessionUpdate({
        sessionUpdate: "user_message_chunk",
        content: { type: "text", text: "Hello" },
      }),
    ).toEqual([]);
    expect(
      mapSessionUpdate({
        sessionUpdate: "future_opencode_update",
        data: { value: true },
      }),
    ).toEqual([]);
    expect(mapSessionUpdate(null)).toEqual([]);
  });
});
