import { describe, expect, it } from "vitest";
import { applyHunks } from "./apply";

const original = "The quick brown fox";
const hunks = [
  { id: 0, from: 4, to: 9, insert: "fast" },
  { id: 1, from: 16, to: 19, insert: "dog" },
];

describe("applyHunks", () => {
  it("applies every selected hunk", () => {
    expect(applyHunks(original, hunks)).toBe("The fast brown dog");
  });

  it("applies only the selected hunks", () => {
    expect(applyHunks(original, [hunks[1]!])).toBe("The quick brown dog");
  });

  it("returns the original text when no hunk is selected", () => {
    expect(applyHunks(original, [])).toBe(original);
  });
});
