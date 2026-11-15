import { describe, expect, it } from "vitest";
import { tokenize } from "./tokenize";

describe("tokenize", () => {
  it("keeps a LaTeX control sequence atomic", () => {
    expect(tokenize("\\textbf{Hello}").map((token) => token.text)).toEqual([
      "\\textbf",
      "{",
      "Hello",
      "}",
    ]);
  });

  it("keeps spacing and punctuation separate from words", () => {
    expect(tokenize("Hello, world").map((token) => token.text)).toEqual([
      "Hello",
      ",",
      " ",
      "world",
    ]);
  });

  it("segments unspaced CJK instead of treating the paragraph as one token", () => {
    expect(tokenize("你好世界").length).toBeGreaterThan(1);
  });
});
