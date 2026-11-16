import type { ReviewContext } from "./state";
import type { ReviewSurfaceKind } from "./surface";

export type ReviewPresentationSetting =
  | "auto"
  | "sidePanel"
  | "inline"
  | "editorInset";

const REVIEW_PRESENTATIONS: readonly ReviewPresentationSetting[] = [
  "auto",
  "sidePanel",
  "inline",
  "editorInset",
];

const LONG_REVIEW_LINES = 20;
const LONG_REVIEW_CHARS = 1_600;

export function chooseReviewSurface(
  setting: ReviewPresentationSetting,
  context: ReviewContext,
  editorInsetAvailable: boolean,
): ReviewSurfaceKind {
  if (setting === "sidePanel") return "sidePanel";
  if (setting === "inline") return "nativeInline";
  if (setting === "editorInset") {
    return editorInsetAvailable ? "editorInset" : "nativeInline";
  }

  const lines =
    context.range.end.line - context.range.start.line +
    (context.range.end.character > 0 ? 1 : 0);
  if (lines > LONG_REVIEW_LINES || context.textLength > LONG_REVIEW_CHARS) {
    return "sidePanel";
  }
  return editorInsetAvailable ? "editorInset" : "nativeInline";
}

export function normalizeReviewPresentation(
  value: unknown,
): ReviewPresentationSetting {
  return typeof value === "string" &&
    REVIEW_PRESENTATIONS.includes(value as ReviewPresentationSetting)
    ? (value as ReviewPresentationSetting)
    : "auto";
}
