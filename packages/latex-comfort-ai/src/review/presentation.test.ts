import { describe, expect, it } from "vitest";
import type { ReviewContext } from "./state";
import { chooseReviewSurface, normalizeReviewPresentation } from "./presentation";

const short: ReviewContext = {
  uri: "file:///paper.tex",
  range: {
    start: { line: 3, character: 0 },
    end: { line: 8, character: 12 },
  },
  textLength: 420,
};

const long: ReviewContext = {
  ...short,
  range: {
    start: { line: 3, character: 0 },
    end: { line: 40, character: 12 },
  },
  textLength: 2_400,
};

describe("chooseReviewSurface", () => {
  it("uses the experimental inset for short auto reviews when available", () => {
    expect(chooseReviewSurface("auto", short, true)).toBe("editorInset");
  });

  it("falls back to native inline in a stable build", () => {
    expect(chooseReviewSurface("auto", short, false)).toBe("nativeInline");
    expect(chooseReviewSurface("editorInset", short, false)).toBe("nativeInline");
  });

  it("keeps long selections in the side panel", () => {
    expect(chooseReviewSurface("auto", long, true)).toBe("sidePanel");
  });

  it("honors explicit stable surfaces", () => {
    expect(chooseReviewSurface("sidePanel", short, true)).toBe("sidePanel");
    expect(chooseReviewSurface("inline", long, true)).toBe("nativeInline");
  });
});


describe("normalizeReviewPresentation", () => {
  it("normalizes known values and falls back for stale experimental settings", () => {
    expect(normalizeReviewPresentation("sidePanel")).toBe("sidePanel");
    expect(normalizeReviewPresentation("editorInset")).toBe("editorInset");
    expect(normalizeReviewPresentation("decorations")).toBe("auto");
    expect(normalizeReviewPresentation(undefined)).toBe("auto");
  });
});
