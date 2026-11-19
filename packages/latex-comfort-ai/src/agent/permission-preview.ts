import type { AgentUiDiff } from "@latex-comfort/shared";
import { lineHunks } from "./line-diff";
import type { AgentProposedDiff } from "./types";

function lineCount(text: string | undefined): number {
  if (!text) return 0;
  return text.split(/\r?\n/).length - (text.endsWith("\n") ? 1 : 0);
}

/** Converts ACP proposed contents into the line hunks the panel renders. */
export function permissionDiffs(
  diffs: AgentProposedDiff[] | undefined,
): AgentUiDiff[] | undefined {
  if (!diffs?.length) return undefined;
  return diffs.map((diff) => {
    const hunks = lineHunks(diff.oldText ?? "", diff.newText);
    return {
      path: diff.path,
      ...(diff.oldText !== undefined ? { oldText: diff.oldText } : {}),
      newText: diff.newText,
      additions: hunks.reduce(
        (total, hunk) => total + lineCount(hunk.afterText),
        0,
      ),
      deletions: hunks.reduce(
        (total, hunk) => total + lineCount(hunk.beforeText),
        0,
      ),
      hunks: hunks.map((hunk) => ({
        beforeText: hunk.beforeText,
        afterText: hunk.afterText,
        beforeStart: hunk.beforeStart,
        afterStart: hunk.afterStart,
      })),
    };
  });
}
