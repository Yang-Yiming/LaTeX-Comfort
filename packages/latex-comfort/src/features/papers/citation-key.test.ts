import { describe, expect, it } from "vitest";
import { citationKey, uniqueCitationKey } from "./citation-key";

describe("citation keys", () => {
  it("builds a stable author-year-title key", () => {
    expect(citationKey({
      authors: "Vaswani, Ashish and Shazeer, Noam",
      title: "Attention Is All You Need",
      year: "2017",
    })).toBe("vaswani2017attention");
  });

  it("handles corporate authors and missing years", () => {
    expect(citationKey({
      authors: "{Google Brain}",
      title: "Machine Learning",
      year: "",
    })).toBe("googlebrain0000machine");
  });

  it("adds letter suffixes until the key is unique", () => {
    expect(uniqueCitationKey("vaswani2017attention", new Set(["vaswani2017attention"]))).toBe("vaswani2017attentionb");
    expect(uniqueCitationKey("vaswani2017attention", new Set(["vaswani2017attention", "vaswani2017attentionb"]))).toBe("vaswani2017attentionc");
  });
});
