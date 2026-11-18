import { describe, expect, it } from "vitest";
import { countWords, wordCountLabel } from "./word-count";

describe("countWords", () => {
  it("counts prose while ignoring comments and LaTeX commands", () => {
    expect(countWords("Hello \\textbf{world}. % ignored words\nSecond line.")).toEqual({
      words: 4,
      characters: 50,
      lines: 2,
    });
  });

  it("counts CJK characters as words", () => {
    expect(countWords("中文写作 and two words")).toMatchObject({ words: 7 });
  });

  it("handles escaped percent signs as prose", () => {
    expect(countWords("100\\% coverage")).toMatchObject({ words: 2 });
  });

  it("returns zeros for empty text", () => {
    expect(countWords("")).toEqual({ words: 0, characters: 0, lines: 0 });
  });
});

describe("wordCountLabel", () => {
  it("labels a file count", () => {
    expect(wordCountLabel({ words: 12, characters: 80, lines: 3 }, false)).toEqual({
      text: "$(symbol-string) 12 words",
      tooltip: "This file: 12 words, 80 characters, 3 lines.",
    });
  });

  it("labels a selection count", () => {
    expect(wordCountLabel({ words: 2, characters: 12, lines: 1 }, true)).toEqual({
      text: "$(symbol-string) 2 selected",
      tooltip: "Selection: 2 words, 12 characters, 1 line.",
    });
  });
});
