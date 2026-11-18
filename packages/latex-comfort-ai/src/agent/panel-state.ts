import type {
  AgentUiAgentId,
  AgentUiConfigOption,
  AgentUiEntry,
  AgentUiLocation,
  AgentUiOption,
  AgentUiSnapshot,
} from "@latex-comfort/shared";
import type { AgentEvent } from "./types";

export interface AgentPanelState extends AgentUiSnapshot {
  readonly nextUserId: number;
  readonly fallbackAssistantId: string;
  readonly now: () => number;
}

export interface CreateAgentPanelStateOptions {
  agentId: AgentUiAgentId;
  agentLabel: string;
  now?: () => number;
}

export function createAgentPanelState(
  options: CreateAgentPanelStateOptions,
): AgentPanelState {
  return {
    revision: 0,
    agentId: options.agentId,
    agentLabel: options.agentLabel,
    phase: "idle",
    title: "New thread",
    entries: [],
    configOptions: [],
    authMethods: [],
    nextUserId: 1,
    fallbackAssistantId: "assistant-1",
    now: options.now ?? Date.now,
  };
}

function update(
  state: AgentPanelState,
  changes: Partial<AgentUiSnapshot>,
): AgentPanelState {
  return {
    ...state,
    ...changes,
    revision: state.revision + 1,
  };
}

function mergeConfigOptions(
  previous: AgentUiConfigOption[],
  next: AgentUiConfigOption[],
): AgentUiConfigOption[] {
  const byId = new Map(previous.map((option) => [option.id, option]));
  for (const option of next) byId.set(option.id, option);
  return [...byId.values()];
}

function currentModel(options: AgentUiConfigOption[]): string | undefined {
  return options.find(
    (option) => option.id === "model" || option.category === "model",
  )?.currentValue;
}

function entryById(
  entries: AgentUiEntry[],
  id: string,
): AgentUiEntry | undefined {
  return entries.find((entry) => entry.id === id);
}

export function appendUserMessage(
  state: AgentPanelState,
  text: string,
  contextLabel?: string,
): AgentPanelState {
  const entry: AgentUiEntry = {
    type: "user",
    id: `user-${state.nextUserId}`,
    at: state.now(),
    text,
    ...(contextLabel ? { contextLabel } : {}),
  };
  return {
    ...update(state, { entries: [...state.entries, entry] }),
    nextUserId: state.nextUserId + 1,
    fallbackAssistantId: `assistant-${state.nextUserId}`,
  };
}

export function addPermission(
  state: AgentPanelState,
  request: {
    permissionId: string;
    title: string;
    toolCallId?: string;
    locations?: AgentUiLocation[];
    options: AgentUiOption[];
  },
): AgentPanelState {
  const existing = entryById(state.entries, request.permissionId);
  if (existing) return state;
  const entry: AgentUiEntry = {
    type: "permission",
    id: request.permissionId,
    at: state.now(),
    title: request.title,
    ...(request.toolCallId ? { toolCallId: request.toolCallId } : {}),
    ...(request.locations ? { locations: request.locations } : {}),
    options: request.options,
  };
  return update(state, {
    phase: "waiting_permission",
    entries: [...state.entries, entry],
  });
}

export function resolvePermission(
  state: AgentPanelState,
  permissionId: string,
  optionId?: string,
): AgentPanelState {
  let changed = false;
  const entries = state.entries.map((entry) => {
    if (entry.type !== "permission" || entry.id !== permissionId) return entry;
    changed = true;
    return {
      ...entry,
      ...(optionId ? { resolvedOptionId: optionId } : {}),
    };
  });
  if (!changed) return state;
  return update(state, {
    phase: state.phase === "waiting_permission" ? "running" : state.phase,
    entries,
  });
}

export function reduceAgentEvent(
  state: AgentPanelState,
  event: AgentEvent,
): AgentPanelState {
  switch (event.type) {
    case "text": {
      const id = event.messageId ?? state.fallbackAssistantId;
      const existing = entryById(state.entries, id);
      if (existing?.type === "assistant") {
        return update(state, {
          entries: state.entries.map((entry) =>
            entry.type === "assistant" && entry.id === id
              ? { ...entry, text: entry.text + event.text, streaming: true }
              : entry,
          ),
        });
      }
      return update(state, {
        entries: [
          ...state.entries,
          {
            type: "assistant",
            id,
            at: state.now(),
            text: event.text,
            streaming: true,
          },
        ],
      });
    }
    case "thinking": {
      const id = `thinking:${event.messageId ?? state.fallbackAssistantId}`;
      const existing = entryById(state.entries, id);
      if (existing?.type === "thinking") {
        return update(state, {
          entries: state.entries.map((entry) =>
            entry.type === "thinking" && entry.id === id
              ? { ...entry, text: entry.text + event.text, streaming: true }
              : entry,
          ),
        });
      }
      return update(state, {
        entries: [
          ...state.entries,
          {
            type: "thinking",
            id,
            at: state.now(),
            text: event.text,
            streaming: true,
          },
        ],
      });
    }
    case "tool": {
      const id = `tool:${event.toolCallId}`;
      const existing = entryById(state.entries, id);
      if (existing?.type === "tool") {
        return update(state, {
          entries: state.entries.map((entry) =>
            entry.id === id
              ? {
                  ...entry,
                  ...(event.title ? { title: event.title } : {}),
                  ...(event.name ? { name: event.name } : {}),
                  ...(event.kind ? { kind: event.kind } : {}),
                  ...(event.status ? { status: event.status } : {}),
                  ...(event.locations ? { locations: event.locations } : {}),
                }
              : entry,
          ),
        });
      }
      return update(state, {
        entries: [
          ...state.entries,
          {
            type: "tool",
            id,
            at: state.now(),
            toolCallId: event.toolCallId,
            ...(event.title ? { title: event.title } : {}),
            ...(event.name ? { name: event.name } : {}),
            ...(event.kind ? { kind: event.kind } : {}),
            ...(event.status ? { status: event.status } : {}),
            ...(event.locations ? { locations: event.locations } : {}),
          },
        ],
      });
    }
    case "notice":
      return update(state, {
        entries: [
          ...state.entries,
          {
            type: "notice",
            id: `notice-${state.revision + 1}`,
            at: state.now(),
            ...(event.severity ? { severity: event.severity } : {}),
            text: event.message,
          },
        ],
      });
    case "config": {
      const configOptions = mergeConfigOptions(
        state.configOptions,
        event.options,
      );
      const model = currentModel(configOptions);
      return update(state, {
        configOptions,
        ...(model ? { currentModel: model } : {}),
      });
    }
  }
}

export function finishTurn(state: AgentPanelState): AgentPanelState {
  return update(state, {
    phase: "ready",
    entries: state.entries.map((entry) =>
      entry.type === "assistant" || entry.type === "thinking"
        ? { ...entry, streaming: false }
        : entry,
    ),
  });
}

export function setPhase(
  state: AgentPanelState,
  phase: AgentUiSnapshot["phase"],
  error?: string,
): AgentPanelState {
  return update(state, {
    phase,
    ...(error ? { error } : { error: undefined }),
  });
}
