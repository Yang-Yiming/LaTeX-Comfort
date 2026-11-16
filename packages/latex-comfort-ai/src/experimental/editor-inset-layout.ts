import type { ReviewReadyState } from "@latex-comfort/shared";
import type { ReviewContext } from "../review/state";

export function chooseInsetLine(context: ReviewContext): number {
  const { end } = context.range;
  return Math.max(-1, end.character === 0 ? end.line - 1 : end.line);
}

export function estimateInsetHeight(review: ReviewReadyState): number {
  const changedLines = review.hunks.reduce((count, hunk) => {
    const inserted = hunk.insert ? hunk.insert.split("\n").length : 0;
    return count + 1 + inserted;
  }, 0);
  return Math.min(28, Math.max(12, 10 + changedLines));
}

export function contentHeightToLines(
  contentHeight: number,
  lineHeight: number,
): number {
  const safeLineHeight = Math.max(1, lineHeight);
  return Math.min(
    60,
    Math.max(8, Math.ceil(contentHeight / safeLineHeight) + 1),
  );
}
