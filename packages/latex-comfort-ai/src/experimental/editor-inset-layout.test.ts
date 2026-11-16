import { describe, expect, it } from "vitest";
import {
  chooseInsetLine,
  contentHeightToLines,
  estimateInsetHeight,
} from "./editor-inset-layout";
import type { ReviewReadyState } from "@latex-comfort/shared";

const review: ReviewReadyState = {
  original: "one\ntwo\nthree",
  proposed: "one\nTWO\nthree",
  hunks: [{ id: 0, from: 4, to: 7, insert: "TWO" }],
  mode: "polish",
  providerLabel: "test",
};

describe("editor inset layout", () => {
  it("anchors below the last selected text line", () => {
    expect(
      chooseInsetLine({
        uri: "file:///paper.tex",
        range: {
          start: { line: 3, character: 2 },
          end: { line: 5, character: 0 },
        },
        textLength: 20,
      }),
    ).toBe(4);
    expect(
      chooseInsetLine({
        uri: "file:///paper.tex",
        range: {
          start: { line: 3, character: 2 },
          end: { line: 5, character: 9 },
        },
        textLength: 20,
      }),
    ).toBe(5);
  });

  it("keeps inset height bounded for long reviews", () => {
    expect(estimateInsetHeight(review)).toBeGreaterThanOrEqual(12);
    expect(estimateInsetHeight(review)).toBeLessThanOrEqual(28);
    expect(
      estimateInsetHeight({
        ...review,
        hunks: Array.from({ length: 20 }, (_, id) => ({
          id,
          from: 0,
          to: 0,
          insert: "x",
        })),
      }),
    ).toBe(28);
  });
});


  it("converts measured card height into bounded inset lines", () => {
    expect(contentHeightToLines(250, 20)).toBe(14);
    expect(contentHeightToLines(40, 20)).toBe(8);
    expect(contentHeightToLines(2_000, 20)).toBe(60);
  });
