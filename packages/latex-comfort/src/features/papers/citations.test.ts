import { describe, expect, it } from "vitest";
import {
  citationCompletionContext,
  citationKeyAtPosition,
  citationUseCounts,
} from "./citations";

describe("citation completion context", () => {
  it("finds the current key fragment inside a cite command", () => {
    expect(citationCompletionContext("Text \\cite{atten")).toEqual({
      query: "atten",
      replaceFrom: 11,
      existingKeys: new Set(),
    });
  });

  it("keeps prior keys in the same citation command", () => {
    expect(citationCompletionContext("\\citep[see][p. 2]{vaswani2017attention, att")).toEqual({
      query: "att",
      replaceFrom: 40,
      existingKeys: new Set(["vaswani2017attention"]),
    });
  });

  it("ignores text outside a citation command", () => {
    expect(citationCompletionContext("Attention is all you need")).toBeNull();
  });
});

describe("citation keys", () => {
  it("finds the key under the cursor", () => {
    const source = "See \\cite{vaswani2017attention} and \\citep{he2016deep}.";
    expect(citationKeyAtPosition(source, source.indexOf("vaswani") + 3)).toMatchObject({
      key: "vaswani2017attention",
    });
    expect(citationKeyAtPosition(source, source.indexOf("he2016") + 1)).toMatchObject({
      key: "he2016deep",
    });
  });

  it("counts real citations but not nocite or comments", () => {
    const source = [
      "\\cite{vaswani2017attention, he2016deep}",
      "\\nocite{vaswani2017attention}",
      "% \\cite{unused}",
      "\\citep{he2016deep}",
    ].join("\n");

    expect([...citationUseCounts(source)]).toEqual([
      ["vaswani2017attention", 1],
      ["he2016deep", 2],
    ]);
  });
});
