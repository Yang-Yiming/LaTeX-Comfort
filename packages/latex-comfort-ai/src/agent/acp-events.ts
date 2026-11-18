import type { AgentEvent } from "./types";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textContent(value: unknown): string | undefined {
  if (!isRecord(value) || value.type !== "text") return undefined;
  return typeof value.text === "string" ? value.text : undefined;
}

function toolEvent(update: UnknownRecord): AgentEvent | undefined {
  const title =
    typeof update.title === "string" && update.title.trim()
      ? update.title.trim()
      : typeof update.name === "string" && update.name.trim()
        ? update.name.trim()
        : "Tool call";
  const status = typeof update.status === "string" ? update.status : undefined;
  return { type: "tool", title, ...(status ? { status } : {}) };
}

export function mapSessionUpdate(update: unknown): AgentEvent[] {
  if (!isRecord(update) || typeof update.sessionUpdate !== "string") return [];

  switch (update.sessionUpdate) {
    case "agent_message_chunk": {
      const text = textContent(update.content);
      return text ? [{ type: "text", text }] : [];
    }
    case "agent_thought_chunk": {
      const text = textContent(update.content);
      return text ? [{ type: "thinking", text }] : [];
    }
    case "tool_call":
    case "tool_call_update": {
      const event = toolEvent(update);
      return event ? [event] : [];
    }
    case "notice": {
      const title = typeof update.title === "string" ? update.title.trim() : "";
      const description =
        typeof update.description === "string" ? update.description.trim() : "";
      const message = [title, description].filter(Boolean).join(title && description ? ": " : "");
      return message ? [{ type: "notice", message }] : [];
    }
    default:
      return [];
  }
}
