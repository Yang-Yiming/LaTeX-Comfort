import { describe, expect, it } from "vitest";
import { reviewPresentationOptions } from "./presentation-options";

describe("reviewPresentationOptions", () => {
  it("offers the stable review surfaces", () => {
    expect(reviewPresentationOptions(false).map((option) => option.value)).toEqual([
      "auto",
      "inline",
      "sidePanel",
    ]);
  });

  it("adds the experimental editor inset to experimental builds", () => {
    expect(reviewPresentationOptions(true).map((option) => option.value)).toEqual([
      "auto",
      "inline",
      "editorInset",
      "sidePanel",
    ]);
  });
});
