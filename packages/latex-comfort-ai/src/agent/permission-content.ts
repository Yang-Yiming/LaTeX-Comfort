import type { AgentProposedDiff, AgentToolKind } from "./types";

type UnknownRecord = Record<string, unknown>;

const TOOL_KINDS = new Set<AgentToolKind>([
  "read",
  "edit",
  "delete",
  "move",
  "search",
  "execute",
  "think",
  "fetch",
  "switch_mode",
  "other",
]);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function agentToolKind(value: unknown): AgentToolKind | undefined {
  return typeof value === "string" && TOOL_KINDS.has(value as AgentToolKind)
    ? (value as AgentToolKind)
    : undefined;
}

/** ACP tool-call content may carry the exact proposed file contents. */
export function agentProposedDiffs(
  content: unknown,
): AgentProposedDiff[] | undefined {
  if (!Array.isArray(content)) return undefined;
  const diffs: AgentProposedDiff[] = [];
  for (const entry of content) {
    if (!isRecord(entry) || entry.type !== "diff") continue;
    if (typeof entry.path !== "string" || !entry.path) continue;
    if (typeof entry.newText !== "string") continue;
    diffs.push({
      path: entry.path,
      ...(typeof entry.oldText === "string" ? { oldText: entry.oldText } : {}),
      newText: entry.newText,
    });
  }
  return diffs.length > 0 ? diffs : undefined;
}

export function permissionOptions(value: unknown): Array<{
  id: string;
  label: string;
  kind?: string;
}> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.optionId !== "string") return [];
    return [
      {
        id: entry.optionId,
        label: typeof entry.name === "string" ? entry.name : entry.optionId,
        ...(typeof entry.kind === "string" ? { kind: entry.kind } : {}),
      },
    ];
  });
}
