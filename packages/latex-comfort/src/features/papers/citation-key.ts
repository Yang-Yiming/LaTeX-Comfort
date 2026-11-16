/*
 * Adapted from Lattice's src/papers/bib-entry.ts (Apache-2.0).
 * Copyright 2026 Leonardo and the Lattice contributors.
 * Licensed under the Apache License, Version 2.0.
 * Modified for LaTeX Comfort: project bibliography key generation.
 */

import { firstAuthorSurname, bibTextToPlain } from "./model";

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "into",
  "is", "of", "on", "or", "the", "to", "via", "with", "without", "we", "you",
]);

function keyAuthor(authors: string): string {
  return firstAuthorSurname(authors).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function keyWord(title: string): string {
  const words = bibTextToPlain(title).match(/[\p{L}\p{N}]+/gu) ?? [];
  return (words.find((word) => !STOP_WORDS.has(word.toLowerCase())) ?? words[0] ?? "work")
    .toLowerCase();
}

export function citationKey(input: { authors: string; title: string; year: string }): string {
  const author = keyAuthor(input.authors) || "key";
  const year = input.year.match(/\d{4}/)?.[0] ?? "0000";
  return `${author}${year}${keyWord(input.title)}`;
}

export function uniqueCitationKey(base: string, taken: ReadonlySet<string>): string {
  const normalizedTaken = new Set([...taken].map((key) => key.toLowerCase()));
  if (!normalizedTaken.has(base.toLowerCase())) return base;
  for (let index = 1; index < 26; index += 1) {
    const candidate = `${base}${String.fromCharCode(97 + index)}`;
    if (!normalizedTaken.has(candidate.toLowerCase())) return candidate;
  }
  let index = 2;
  while (normalizedTaken.has(`${base}${index}`.toLowerCase())) index += 1;
  return `${base}${index}`;
}
