import type {
  AgentCommand,
  AgentConfigOption,
  AgentEvent,
  AgentToolLocation,
  AgentModelOption,
} from "./types";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textContent(value: unknown): string | undefined {
  if (!isRecord(value) || value.type !== "text") return undefined;
  return typeof value.text === "string" ? value.text : undefined;
}

function locations(value: unknown): AgentToolLocation[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result = value.flatMap((entry): AgentToolLocation[] => {
    if (!isRecord(entry) || typeof entry.path !== "string" || !entry.path) {
      return [];
    }
    return [
      {
        path: entry.path,
        ...(typeof entry.line === "number" ? { line: entry.line } : {}),
      },
    ];
  });
  return result.length > 0 ? result : undefined;
}

function modelOptions(value: unknown): AgentModelOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): AgentModelOption[] => {
    if (!isRecord(entry) || typeof entry.value !== "string") return [];
    return [
      {
        value: entry.value,
        label:
          typeof entry.name === "string" && entry.name.trim()
            ? entry.name
            : entry.value,
      },
    ];
  });
}

export function mapAvailableCommands(value: unknown): AgentCommand[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): AgentCommand[] => {
    if (
      !isRecord(entry) ||
      typeof entry.name !== "string" ||
      !entry.name.trim() ||
      typeof entry.description !== "string"
    ) {
      return [];
    }
    const input = isRecord(entry.input) ? entry.input : undefined;
    return [
      {
        name: entry.name.trim(),
        description: entry.description.trim(),
        ...(typeof input?.hint === "string" && input.hint.trim()
          ? { inputHint: input.hint.trim() }
          : {}),
      },
    ];
  });
}

export function mapConfigOptions(value: unknown): AgentConfigOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): AgentConfigOption[] => {
    if (
      !isRecord(entry) ||
      typeof entry.id !== "string" ||
      typeof entry.name !== "string" ||
      entry.type !== "select"
    ) {
      return [];
    }
    return [
      {
        id: entry.id,
        name: entry.name,
        ...(typeof entry.category === "string"
          ? { category: entry.category }
          : {}),
        ...(typeof entry.currentValue === "string"
          ? { currentValue: entry.currentValue }
          : {}),
        options: modelOptions(entry.options),
      },
    ];
  });
}

function toolEvent(update: UnknownRecord): AgentEvent | undefined {
  if (typeof update.toolCallId !== "string" || !update.toolCallId) {
    return undefined;
  }
  const title =
    typeof update.title === "string" && update.title.trim()
      ? update.title.trim()
      : undefined;
  const name =
    typeof update.name === "string" && update.name.trim()
      ? update.name.trim()
      : undefined;
  const kind = typeof update.kind === "string" ? update.kind : undefined;
  const status = typeof update.status === "string" ? update.status : undefined;
  const toolLocations = locations(update.locations);
  return {
    type: "tool",
    toolCallId: update.toolCallId,
    ...(title ? { title } : {}),
    ...(name ? { name } : {}),
    ...(kind ? { kind } : {}),
    ...(status ? { status } : {}),
    ...(toolLocations ? { locations: toolLocations } : {}),
  };
}

export function mapSessionUpdate(update: unknown): AgentEvent[] {
  if (!isRecord(update) || typeof update.sessionUpdate !== "string") return [];

  switch (update.sessionUpdate) {
    case "user_message_chunk": {
      const text = textContent(update.content);
      return text
        ? [
            {
              type: "user",
              ...(typeof update.messageId === "string"
                ? { messageId: update.messageId }
                : {}),
              text,
            },
          ]
        : [];
    }
    case "agent_message_chunk": {
      const text = textContent(update.content);
      return text
        ? [
            {
              type: "text",
              ...(typeof update.messageId === "string"
                ? { messageId: update.messageId }
                : {}),
              text,
            },
          ]
        : [];
    }
    case "agent_thought_chunk": {
      const text = textContent(update.content);
      return text
        ? [
            {
              type: "thinking",
              ...(typeof update.messageId === "string"
                ? { messageId: update.messageId }
                : {}),
              text,
            },
          ]
        : [];
    }
    case "tool_call":
    case "tool_call_update": {
      const event = toolEvent(update);
      return event ? [event] : [];
    }
    case "config_option_update":
      return [{ type: "config", options: mapConfigOptions(update.configOptions) }];
    case "available_commands_update":
      return [{ type: "commands", commands: mapAvailableCommands(update.availableCommands) }];
    case "notice": {
      const title = typeof update.title === "string" ? update.title.trim() : "";
      const description =
        typeof update.description === "string" ? update.description.trim() : "";
      const message = [title, description].filter(Boolean).join(title && description ? ": " : "");
      return message
        ? [
            {
              type: "notice",
              ...(typeof update.severity === "string"
                ? { severity: update.severity }
                : {}),
              message,
            },
          ]
        : [];
    }
    default:
      return [];
  }
}
