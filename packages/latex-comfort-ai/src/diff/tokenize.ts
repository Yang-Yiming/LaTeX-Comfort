export interface Token {
  text: string;
  from: number;
  to: number;
}

const TOKEN = /\\(?:[A-Za-z@]+|.)|[\p{L}\p{N}\p{M}]+|[^\S\n]+|\n|./gsu;
const WORD = /^[\p{L}\p{N}\p{M}]+$/u;
const segmenter =
  typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter(undefined, { granularity: "word" })
    : null;

/**
 * Tokenizes prose while keeping LaTeX control sequences atomic. CJK words
 * are segmented too, because a paragraph-sized token makes a useful local
 * diff impossible.
 */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const match of text.matchAll(TOKEN)) {
    const raw = match[0];
    const start = match.index ?? 0;
    if (WORD.test(raw) && segmenter) {
      for (const part of segmenter.segment(raw)) {
        tokens.push({
          text: part.segment,
          from: start + part.index,
          to: start + part.index + part.segment.length,
        });
      }
    } else {
      tokens.push({ text: raw, from: start, to: start + raw.length });
    }
  }
  return tokens;
}
