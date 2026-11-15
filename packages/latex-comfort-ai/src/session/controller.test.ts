import { describe, expect, it, vi } from "vitest";
import type { ReviewReadyState, SelectionContext } from "@latex-comfort/shared";
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
  const ready: ReviewReadyState[] = [];
  const errors: string[] = [];
  const applied: string[] = [];
  const panel = {
    showLoading: vi.fn(),
    showReady: vi.fn((state: ReviewReadyState) => ready.push(state)),
    showError: vi.fn((message: string) => errors.push(message)),
    close: vi.fn(),
  };
  const controller = new EditController({
    provider: async () => ({
      label: "test-provider",
      provider: {
        complete: async () => ({ text: proposed, label: "test-model" }),
      },
    }),
    panel,
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
  return { controller, panel, ready, errors, applied };
}

describe("EditController", () => {
  it("shows a local diff after the provider responds", async () => {
    const { controller, panel, ready } = setup();
    await controller.start(selection, "polish", "Make it faster.", {
      before: "",
      after: "",
    });

    expect(panel.showLoading).toHaveBeenCalledWith("polish", "Make it faster.");
    expect(ready[0]?.hunks).toEqual([
      { id: 0, from: 4, to: 9, insert: "fast" },
    ]);
    expect(ready[0]?.providerLabel).toBe("test-provider");
    expect(ready[0]?.modelLabel).toBe("test-model");
  });

  it("applies only accepted hunks and closes the review", async () => {
    const { controller, panel, applied } = setup();
    await controller.start(selection, "polish", "", { before: "", after: "" });
    await controller.accept([0]);

    expect(applied).toEqual(["The fast brown fox"]);
    expect(panel.close).toHaveBeenCalledOnce();
  });

  it("refuses to apply when the document changed", async () => {
    const ready: ReviewReadyState[] = [];
    const errors: string[] = [];
    const applyEdit = vi.fn(async () => true);
    const controller = new EditController({
      provider: async () => ({
        label: "test-provider",
        provider: {
          complete: async () => ({ text: "The fast brown fox", label: "model" }),
        },
      }),
      panel: {
        showLoading: vi.fn(),
        showReady: vi.fn((state: ReviewReadyState) => ready.push(state)),
        showError: vi.fn((message: string) => errors.push(message)),
        close: vi.fn(),
      },
      currentSnapshot: async () => ({
        uri: selection.uri,
        version: 2,
        text: "The quick brown fox",
      }),
      applyEdit,
    });

    await controller.start(selection, "polish", "", { before: "", after: "" });
    await controller.accept([0]);

    expect(applyEdit).not.toHaveBeenCalled();
    expect(errors.at(-1)).toContain("changed");
  });
});
