/*
 * Adapted in part from Lattice's src/papers/bib-document.ts (Apache-2.0).
 * Copyright 2026 Leonardo and the Lattice contributors.
 * Licensed under the Apache License, Version 2.0.
 * Modified for LaTeX Comfort: project-scoped paper records and duplicate identity.
 */

import { entryValues, parseBibliography, type BibParseError } from "./bibtex";

export type PaperRecord = {
  key: string;
  entryType: string;
  title: string;
  authors: string;
  firstAuthor: string;
  year: string;
  venue: string;
  doi?: string;
  arxivId?: string;
  url?: string;
  path: string;
  line: number;
  haystack: string;
};

export type PaperIndex = {
  papers: PaperRecord[];
  errors: BibParseError[];
  byKey: ReadonlyMap<string, PaperRecord>;
};

export type PaperIdentity = {
  key?: string;
  title?: string;
  year?: string;
  doi?: string;
  arxivId?: string;
};

const ACCENTS: Record<string, string> = {
  '"': "̈", "'": "́", "`": "̀", "^": "̂", "~": "̃", "=": "̄", ".": "̇",
  u: "̆", v: "̌", H: "̋", c: "̧", k: "̨", r: "̊", d: "̣", b: "̱",
};
const LETTERS: Record<string, string> = {
  aa: "å", AA: "Å", ae: "æ", AE: "Æ", oe: "œ", OE: "Œ", o: "ø", O: "Ø", ss: "ß", l: "ł", L: "Ł", i: "ı", j: "ȷ",
  textendash: "–", textemdash: "—", ldots: "…", dots: "…", textregistered: "®", copyright: "©", S: "§", P: "¶",
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ",
  kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", phi: "φ", chi: "χ",
  psi: "ψ", omega: "ω", Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Pi: "Π", Sigma: "Σ", Phi: "Φ", Omega: "Ω",
  ell: "ℓ", infty: "∞", times: "×", pm: "±", leq: "≤", geq: "≥", le: "≤", ge: "≥", to: "→", rightarrow: "→", cdot: "·",
};

export function bibTextToPlain(value: string): string {
  return value
    .replace(/\\(["'`^~=.])\s*(?:\{\s*(\\?[A-Za-z])\s*\}|(\\?[A-Za-z]))/g, (_, accent: string, braced?: string, bare?: string) => (
      `${(braced ?? bare ?? "").replace(/^\\/, "")}${ACCENTS[accent]}`
    ).normalize())
    .replace(/\\([uvHckrdb])(?:\s*\{\s*(\\?[A-Za-z])\s*\}|\s+(\\?[A-Za-z]))/g, (_, accent: string, braced?: string, bare?: string) => (
      `${(braced ?? bare ?? "").replace(/^\\/, "")}${ACCENTS[accent]}`
    ).normalize())
    .replace(/\\([A-Za-z]+)(?![A-Za-z])\s*(\{\s*\})?/g, (match, name: string) => LETTERS[name] ?? match)
    .replace(/\\([&%$#_{}])/g, "$1")
    .replace(/\\[A-Za-z]+\*?\s*(?=\{)/g, "")
    .replace(/\\[A-Za-z]+\*?\s*/g, "")
    .replace(/[{}]/g, "")
    .replace(/\$/g, "")
    .replace(/---/g, "—")
    .replace(/--/g, "–")
    .replace(/``/g, "“")
    .replace(/''/g, "”")
    .replace(/~/g, "\u00a0")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeDoi(value: string | undefined): string | undefined {
  const normalized = value
    ?.trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .toLowerCase();
  return normalized || undefined;
}

export function normalizeArxivId(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const text = value.trim();
  const explicit = /(?:arxiv:\s*|arxiv\.org\/(?:abs|pdf)\/)([a-z-]+(?:\.[a-z]{2})?\/\d{7}|\d{4}\.\d{4,5})(?:v\d+)?/i.exec(text)?.[1]
    ?? /\b([a-z-]+(?:\.[a-z]{2})?\/\d{7}|\d{4}\.\d{4,5})(?:v\d+)?\b/i.exec(text)?.[1];
  return explicit?.toLowerCase();
}

function splitAuthors(value: string): string[] {
  const authors: string[] = [];
  let depth = 0;
  let start = 0;
  const text = value.trim();
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "{") depth += 1;
    else if (character === "}") depth = Math.max(0, depth - 1);
    if (depth !== 0) continue;
    const match = /^\s+and\s+/i.exec(text.slice(index));
    if (!match) continue;
    authors.push(text.slice(start, index).trim());
    index += match[0].length - 1;
    start = index + 1;
  }
  const last = text.slice(start).trim();
  if (last) authors.push(last);
  return authors;
}

export function firstAuthorSurname(authors: string): string {
  const first = splitAuthors(authors)[0]?.trim() ?? "";
  const corporate = first.startsWith("{") && first.endsWith("}");
  const unbracketed = corporate ? first.slice(1, -1).trim() : first;
  const plain = bibTextToPlain(unbracketed);
  if (!plain) return "";
  if (corporate) return plain;
  if (unbracketed.includes(",")) return plain.split(",")[0]!.trim();
  if (plain.split(/\s+/).length === 1) return plain;
  return plain.split(/\s+/).at(-1) ?? "";
}

function venueOf(values: Map<string, string>): string {
  for (const name of ["journal", "journaltitle", "booktitle", "publisher", "school", "institution", "organization", "howpublished"]) {
    const value = bibTextToPlain(values.get(name) ?? "");
    if (value) return value;
  }
  return "";
}

function arxivOf(values: Map<string, string>): string | undefined {
  const eprint = values.get("eprint") ?? "";
  const archive = `${values.get("archiveprefix") ?? ""} ${values.get("eprinttype") ?? ""}`.toLowerCase();
  if (archive.includes("arxiv") || /^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[a-z]{2})?\/\d{7})(?:v\d+)?$/i.test(eprint.trim())) {
    return normalizeArxivId(eprint);
  }
  return normalizeArxivId(values.get("url"))
    ?? normalizeArxivId(`${values.get("journal") ?? ""} ${values.get("note") ?? ""}`);
}

export function buildPaperRecords(path: string, source: string): PaperIndex {
  const parsed = parseBibliography(source);
  if (!parsed.document) {
    return { papers: [], errors: [parsed.error], byKey: new Map() };
  }

  const papers = parsed.document.entries.map((entry): PaperRecord => {
    const values = entryValues(source, entry, parsed.document.macros);
    const title = bibTextToPlain(values.get("title") ?? "") || entry.key;
    const authorsRaw = values.get("author") ?? values.get("editor") ?? "";
    const authors = bibTextToPlain(authorsRaw);
    const firstAuthor = firstAuthorSurname(authorsRaw);
    const year = bibTextToPlain(values.get("year") ?? "") || (values.get("date") ?? "").slice(0, 4);
    const venue = venueOf(values);
    const doi = normalizeDoi(values.get("doi"));
    const arxivId = arxivOf(values);
    const url = values.get("url")?.trim();
    const haystack = [entry.key, title, authors, authorsRaw, venue, year, doi, arxivId, url]
      .filter(Boolean)
      .join("\n")
      .toLowerCase();

    return {
      key: entry.key,
      entryType: entry.kind,
      title,
      authors,
      firstAuthor,
      year,
      venue,
      ...(doi ? { doi } : {}),
      ...(arxivId ? { arxivId } : {}),
      ...(url ? { url } : {}),
      path,
      line: entry.line,
      haystack,
    };
  });

  papers.sort((left, right) =>
    left.firstAuthor.localeCompare(right.firstAuthor)
    || left.year.localeCompare(right.year, undefined, { numeric: true })
    || left.title.localeCompare(right.title));

  return {
    papers,
    errors: [],
    byKey: new Map(papers.map((paper) => [paper.key.toLowerCase(), paper])),
  };
}

function normalizedTitle(value: string | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

export function findDuplicate(papers: readonly PaperRecord[], candidate: PaperIdentity): PaperRecord | undefined {
  const doi = normalizeDoi(candidate.doi);
  const arxivId = normalizeArxivId(candidate.arxivId);
  const key = candidate.key?.toLowerCase();
  const title = normalizedTitle(candidate.title);

  for (const paper of papers) {
    if (doi && normalizeDoi(paper.doi) === doi) return paper;
    if (arxivId && normalizeArxivId(paper.arxivId) === arxivId) return paper;
    if (key && paper.key.toLowerCase() === key) return paper;
  }
  if (!title || !candidate.year) return undefined;
  return papers.find((paper) =>
    normalizedTitle(paper.title) === title
    && paper.year.trim() === candidate.year!.trim());
}
