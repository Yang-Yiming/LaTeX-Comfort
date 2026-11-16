import { describe, expect, it } from "vitest";
import { entryField, parseBibliography } from "./bibtex";

describe("parseBibliography", () => {
  it("reads braced and quoted fields with source lines", () => {
    const source = "@article{a,\n  title = {A {Nested} Title},\n  author = \"Ada Lovelace\",\n  year = 2024\n}\n";
    const parsed = parseBibliography(source);

    expect(parsed.error).toBeNull();
    const entry = parsed.document!.entries[0]!;
    expect(entry.key).toBe("a");
    expect(entry.line).toBe(1);
    expect(entryField(source, entry, "title", parsed.document!.macros)).toBe("A {Nested} Title");
    expect(entryField(source, entry, "author", parsed.document!.macros)).toBe("Ada Lovelace");
  });

  it("expands @string values and skips comments and preambles", () => {
    const source = "@string{conf = \"ICML\"}\n@comment{ignored}\n@inproceedings{x, title={X}, booktitle=conf}\n";
    const parsed = parseBibliography(source);

    expect(parsed.document!.entries).toHaveLength(1);
    expect(entryField(source, parsed.document!.entries[0]!, "booktitle", parsed.document!.macros)).toBe("ICML");
  });

  it("reports an unclosed entry without throwing", () => {
    const parsed = parseBibliography("@article{bad, title={Never closed}\r\n");

    expect(parsed.document).toBeNull();
    expect(parsed.error?.reason).toBe("unclosed");
  });

  it("keeps line numbers stable with CRLF", () => {
    const parsed = parseBibliography("@misc{a}\r\n\r\n@misc{b}\r\n");

    expect(parsed.document!.entries.map((entry) => entry.line)).toEqual([1, 3]);
  });
});
