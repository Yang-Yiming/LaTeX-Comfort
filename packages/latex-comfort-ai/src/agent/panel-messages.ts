import type {
  AgentUiAgentId,
  AgentUiAttachment,
  AgentWebviewToHostMessage,
} from "@latex-comfort/shared";

const MAX_ATTACHMENTS = 8;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENT_TEXT_CHARS = 1_000_000;
const MAX_ATTACHMENT_DATA_CHARS = 16 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function agentId(value: unknown): value is AgentUiAgentId {
  return value === "opencode" || value === "codex";
}

function parseAttachment(value: unknown): AgentUiAttachment | null {
  if (!isRecord(value)) return null;
  if (
    !nonEmpty(value.id) ||
    (value.kind !== "image" && value.kind !== "file") ||
    !nonEmpty(value.name) ||
    value.name.length > 255 ||
    !nonEmpty(value.mimeType) ||
    typeof value.size !== "number" ||
    !Number.isFinite(value.size) ||
    value.size < 0 ||
    value.size > MAX_ATTACHMENT_BYTES
  ) {
    return null;
  }
  if (value.text !== undefined && typeof value.text !== "string") return null;
  if (value.data !== undefined && typeof value.data !== "string") return null;
  if (value.text === undefined && value.data === undefined) return null;
  if (
    (typeof value.text === "string" && value.text.length > MAX_ATTACHMENT_TEXT_CHARS) ||
    (typeof value.data === "string" && value.data.length > MAX_ATTACHMENT_DATA_CHARS)
  ) {
    return null;
  }
  return {
    id: value.id,
    kind: value.kind,
    name: value.name,
    mimeType: value.mimeType,
    size: value.size,
    ...(typeof value.data === "string" ? { data: value.data } : {}),
    ...(typeof value.text === "string" ? { text: value.text } : {}),
  };
}

function parseAttachments(value: unknown): AgentUiAttachment[] | undefined | null {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MAX_ATTACHMENTS) return null;
  const attachments = value.map(parseAttachment);
  if (attachments.some((attachment) => attachment === null)) return null;
  return attachments as AgentUiAttachment[];
}

export function parseAgentWebviewMessage(
  value: unknown,
): AgentWebviewToHostMessage | null {
  if (!isRecord(value)) return null;

  switch (value.type) {
    case "agentWebviewReady":
      return { type: "agentWebviewReady" };
    case "agentSend": {
      if (typeof value.text !== "string" || value.text.length > 100_000) return null;
      const attachments = parseAttachments(value.attachments);
      if (attachments === null) return null;
      if (!value.text && (attachments?.length ?? 0) === 0) return null;
      return {
        type: "agentSend",
        text: value.text,
        ...(attachments && attachments.length > 0 ? { attachments } : {}),
      };
    }
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
