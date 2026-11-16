export type CitationCompletion = {
  query: string;
  replaceFrom: number;
  existingKeys: Set<string>;
};

export type CitationRange = {
  command: string;
  key: string;
  start: number;
  end: number;
};

const CITE_LOCAL = String.raw`\\([A-Za-z]*cite[A-Za-z]*)\*?(?:\[[^\]]*\]\s*){0,2}\{([^}]*)\}`;
const CITE_GLOBAL = new RegExp(CITE_LOCAL, "gi");
const CITE_AT_END = new RegExp("\\\\([A-Za-z]*cite[A-Za-z]*)\\*?(?:\\[[^\\]]*\\]\\s*){0,2}\\{([^}]*)$", "i");

function commentedAt(source: string, offset: number): boolean {
  const lineStart = source.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
  const prefix = source.slice(lineStart, offset);
  for (let index = 0; index < prefix.length; index += 1) {
    if (prefix[index] !== "%") continue;
    let slashes = 0;
    while (prefix[index - 1 - slashes] === "\\") slashes += 1;
    if (slashes % 2 === 0) return true;
  }
  return false;
}

export function citationCompletionContext(before: string): CitationCompletion | null {
  const match = CITE_AT_END.exec(before);
  if (!match) return null;
  const content = match[2] ?? "";
  const comma = content.lastIndexOf(",");
  const segmentStart = comma + 1;
  const raw = content.slice(segmentStart);
  const query = raw.trim();
  const existingKeys = new Set(
    content
      .slice(0, segmentStart)
      .split(",")
      .map((key) => key.trim())
      .filter((key) => key && key !== "*"),
  );
  return {
    query,
    replaceFrom: before.length - query.length,
    existingKeys,
  };
}

export function citationRanges(source: string): CitationRange[] {
  const ranges: CitationRange[] = [];
  CITE_GLOBAL.lastIndex = 0;
  for (let match = CITE_GLOBAL.exec(source); match; match = CITE_GLOBAL.exec(source)) {
    if (commentedAt(source, match.index)) continue;
    const command = match[1] ?? "";
    const content = match[2] ?? "";
    const contentStart = match.index + match[0].lastIndexOf("{") + 1;
    for (const part of content.matchAll(/[^,]+/g)) {
      const raw = part[0];
      const leading = raw.length - raw.trimStart().length;
      const key = raw.trim();
      if (!key || key === "*") continue;
      const start = contentStart + (part.index ?? 0) + leading;
      ranges.push({ command, key, start, end: start + key.length });
    }
  }
  return ranges;
}

export function citationKeyAtPosition(source: string, offset: number): CitationRange | undefined {
  return citationRanges(source).find((range) => offset >= range.start && offset <= range.end);
}

export function citationUseCounts(source: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const range of citationRanges(source)) {
    if (range.command.toLowerCase() === "nocite") continue;
    const key = range.key.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
