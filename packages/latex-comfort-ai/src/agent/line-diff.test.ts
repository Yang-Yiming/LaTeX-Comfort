import { describe, expect, it } from "vitest";
import { lineHunks } from "./line-diff";

describe("lineHunks", () => {
  it("groups changed lines into independently reviewable hunks", () => {
    const before = "one\ntwo\nthree\nfour\n";
    const after = "one\nTWO\nthree\nfour\nfive\n";

    expect(lineHunks(before, after)).toEqual([
      {
        id: 0,
        beforeStart: 1,
        beforeEnd: 2,
        afterStart: 1,
        afterEnd: 2,
        beforeText: "two\n",
        afterText: "TWO\n",
      },
      {
        id: 1,
        beforeStart: 4,
        beforeEnd: 4,
        afterStart: 4,
        afterEnd: 5,
        beforeText: "",
        afterText: "five\n",
      },
    ]);
  });

  it("reports a deletion without inventing an after line", () => {
    expect(lineHunks("keep\nremove\n", "keep\n")).toEqual([
      {
        id: 0,
        beforeStart: 1,
        beforeEnd: 2,
        afterStart: 1,
        afterEnd: 1,
        beforeText: "remove\n",
        afterText: "",
      },
    ]);
  });
});
