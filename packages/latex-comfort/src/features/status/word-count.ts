export type TextCount = {
  words: number;
  characters: number;
  lines: number;
};

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;
const WORD = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu;

function withoutComments(source: string): string {
  return source.split("\n").map((line) => {
    for (let index = 0; index < line.length; index += 1) {
      if (line[index] !== "%") continue;
      let slashes = 0;
      while (line[index - 1 - slashes] === "\\") slashes += 1;
      if (slashes % 2 === 0) return line.slice(0, index);
    }
    return line;
  }).join("\n");
}

export function countWords(source: string): TextCount {
  if (!source) return { words: 0, characters: 0, lines: 0 };
  const prose = withoutComments(source).replace(/\\[A-Za-z@]+\*?/gu, " ").replace(/\\/gu, " ");
  const cjk = prose.match(CJK)?.length ?? 0;
  const words = (prose.replace(CJK, " ").match(WORD)?.length ?? 0) + cjk;
  return {
    words,
    characters: source.length,
    lines: source.split("\n").length,
  };
}

export function wordCountLabel(count: TextCount, selected: boolean): {
  text: string;
  tooltip: string;
} {
  const words = `${count.words} ${count.words === 1 ? "word" : "words"}`;
  const characters = `${count.characters} ${count.characters === 1 ? "character" : "characters"}`;
  const lines = `${count.lines} ${count.lines === 1 ? "line" : "lines"}`;
  return selected
    ? {
        text: `$(symbol-string) ${count.words} selected`,
        tooltip: `Selection: ${words}, ${characters}, ${lines}.`,
      }
    : {
        text: `$(symbol-string) ${count.words} words`,
        tooltip: `This file: ${words}, ${characters}, ${lines}.`,
      };
}
