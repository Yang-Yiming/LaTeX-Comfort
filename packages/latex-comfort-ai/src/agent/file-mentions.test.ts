import { describe, expect, it } from "vitest";
import { rankFileMentions } from "./file-mentions";

describe("rankFileMentions", () => {
  it("prefers basename matches and normalizes separators", () => {
    expect(
      rankFileMentions(
        ["chapters/main.tex", "sections/intro.tex", "main.bib", "figures/main.png"],
        "main",
      ),
    ).toEqual([
      { path: "main.bib", name: "main.bib" },
      { path: "chapters/main.tex", name: "main.tex" },
      { path: "figures/main.png", name: "main.png" },
    ]);
  });

  it("returns a bounded list for an empty query", () => {
    const files = Array.from({ length: 80 }, (_, index) => `sections/${index}.tex`);
    expect(rankFileMentions(files, "")).toHaveLength(50);
  });
});
