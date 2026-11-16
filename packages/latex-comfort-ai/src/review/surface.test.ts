import { describe, expect, it, vi } from "vitest";
import { ReviewSurfaceHost, type ReviewSurface } from "./surface";
import type { ReviewViewState } from "./state";

const loading: ReviewViewState = {
  status: "loading",
  context: {
    uri: "file:///paper.tex",
    range: {
      start: { line: 1, character: 0 },
      end: { line: 2, character: 0 },
    },
    textLength: 20,
  },
  mode: "polish",
};

function surface() {
  return {
    render: vi.fn(),
    dispose: vi.fn(),
  } satisfies ReviewSurface;
}

describe("ReviewSurfaceHost", () => {
  it("creates the preferred surface lazily and rerenders it", () => {
    const native = surface();
    const sidebar = surface();
    const host = new ReviewSurfaceHost(
      {
        nativeInline: () => native,
        sidePanel: () => sidebar,
      },
      () => "nativeInline",
    );

    host.render(loading);
    host.render({ ...loading, mode: "proofread" });

    expect(native.render).toHaveBeenCalledTimes(2);
    expect(sidebar.render).not.toHaveBeenCalled();
  });

  it("switches surfaces without losing the current state", () => {
    const native = surface();
    const sidebar = surface();
    const host = new ReviewSurfaceHost(
      {
        nativeInline: () => native,
        sidePanel: () => sidebar,
      },
      () => "nativeInline",
    );

    host.render(loading);
    host.showSidebar();

    expect(native.dispose).toHaveBeenCalledOnce();
    expect(sidebar.render).toHaveBeenCalledWith(loading);
  });

  it("disposes the active surface when the review becomes idle", () => {
    const native = surface();
    const host = new ReviewSurfaceHost(
      { nativeInline: () => native },
      () => "nativeInline",
    );

    host.render(loading);
    host.render({ status: "idle" });

    expect(native.dispose).toHaveBeenCalledOnce();
  });
});
