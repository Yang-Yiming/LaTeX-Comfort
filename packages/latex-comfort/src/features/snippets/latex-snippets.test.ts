import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Snippet = { prefix: string; body: string | string[]; description?: string };

const snippets = JSON.parse(
  readFileSync(new URL("../../../snippets/latex.json", import.meta.url), "utf8"),
) as Record<string, Snippet>;

describe("LaTeX slash snippets", () => {
  it("provides the P0 quick-insert commands", () => {
    const prefixes = Object.values(snippets).map((snippet) => snippet.prefix);
    for (const prefix of [
      "/section",
      "/itemize",
      "/enumerate",
      "/equation",
      "/align",
      "/figure",
      "/table",
      "/frac",
      "/bold",
      "/italic",
      "/cite",
      "/ref",
      "/label",
      "/env",
    ]) {
      expect(prefixes).toContain(prefix);
    }
  });

  it("uses unique prefixes and non-empty bodies", () => {
    const prefixes = Object.values(snippets).map((snippet) => snippet.prefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    expect(Object.values(snippets).every((snippet) =>
      typeof snippet.body === "string" ? snippet.body.length > 0 : snippet.body.length > 0)).toBe(true);
  });
});
