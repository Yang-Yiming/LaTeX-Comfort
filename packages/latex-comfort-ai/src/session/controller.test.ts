import { describe, expect, it, vi } from "vitest";
import type { ReviewReadyState, SelectionContext } from "@latex-comfort/shared";
import type { ReviewViewState } from "../review/state";
import { EditController } from "./controller";

const selection: SelectionContext = {
  uri: "file:///paper.tex",
  range: {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 19 },
  },
  text: "The quick brown fox",
  languageId: "latex",
  documentVersion: 1,
};

function setup(proposed = "The fast brown fox") {
  const states: ReviewViewState[] = [];
  const applied: string[] = [];
  const surface = {
    render: vi.fn((state: ReviewViewState) => states.push(state)),
    dispose: vi.fn(),
  };
  const controller = new EditController({
    provider: async () => ({
      label: "test-provider",
      provider: {
        complete: async () => ({ text: proposed, label: "test-model" }),
      },
    }),
    surface,
    currentSnapshot: async () => ({
      uri: selection.uri,
      version: 1,
      text: selection.text,
    }),
    applyEdit: async (_session, text) => {
      applied.push(text);
      return true;
    },
  });
  return { controller, surface, states, applied };
}

describe("EditController", () => {
  it("shows a local diff after the provider responds", async () => {
    const { controller, states } = setup();
    await controller.start(selection, "polish", "Make it faster.", {
      before: "",
      after: "",
    });

    const loading = states[0];
    const ready = states[1];
    expect(loading).toMatchObject({
      status: "loading",
      mode: "polish",
      instruction: "Make it faster.",
    });
    expect(ready?.status).toBe("ready");
    if (ready?.status !== "ready") throw new Error("expected ready state");
    expect(ready.review.proposed).toBe("The fast brown fox");
    expect(ready.review.hunks).toEqual([
      { id: 0, from: 4, to: 9, insert: "fast" },
    ]);
    expect(ready.review.providerLabel).toBe("test-provider");
    expect(ready.review.modelLabel).toBe("test-model");
    expect(ready.selectedHunkIds).toEqual([0]);
  });

  it("keeps selected hunks in the controller", async () => {
    const { controller, states } = setup();
    await controller.start(selection, "polish", "", { before: "", after: "" });

    controller.toggleHunk(0, false);

    const ready = states.at(-1);
    expect(ready?.status).toBe("ready");
    if (ready?.status !== "ready") throw new Error("expected ready state");
    expect(ready.selectedHunkIds).toEqual([]);
  });

  it("applies only the hunks currently selected in the controller", async () => {
    const { controller, applied } = setup("The fast brown cat");
    await controller.start(selection, "polish", "", { before: "", after: "" });

    const ready = controller.state;
    if (ready.status !== "ready" || ready.review.hunks.length < 2) {
      throw new Error("expected multiple hunks");
    }
    controller.toggleHunk(ready.review.hunks[0]!.id, false);
    await controller.accept();

    expect(applied).toEqual(["The quick brown cat"]);
  });

  it("refuses to apply when the document changed", async () => {
    const states: ReviewViewState[] = [];
    const applyEdit = vi.fn(async () => true);
    const controller = new EditController({
      provider: async () => ({
        label: "test-provider",
        provider: {
          complete: async () => ({ text: "The fast brown fox", label: "model" }),
        },
      }),
      surface: {
        render: vi.fn((state: ReviewViewState) => states.push(state)),
        dispose: vi.fn(),
      },
      currentSnapshot: async () => ({
        uri: selection.uri,
        version: 2,
        text: "The quick brown fox",
      }),
      applyEdit,
    });

    await controller.start(selection, "polish", "", { before: "", after: "" });
    await controller.accept();

    expect(applyEdit).not.toHaveBeenCalled();
    expect(states.at(-1)).toMatchObject({ status: "error" });
    expect((states.at(-1) as { message?: string }).message).toContain("changed");
  });
});
