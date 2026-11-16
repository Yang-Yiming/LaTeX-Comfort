import { describe, expect, it } from "vitest";
import { appendEntryText, citationText, insertCitationText, renameBibtexKey } from "./edit";

describe("bibliography editing", () => {
  it("appends one entry and preserves CRLF", () => {
    expect(appendEntryText("@misc{a}\r\n", "@misc{b}\r\n")).toBe("@misc{a}\r\n\r\n@misc{b}\r\n");
  });

  it("writes the first entry with the requested newline style", () => {
    expect(appendEntryText("", "@misc{a}\r\n")).toBe("@misc{a}\r\n");
    expect(appendEntryText("", "@misc{a}\n")).toBe("@misc{a}\n");
  });

  it("rejects an entry whose key already exists", () => {
    expect(() => appendEntryText("@misc{a}\n", "@misc{A}\n")).toThrow(/already exists/i);
  });

  it("requires exactly one entry", () => {
    expect(() => appendEntryText("", "")).toThrow(/exactly one/i);
    expect(() => appendEntryText("", "@misc{a}\n@misc{b}\n")).toThrow(/exactly one/i);
  });
});

describe("citation insertion", () => {
  it("builds a cite command", () => {
    expect(citationText("vaswani2017attention")).toBe("\\cite{vaswani2017attention}");
  });

  it("inserts a citation at the caret", () => {
    expect(insertCitationText("Text here.", {
      start: { line: 0, character: 5 },
      end: { line: 0, character: 5 },
    }, "a")).toBe("Text \\cite{a}here.");
  });

  it("replaces the active selection", () => {
    expect(insertCitationText("Text old here.", {
      start: { line: 0, character: 5 },
      end: { line: 0, character: 8 },
    }, "a")).toBe("Text \\cite{a} here.");
  });
});

describe("bibtex key updates", () => {
  it("renames only the entry key", () => {
    const source = "@article{old, title={A Paper}, author={Ada Lovelace}}\n";

    expect(renameBibtexKey(source, "new")).toBe("@article{new, title={A Paper}, author={Ada Lovelace}}\n");
  });

  it("requires exactly one entry", () => {
    expect(() => renameBibtexKey("@misc{a}\n@misc{b}\n", "c")).toThrow(/exactly one/i);
  });
});
