import { describe, expect, it } from "vitest";
import { allHunkIds, toggleSelectedHunk } from "./state";

describe("review state", () => {
  it("selects every hunk by default", () => {
    expect([...allHunkIds([{ id: 2 }, { id: 7 }])]).toEqual([2, 7]);
  });

  it("toggles a selected hunk without mutating the previous set", () => {
    const selected = new Set([0, 1, 2]);

    const rejected = toggleSelectedHunk(selected, 1, false);
    const acceptedAgain = toggleSelectedHunk(rejected, 1, true);

    expect([...selected]).toEqual([0, 1, 2]);
    expect([...rejected]).toEqual([0, 2]);
    expect([...acceptedAgain]).toEqual([0, 1, 2]);
  });
});
