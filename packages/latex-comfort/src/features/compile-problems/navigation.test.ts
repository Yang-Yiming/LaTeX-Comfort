import { describe, expect, it } from "vitest";
import { cycleProblemIndex } from "./navigation";

describe("compile problem navigation", () => {
  it("moves forward and wraps", () => {
    expect(cycleProblemIndex(3, -1, 1)).toBe(0);
    expect(cycleProblemIndex(3, 2, 1)).toBe(0);
  });

  it("moves backward and wraps", () => {
    expect(cycleProblemIndex(3, -1, -1)).toBe(2);
    expect(cycleProblemIndex(3, 0, -1)).toBe(2);
  });

  it("returns no target for an empty list", () => {
    expect(cycleProblemIndex(0, -1, 1)).toBe(-1);
  });
});
