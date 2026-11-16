import { describe, expect, it } from "vitest";
import type { ReviewViewState } from "./state";
import { reviewStateToMessage } from "./webview-message";

const loading: ReviewViewState = {
  status: "loading",
  context: {
    uri: "file:///paper.tex",
    range: {
      start: { line: 2, character: 0 },
      end: { line: 4, character: 0 },
    },
    textLength: 100,
  },
  mode: "rewrite",
  instruction: "Shorten it",
};

describe("reviewStateToMessage", () => {
  it("maps loading and ignores idle state", () => {
    expect(reviewStateToMessage(loading, false)).toEqual({
      type: "loading",
      mode: "rewrite",
      instruction: "Shorten it",
    });
    expect(reviewStateToMessage({ status: "idle" }, false)).toBeUndefined();
  });

  it("includes controller-owned hunk selection in ready state", () => {
    const message = reviewStateToMessage(
      {
        status: "ready",
        context: loading.status === "loading" ? loading.context : ({} as never),
        review: {
          original: "before",
          proposed: "after",
          hunks: [{ id: 0, from: 0, to: 6, insert: "after" }],
          mode: "polish",
          providerLabel: "test",
        },
        selectedHunkIds: [0],
      },
      true,
    );

    expect(message).toMatchObject({
      type: "ready",
      selectedHunkIds: [0],
      canOpenSidebar: true,
    });
  });

  it("maps errors", () => {
    expect(
      reviewStateToMessage(
        { status: "error", message: "Nope", canConfigure: true },
        false,
      ),
    ).toEqual({ type: "error", message: "Nope", canConfigure: true });
  });
});
