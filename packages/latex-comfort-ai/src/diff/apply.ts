/*
 * Adapted from Lattice, src/agent/proofread-edits.ts (Apache-2.0).
 * Copyright 2026 Leonardo and the Lattice contributors.
 * Licensed under the Apache License, Version 2.0.
 * Modified for LaTeX Comfort: VS Code hunk type and range validation.
 */

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
