import { describe, expect, it } from "vitest";
import {
  acceptLensTitle,
  hunkHoverMarkdown,
  rangeWithinSelection,
} from "./native-inline-layout";

describe("native inline layout", () => {
  it("maps original-text offsets back into the document", () => {
    expect(
      rangeWithinSelection(
        {
          start: { line: 3, character: 5 },
          end: { line: 5, character: 5 },
        },
        "one\ntwo\nthree",
        4,
        7,
      ),
    ).toEqual({
      start: { line: 4, character: 0 },
      end: { line: 4, character: 3 },
    });
  });

  it("keeps the first line offset for a single-line selection", () => {
    expect(
      rangeWithinSelection(
        {
          start: { line: 7, character: 12 },
          end: { line: 7, character: 22 },
        },
        "The quick fox",
        4,
        9,
      ),
    ).toEqual({
      start: { line: 7, character: 16 },
      end: { line: 7, character: 21 },
    });
  });

  it("labels the compact acceptance action", () => {
    expect(acceptLensTitle(8, 8)).toBe("$(check) Accept all (8)");
    expect(acceptLensTitle(3, 8)).toBe("$(check) Accept 3 of 8");
    expect(acceptLensTitle(0, 8)).toBe("$(circle-slash) No changes selected");
  });

  it("builds a trusted hover action for one change", () => {
    const markdown = hunkHoverMarkdown(
      2,
      8,
      true,
      "latexComfort.ai.review.toggleHunk",
    );

    expect(markdown).toContain("**Change 3 of 8**");
    expect(markdown).toContain("Skip this change");
    expect(markdown).toContain("command:latexComfort.ai.review.toggleHunk?%5B2%2Cfalse%5D");
  });
});
