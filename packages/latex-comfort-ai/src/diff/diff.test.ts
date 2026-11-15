import { describe, expect, it } from "vitest";
import { diffHunks } from "./diff";

describe("diffHunks", () => {
  it("returns no hunks for identical text", () => {
    expect(diffHunks("The same text.", "The same text.")).toEqual([]);
  });

  it("returns a word replacement", () => {
    expect(diffHunks("The quick brown fox", "The fast brown fox")).toEqual([
      { id: 0, from: 4, to: 9, insert: "fast" },
    ]);
  });

  it("returns a pure insertion at an offset", () => {
    expect(diffHunks("Hello world", "Hello brave world")).toEqual([
      { id: 0, from: 6, to: 6, insert: "brave " },
    ]);
  });

  it("returns ordered non-overlapping hunks for multiple changes", () => {
    const hunks = diffHunks(
      "The quick brown fox.",
      "A fast brown fox!",
    );
    expect(hunks.map((hunk) => [hunk.from, hunk.to, hunk.insert])).toEqual([
      [0, 3, "A"],
      [4, 9, "fast"],
      [19, 20, "!"],
    ]);
  });

  it("preserves LaTeX commands when surrounding prose changes", () => {
    expect(
      diffHunks(
        "This is \\textbf{very} clear.",
        "This is \\textbf{extremely} clear.",
      ),
    ).toEqual([{ id: 0, from: 16, to: 20, insert: "extremely" }]);
  });
});
