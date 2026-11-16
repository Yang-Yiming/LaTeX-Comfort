import type { TextPosition, TextRange } from "@latex-comfort/shared";

export function rangeWithinSelection(
  selection: TextRange,
  text: string,
  from: number,
  to: number,
): TextRange {
  return {
    start: positionWithinSelection(selection, text, from),
    end: positionWithinSelection(selection, text, to),
  };
}

export function positionWithinSelection(
  selection: TextRange,
  text: string,
  offset: number,
): TextPosition {
  const bounded = Math.max(0, Math.min(offset, text.length));
  const lines = text.slice(0, bounded).split("\n");
  if (lines.length === 1) {
    return {
      line: selection.start.line,
      character: selection.start.character + bounded,
    };
  }
  return {
    line: selection.start.line + lines.length - 1,
    character: lines.at(-1)?.length ?? 0,
  };
}

export function formatInsertionPreview(
  insert: string,
  maxLength = 72,
): string {
  const compact = insert.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, Math.max(0, maxLength - 1))}…`;
}
