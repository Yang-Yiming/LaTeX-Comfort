import type {
  AgentUiAgentId,
  AgentWebviewToHostMessage,
} from "@latex-comfort/shared";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function agentId(value: unknown): value is AgentUiAgentId {
  return value === "opencode" || value === "codex";
}

export function parseAgentWebviewMessage(
  value: unknown,
): AgentWebviewToHostMessage | null {
  if (!isRecord(value)) return null;

  switch (value.type) {
    case "agentWebviewReady":
      return { type: "agentWebviewReady" };
    case "agentSend":
      return nonEmpty(value.text) && value.text.length <= 100_000
        ? { type: "agentSend", text: value.text }
        : null;
    case "agentCancel":
      return { type: "agentCancel" };
    case "agentNewThread":
      return { type: "agentNewThread" };
    case "agentOpenThread":
      return nonEmpty(value.threadId)
        ? { type: "agentOpenThread", threadId: value.threadId }
        : null;
    case "agentDeleteThread":
      return nonEmpty(value.threadId)
        ? { type: "agentDeleteThread", threadId: value.threadId }
        : null;
    case "agentSelectAgent":
      return agentId(value.agentId)
        ? { type: "agentSelectAgent", agentId: value.agentId }
        : null;
    case "agentSelectConfig":
      return nonEmpty(value.configId) && nonEmpty(value.value)
        ? {
            type: "agentSelectConfig",
            configId: value.configId,
            value: value.value,
          }
        : null;
    case "agentSetVisibleModels":
      return value.values === null ||
        (Array.isArray(value.values) &&
          value.values.length > 0 &&
          value.values.every(nonEmpty))
        ? {
            type: "agentSetVisibleModels",
            values: value.values as string[] | null,
          }
        : null;
    case "agentResolvePermission":
      return nonEmpty(value.permissionId) &&
        (value.optionId === undefined || nonEmpty(value.optionId))
        ? {
            type: "agentResolvePermission",
            permissionId: value.permissionId,
            ...(value.optionId ? { optionId: value.optionId } : {}),
          }
        : null;
    case "agentAuthenticate":
      return value.methodId === undefined || nonEmpty(value.methodId)
        ? {
            type: "agentAuthenticate",
            ...(value.methodId ? { methodId: value.methodId } : {}),
          }
        : null;
    case "agentOpenDiff":
      return nonEmpty(value.turnId) && nonEmpty(value.path)
        ? {
            type: "agentOpenDiff",
            turnId: value.turnId,
            path: value.path,
          }
        : null;
    case "agentOpenTurnDiffs":
      return nonEmpty(value.turnId)
        ? { type: "agentOpenTurnDiffs", turnId: value.turnId }
        : null;
    case "agentRestoreTurn":
      return nonEmpty(value.turnId)
        ? { type: "agentRestoreTurn", turnId: value.turnId }
        : null;
    case "agentOpenLocation":
      return nonEmpty(value.path) &&
        (value.line === undefined ||
          (typeof value.line === "number" &&
            Number.isInteger(value.line) &&
            value.line > 0))
        ? {
            type: "agentOpenLocation",
            path: value.path,
            ...(typeof value.line === "number" ? { line: value.line } : {}),
          }
        : null;
    case "agentOpenSettings":
      return { type: "agentOpenSettings" };
    default:
      return null;
  }
}
