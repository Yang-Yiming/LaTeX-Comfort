/*
 * Adapted from Lattice, src/agent/proofread-edits.ts (Apache-2.0).
 * Copyright 2026 Leonardo and the Lattice contributors.
 * Licensed under the Apache License, Version 2.0.
 * Modified for LaTeX Comfort: bounded LCS and VS Code hunk ranges.
 */

import type { Hunk } from "@latex-comfort/shared";
import { tokenize, type Token } from "./tokenize";

type DiffKind = "same" | "del" | "add";
type DiffOp = { kind: DiffKind; token: Token };

const MAX_LCS_CELLS = 4_000_000;

/**
 * A token-level LCS diff. Large regions fall back to one replacement so a
 * pathological selection cannot allocate an unbounded matrix.
 */
function diffTokens(a: Token[], b: Token[]): DiffOp[] {
  const ops: DiffOp[] = [];
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix]!.text === b[prefix]!.text) {
    ops.push({ kind: "same", token: a[prefix]! });
    prefix += 1;
  }

  let suffixA = a.length;
  let suffixB = b.length;
  while (suffixA > prefix && suffixB > prefix && a[suffixA - 1]!.text === b[suffixB - 1]!.text) {
    suffixA -= 1;
    suffixB -= 1;
  }

  const left = a.slice(prefix, suffixA);
  const right = b.slice(prefix, suffixB);
  if (left.length * right.length > MAX_LCS_CELLS) {
    for (const token of left) ops.push({ kind: "del", token });
    for (const token of right) ops.push({ kind: "add", token });
  } else {
    ops.push(...lcsDiff(left, right));
  }

  for (let index = suffixA; index < a.length; index += 1) {
    ops.push({ kind: "same", token: a[index]! });
  }
  return ops;
}

function lcsDiff(a: Token[], b: Token[]): DiffOp[] {
  if (!a.length) return b.map((token) => ({ kind: "add", token }));
  if (!b.length) return a.map((token) => ({ kind: "del", token }));

  const width = b.length + 1;
  const table = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        a[i]!.text === b[j]!.text
          ? table[(i + 1) * width + j + 1]! + 1
          : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i]!.text === b[j]!.text) {
      ops.push({ kind: "same", token: a[i]! });
      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j]! >= table[i * width + j + 1]!) {
      ops.push({ kind: "del", token: a[i]! });
      i += 1;
    } else {
      ops.push({ kind: "add", token: b[j]! });
      j += 1;
    }
  }
  while (i < a.length) {
    ops.push({ kind: "del", token: a[i]! });
    i += 1;
  }
  while (j < b.length) {
    ops.push({ kind: "add", token: b[j]! });
    j += 1;
  }
  return ops;
}

type DraftHunk = { from: number; to: number; insert: string };

function trimSharedSpace(original: string, hunk: DraftHunk): DraftHunk {
  let { from, to, insert } = hunk;
  while (
    to > from &&
    insert.length > 0 &&
    /\s/.test(insert.at(-1)!) &&
    original[to - 1] === insert.at(-1)
  ) {
    to -= 1;
    insert = insert.slice(0, -1);
  }
  while (
    to > from &&
    insert.length > 0 &&
    /\s/.test(insert[0]!) &&
    original[from] === insert[0]
  ) {
    from += 1;
    insert = insert.slice(1);
  }
  return { from, to, insert };
}

/** Changes from `original` to `proposed`, grouped into independently applicable hunks. */
export function diffHunks(original: string, proposed: string): Hunk[] {
  if (original === proposed) return [];

  const ops = diffTokens(tokenize(original), tokenize(proposed));
  const drafts: DraftHunk[] = [];
  let current: DraftHunk | null = null;
  let cursor = 0;

  const flush = () => {
    if (!current) return;
    const trimmed = trimSharedSpace(original, current);
    if (trimmed.from !== trimmed.to || trimmed.insert.length > 0) drafts.push(trimmed);
    current = null;
  };

  for (const op of ops) {
    if (op.kind === "same") {
      flush();
      cursor = op.token.to;
      continue;
    }
    if (op.kind === "del") {
      if (!current) current = { from: op.token.from, to: op.token.to, insert: "" };
      else current.to = op.token.to;
      cursor = op.token.to;
      continue;
    }
    if (!current) current = { from: cursor, to: cursor, insert: "" };
    current.insert += op.token.text;
  }
  flush();

  return drafts.map((draft, id) => ({ id, ...draft }));
}
