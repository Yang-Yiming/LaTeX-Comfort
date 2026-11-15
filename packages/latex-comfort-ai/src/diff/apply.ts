import type { Hunk } from "@latex-comfort/shared";

/** Applies selected hunks to the original text, in source order. */
export function applyHunks(original: string, selected: readonly Hunk[]): string {
  const hunks = [...selected].sort((left, right) => left.from - right.from);
  let cursor = 0;
  let result = "";

  for (const hunk of hunks) {
    if (hunk.from < cursor || hunk.to < hunk.from || hunk.to > original.length) {
      throw new Error("Hunks overlap or fall outside the original text.");
    }
    result += original.slice(cursor, hunk.from) + hunk.insert;
    cursor = hunk.to;
  }
  return result + original.slice(cursor);
}
