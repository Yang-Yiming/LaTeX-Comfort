/*
 * Adapted from Lattice's src/papers/bib-document.ts (Apache-2.0).
 * Copyright 2026 Leonardo and the Lattice contributors.
 * Licensed under the Apache License, Version 2.0.
 * Modified for LaTeX Comfort: focused on read-only indexing and entry fields.
 */

export type BibField = {
  name: string;
  from: number;
  valueFrom: number;
  valueTo: number;
};

export type BibEntry = {
  type: string;
  kind: string;
  key: string;
  from: number;
  to: number;
  typeFrom: number;
  keyFrom: number;
  keyTo: number;
  fields: BibField[];
  trailingComma: boolean;
  line: number;
};

export type BibDocument = {
  entries: BibEntry[];
  macros: Map<string, string>;
};

export type BibParseError = {
  reason: "unclosed" | "missing-key" | "bad-field";
  line: number;
  key?: string;
};

export type BibParse =
  | { document: BibDocument; error: null }
  | { document: null; error: BibParseError };

const isSpace = (character: string | undefined): boolean =>
  character === " " || character === "\t" || character === "\n" || character === "\r";
const NAME = /[^\s"#%'(),={}]/;

function lineStarts(source: string): number[] {
  const starts = [0];
  for (let index = source.indexOf("\n"); index !== -1; index = source.indexOf("\n", index + 1)) {
    starts.push(index + 1);
  }
  return starts;
}

function lineAt(starts: number[], offset: number): number {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (starts[middle]! <= offset) low = middle;
    else high = middle - 1;
  }
  return low + 1;
}

function closeBrace(source: string, open: number, limit = source.length): number {
  let depth = 0;
  for (let index = open; index < limit; index += 1) {
    const character = source[index];
    if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) return index;
  }
  return -1;
}

function valuePartEnd(source: string, start: number, close: string): number {
  const first = source[start];
  if (first === "{") {
    const end = closeBrace(source, start);
    return end === -1 ? -1 : end + 1;
  }
  if (first === '"') {
    let depth = 0;
    for (let index = start + 1; index < source.length; index += 1) {
      const character = source[index];
      if (character === "{") depth += 1;
      else if (character === "}") depth -= 1;
      else if (character === '"' && depth === 0) return index + 1;
      if (depth < 0) return -1;
    }
    return -1;
  }
  let index = start;
  while (index < source.length && NAME.test(source[index]!) && source[index] !== close) index += 1;
  return index === start ? -1 : index;
}

function skipGap(source: string, index: number): number {
  for (;;) {
    while (isSpace(source[index])) index += 1;
    if (source[index] !== "%") return index;
    while (index < source.length && source[index] !== "\n") index += 1;
  }
}

function valueEnd(source: string, start: number, close: string): number {
  let end = valuePartEnd(source, start, close);
  while (end !== -1) {
    const next = skipGap(source, end);
    if (source[next] !== "#") return end;
    end = valuePartEnd(source, skipGap(source, next + 1), close);
  }
  return -1;
}

function directiveEnd(source: string, open: number): number {
  if (source[open] === "{") return closeBrace(source, open);
  let depth = 0;
  for (let index = open + 1; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") depth += 1;
    else if (character === "}") depth -= 1;
    else if (character === ")" && depth === 0) return index;
  }
  return -1;
}

export function parseBibliography(source: string): BibParse {
  const starts = lineStarts(source);
  const entries: BibEntry[] = [];
  const macros = new Map<string, string>();
  let index = 0;

  while (index < source.length) {
    const character = source[index];
    if (character === "%") {
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }
    if (character !== "@") {
      index += 1;
      continue;
    }

    const from = index;
    const typeFrom = skipGap(source, from + 1);
    let typeTo = typeFrom;
    while (typeTo < source.length && /[A-Za-z0-9_-]/.test(source[typeTo]!)) typeTo += 1;
    const open = skipGap(source, typeTo);
    if (typeTo === typeFrom || (source[open] !== "{" && source[open] !== "(")) {
      index = from + 1;
      continue;
    }

    const type = source.slice(typeFrom, typeTo);
    const kind = type.toLowerCase();
    const line = lineAt(starts, from);
    const close = source[open] === "{" ? "}" : ")";

    if (kind === "comment" || kind === "preamble" || kind === "string") {
      const end = directiveEnd(source, open);
      if (end === -1) return { document: null, error: { reason: "unclosed", line } };
      if (kind === "string") {
        const nameFrom = skipGap(source, open + 1);
        let nameTo = nameFrom;
        while (nameTo < end && NAME.test(source[nameTo]!)) nameTo += 1;
        const equals = skipGap(source, nameTo);
        if (nameTo > nameFrom && source[equals] === "=") {
          const valueFrom = skipGap(source, equals + 1);
          const valueTo = valueEnd(source, valueFrom, close);
          if (valueTo !== -1 && valueTo <= end) {
            macros.set(source.slice(nameFrom, nameTo).toLowerCase(), source.slice(valueFrom, valueTo));
          }
        }
      }
      index = end + 1;
      continue;
    }

    const keyFrom = skipGap(source, open + 1);
    let keyTo = keyFrom;
    while (keyTo < source.length && !isSpace(source[keyTo]) && !",{}()".includes(source[keyTo]!)) keyTo += 1;
    if (keyTo === keyFrom || source[keyTo] === "=" || source.slice(keyFrom, keyTo).includes("=")) {
      return { document: null, error: { reason: "missing-key", line } };
    }

    const key = source.slice(keyFrom, keyTo);
    const fields: BibField[] = [];
    let cursor = skipGap(source, keyTo);
    let trailingComma = false;
    let failed: BibParseError["reason"] | null = null;

    while (failed === null) {
      if (source[cursor] === close) break;
      if (source[cursor] !== ",") {
        failed = cursor >= source.length ? "unclosed" : "bad-field";
        break;
      }
      cursor = skipGap(source, cursor + 1);
      trailingComma = true;
      if (source[cursor] === close) break;

      const nameFrom = cursor;
      while (cursor < source.length && NAME.test(source[cursor]!)) cursor += 1;
      const equals = skipGap(source, cursor);
      if (cursor === nameFrom || source[equals] !== "=") {
        failed = cursor >= source.length || source[nameFrom] === "@" ? "unclosed" : "bad-field";
        break;
      }

      const valueFrom = skipGap(source, equals + 1);
      const valueTo = valueEnd(source, valueFrom, close);
      if (valueTo === -1) {
        failed =
          valueFrom >= source.length || source[valueFrom] === "{" || source[valueFrom] === '"'
            ? "unclosed"
            : "bad-field";
        break;
      }
      fields.push({ name: source.slice(nameFrom, cursor), from: nameFrom, valueFrom, valueTo });
      trailingComma = false;
      cursor = skipGap(source, valueTo);
    }

    if (failed !== null) {
      return { document: null, error: { reason: failed, line, key } };
    }
    entries.push({ type, kind, key, from, to: cursor + 1, typeFrom, keyFrom, keyTo, fields, trailingComma, line });
    index = cursor + 1;
  }

  return { document: { entries, macros }, error: null };
}

function valueParts(raw: string): string[] {
  const parts: string[] = [];
  let index = skipGap(raw, 0);
  while (index < raw.length) {
    const end = valuePartEnd(raw, index, "");
    if (end === -1) return [raw];
    parts.push(raw.slice(index, end));
    index = skipGap(raw, end);
    if (raw[index] !== "#") break;
    index = skipGap(raw, index + 1);
  }
  return parts;
}

export function expandBibValue(raw: string, macros: Map<string, string>, depth = 0): string {
  return valueParts(raw)
    .map((part) => {
      if (part.startsWith("{") || part.startsWith('"')) return part.slice(1, -1);
      if (/^\d+$/.test(part)) return part;
      const macro = macros.get(part.toLowerCase());
      if (macro !== undefined && depth < 8) return expandBibValue(macro, macros, depth + 1);
      return part;
    })
    .join("");
}

export function entryValues(
  source: string,
  entry: BibEntry,
  macros: Map<string, string>,
): Map<string, string> {
  const values = new Map<string, string>();
  for (const field of entry.fields) {
    const name = field.name.toLowerCase();
    if (!values.has(name)) {
      values.set(name, expandBibValue(source.slice(field.valueFrom, field.valueTo), macros));
    }
  }
  return values;
}

export function entryField(
  source: string,
  entry: BibEntry,
  name: string,
  macros: Map<string, string>,
): string {
  return entryValues(source, entry, macros).get(name.toLowerCase()) ?? "";
}
