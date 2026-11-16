import { entryValues, parseBibliography } from "./bibtex";
import { citationKey, uniqueCitationKey } from "./citation-key";
import { bibTextToPlain, normalizeArxivId, normalizeDoi } from "./model";

export type ReferenceInputKind = "doi" | "arxiv" | "title" | "bibtex";

export type ResolvedReference = {
  kind: ReferenceInputKind;
  bibtex: string;
  key: string;
  title: string;
  authors: string;
  year: string;
  doi?: string;
  arxivId?: string;
  url?: string;
};

export type TitleCandidate = {
  doi: string;
  title: string;
  authors: string;
  year: string;
  venue: string;
};

export type ResolverDeps = {
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  signal: AbortSignal;
  contactEmail?: string;
};

const DOI_INPUT = /^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)?(10\.\d{4,9}\/\S+)$/i;
const ARXIV_INPUT = /^(?:arxiv:\s*|https?:\/\/(?:www\.)?arxiv\.org\/(?:abs|pdf)\/)?([a-z-]+(?:\.[a-z]{2})?\/\d{7}|\d{4}\.\d{4,5})(?:v\d+)?(?:\.pdf)?\/?$/i;

export function detectReferenceInput(input: string): ReferenceInputKind {
  const value = input.trim();
  if (/^@[a-z]+\s*[{(]/i.test(value)) return "bibtex";
  if (DOI_INPUT.test(value)) return "doi";
  if (ARXIV_INPUT.test(value)) return "arxiv";
  return "title";
}

function withMailto(url: string, contactEmail?: string): string {
  if (!contactEmail?.trim()) return url;
  const parsed = new URL(url);
  parsed.searchParams.set("mailto", contactEmail.trim());
  return parsed.toString();
}

async function checkedText(response: Response, source: string): Promise<string> {
  if (response.status === 429) throw new Error(`${source} rate limit reached. Try again later.`);
  if (!response.ok) throw new Error(`${source} returned HTTP ${response.status}.`);
  return response.text();
}

function plainAuthors(value: string): string {
  return value
    .split(/\s+and\s+/i)
    .map((author) => bibTextToPlain(author.trim()))
    .filter(Boolean)
    .join(" and ");
}

function resolvedFromBibtex(
  kind: ReferenceInputKind,
  bibtex: string,
  fallback: { doi?: string; arxivId?: string; url?: string; key?: string } = {},
): ResolvedReference {
  const parsed = parseBibliography(bibtex);
  if (!parsed.document || parsed.document.entries.length !== 1) {
    throw new Error("The reference source did not return exactly one BibTeX entry.");
  }
  const entry = parsed.document.entries[0]!;
  const values = entryValues(bibtex, entry, parsed.document.macros);
  const title = bibTextToPlain(values.get("title") ?? "") || entry.key;
  const authorsRaw = values.get("author") ?? values.get("editor") ?? "";
  const authors = plainAuthors(authorsRaw);
  const year = bibTextToPlain(values.get("year") ?? "") || (values.get("date") ?? "").slice(0, 4);
  const doi = normalizeDoi(values.get("doi") ?? fallback.doi);
  const arxivId = normalizeArxivId(values.get("eprint"))
    ?? normalizeArxivId(values.get("url"))
    ?? normalizeArxivId(fallback.arxivId)
    ?? normalizeArxivId(doi);
  const url = values.get("url")?.trim() || fallback.url;
  const key = (fallback.key ?? entry.key).trim() || citationKey({ authors: authorsRaw, title, year });

  return {
    kind,
    bibtex,
    key,
    title,
    authors,
    year,
    ...(doi ? { doi } : {}),
    ...(arxivId ? { arxivId } : {}),
    ...(url ? { url } : {}),
  };
}

export async function resolveDoi(doiInput: string, deps: ResolverDeps): Promise<ResolvedReference> {
  const doi = normalizeDoi(doiInput);
  if (!doi) throw new Error("Enter a valid DOI.");
  const endpoint = withMailto(
    `https://api.crossref.org/works/${encodeURIComponent(doi)}/transform/application/x-bibtex`,
    deps.contactEmail,
  );
  const response = await deps.fetch(endpoint, { signal: deps.signal });
  const bibtex = await checkedText(response, "Crossref");
  return resolvedFromBibtex("doi", bibtex, { doi });
}

function escapeGeneratedBibtex(value: string): string {
  return value.replace(/([&%#_])/g, "\\$1");
}

function decodeXml(value: string): string {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function xmlField(entry: string, name: string): string {
  return decodeXml(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(entry)?.[1] ?? "");
}

export async function resolveArxiv(arxivInput: string, deps: ResolverDeps): Promise<ResolvedReference> {
  const arxivId = normalizeArxivId(arxivInput);
  if (!arxivId) throw new Error("Enter a valid arXiv id.");
  const endpoint = withMailto(
    `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}`,
    deps.contactEmail,
  );
  const response = await deps.fetch(endpoint, { signal: deps.signal });
  const xml = await checkedText(response, "arXiv");
  const entry = /<entry\b[^>]*>([\s\S]*?)<\/entry>/i.exec(xml)?.[1];
  if (!entry) throw new Error("arXiv did not find that paper.");
  const title = xmlField(entry, "title");
  const authors = [...entry.matchAll(/<author\b[^>]*>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/gi)]
    .map((match) => decodeXml(match[1]!))
    .join(" and ");
  const published = xmlField(entry, "published");
  const year = published.slice(0, 4);
  const key = citationKey({ authors, title, year });
  const bibtex = [
    `@misc{${key},`,
    `  title = {${escapeGeneratedBibtex(title)}},`,
    `  author = {${escapeGeneratedBibtex(authors)}},`,
    `  year = {${year}},`,
    `  eprint = {${arxivId}},`,
    "  archivePrefix = {arXiv},",
    `  url = {https://arxiv.org/abs/${arxivId}}`,
    "}",
    "",
  ].join("\n");
  return resolvedFromBibtex("arxiv", bibtex, { arxivId, url: `https://arxiv.org/abs/${arxivId}` });
}

function crossrefAuthors(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((author) => {
      if (!author || typeof author !== "object") return "";
      const item = author as Record<string, unknown>;
      return [item.given, item.family].filter((part): part is string => typeof part === "string" && Boolean(part.trim())).join(" ");
    })
    .filter(Boolean)
    .join(" and ");
}

function crossrefYear(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const dates = (value as Record<string, unknown>)["date-parts"];
  if (!Array.isArray(dates) || !Array.isArray(dates[0])) return "";
  return String(dates[0][0] ?? "");
}

function crossrefVenue(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return typeof value[0] === "string" ? value[0] : "";
}

export async function searchTitleCandidates(title: string, deps: ResolverDeps): Promise<TitleCandidate[]> {
  const query = title.trim();
  if (!query) return [];
  const endpoint = withMailto(
    `https://api.crossref.org/works?query.title=${encodeURIComponent(query)}&rows=5`,
    deps.contactEmail,
  );
  const response = await deps.fetch(endpoint, { signal: deps.signal });
  if (response.status === 429) throw new Error("Crossref rate limit reached. Try again later.");
  if (!response.ok) throw new Error(`Crossref returned HTTP ${response.status}.`);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Crossref returned malformed JSON.");
  }
  const items = (payload as { message?: { items?: unknown } }).message?.items;
  if (!Array.isArray(items)) return [];

  const candidates: TitleCandidate[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const work = item as Record<string, unknown>;
    const doi = typeof work.DOI === "string" ? normalizeDoi(work.DOI) : undefined;
    const foundTitle = Array.isArray(work.title) && typeof work.title[0] === "string" ? work.title[0] : "";
    if (!doi || !foundTitle) continue;
    candidates.push({
      doi,
      title: foundTitle,
      authors: crossrefAuthors(work.author),
      year: crossrefYear(work.published) || crossrefYear(work.issued),
      venue: crossrefVenue(work["container-title"]),
    });
  }
  return candidates;
}

export async function resolveReference(input: string, deps: ResolverDeps): Promise<ResolvedReference> {
  const value = input.trim();
  const kind = detectReferenceInput(value);
  if (kind === "bibtex") return resolvedFromBibtex(kind, value);
  if (kind === "doi") return resolveDoi(value, deps);
  if (kind === "arxiv") return resolveArxiv(value, deps);

  const candidates = await searchTitleCandidates(value, deps);
  if (!candidates.length) throw new Error("Crossref did not find a matching paper.");
  const first = candidates[0]!;
  const resolved = await resolveDoi(first.doi, deps);
  return { ...resolved, kind: "title", key: uniqueCitationKey(resolved.key, new Set()) };
}
