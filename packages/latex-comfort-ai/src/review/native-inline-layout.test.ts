import { describe, expect, it } from "vitest";
import {
  formatInsertionPreview,
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

  it("makes compact one-line insertion previews", () => {
    expect(formatInsertionPreview("  faster\nand clearer  ")).toBe(
      "faster and clearer",
    );
    expect(formatInsertionPreview("x".repeat(100), 20)).toBe(
      `${"x".repeat(19)}…`,
    );
  });
});
