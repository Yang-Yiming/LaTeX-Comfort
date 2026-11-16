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

export function acceptLensTitle(selected: number, total: number): string {
  if (selected === 0) return "$(circle-slash) No changes selected";
  if (selected === total) return `$(check) Accept all (${total})`;
  return `$(check) Accept ${selected} of ${total}`;
}

export function hunkHoverMarkdown(
  id: number,
  total: number,
  accepted: boolean,
  commandId: string,
): string {
  const action = accepted ? "Skip this change" : "Use this change";
  const argumentsJson = encodeURIComponent(JSON.stringify([id, !accepted]));
  return `**Change ${id + 1} of ${total}**\n\n[${action}](command:${commandId}?${argumentsJson})`;
}
