/*
 * Adapted in part from Lattice's src/papers/bib-entry.ts and
 * src/papers/bib-document.ts (Apache-2.0).
 * Copyright 2026 Leonardo and the Lattice contributors.
 * Licensed under the Apache License, Version 2.0.
 * Modified for LaTeX Comfort: append-only bibliography and citation edits.
 */

import { parseBibliography } from "./bibtex";

export type TextPosition = { line: number; character: number };
export type TextRange = { start: TextPosition; end: TextPosition };

function newlineOf(...values: string[]): string {
  return values.some((value) => value.includes("\r\n")) ? "\r\n" : "\n";
}

function normalizeNewlines(value: string, newline: string): string {
  return value.replace(/\r\n|\r|\n/g, newline);
}

export function appendEntryText(existing: string, entry: string): string {
  const parsedEntry = parseBibliography(entry);
  if (!parsedEntry.document || parsedEntry.document.entries.length !== 1) {
    throw new Error("Add exactly one bibliography entry at a time.");
  }
  const parsedExisting = parseBibliography(existing);
  if (!parsedExisting.document) {
    throw new Error("The existing bibliography has a syntax error and cannot be appended to safely.");
  }

  const key = parsedEntry.document.entries[0]!.key;
  if (parsedExisting.document.entries.some((item) => item.key.toLowerCase() === key.toLowerCase())) {
    throw new Error(`Citation key '${key}' already exists. Choose a different key or edit the existing reference.`);
  }

  const newline = newlineOf(existing, entry);
  const normalizedEntry = normalizeNewlines(entry.trim(), newline);
  const terminated = normalizedEntry.endsWith(newline) ? normalizedEntry : `${normalizedEntry}${newline}`;
  const trimmed = existing.replace(/\s+$/, "");
  return trimmed ? `${trimmed}${newline}${newline}${terminated}` : terminated;
}

export function citationText(key: string): string {
  return `\\cite{${key}}`;
}

function offsetAt(source: string, position: TextPosition): number {
  let offset = 0;
  for (let line = 0; line < position.line; line += 1) {
    const next = source.indexOf("\n", offset);
    if (next === -1) return source.length;
    offset = next + 1;
  }
  return Math.min(source.length, offset + Math.max(0, position.character));
}

export function insertCitationText(source: string, selection: TextRange, key: string): string {
  const from = offsetAt(source, selection.start);
  const to = offsetAt(source, selection.end);
  return `${source.slice(0, from)}${citationText(key)}${source.slice(to)}`;
}

export function renameBibtexKey(bibtex: string, key: string): string {
  const parsed = parseBibliography(bibtex);
  if (!parsed.document || parsed.document.entries.length !== 1) {
    throw new Error("Rename exactly one bibliography entry at a time.");
  }
  const next = key.trim();
  if (!next || /[\s,{}()]/.test(next)) throw new Error("Enter a valid citation key.");
  const entry = parsed.document.entries[0]!;
  return `${bibtex.slice(0, entry.keyFrom)}${next}${bibtex.slice(entry.keyTo)}`;
}
