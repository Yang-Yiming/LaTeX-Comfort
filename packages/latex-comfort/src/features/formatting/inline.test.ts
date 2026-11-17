import { describe, expect, it } from "vitest";
import { toggleLatexInline, type InlineFormatResult, type OffsetRange } from "./inline";

function selection(start: number, end = start): OffsetRange {
  return { start, end };
}

function textAfter(source: string, result: InlineFormatResult): string {
  let text = source;
  for (const edit of [...result.edits].sort((a, b) => b.start - a.start || b.end - a.end)) {
    text = text.slice(0, edit.start) + edit.insert + text.slice(edit.end);
  }
  return text;
}

describe("toggleLatexInline", () => {
  it("wraps the selection in textbf and keeps the content selected", () => {
    const result = toggleLatexInline("hello", [selection(0, 5)], "bold");

    expect(textAfter("hello", result)).toBe("\\textbf{hello}");
    expect(result.selections).toEqual([selection(8, 13)]);
    expect(result.edits).toEqual([
      { start: 0, end: 0, insert: "\\textbf{" },
      { start: 5, end: 5, insert: "}" },
    ]);
  });

  it("removes textbf when the whole command is selected", () => {
    const result = toggleLatexInline("\\textbf{hello}", [selection(0, 13)], "bold");

    expect(textAfter("\\textbf{hello}", result)).toBe("hello");
    expect(result.selections).toEqual([selection(0, 5)]);
  });

  it("removes textbf when its content is selected", () => {
    const result = toggleLatexInline("x \\textbf{hello} y", [selection(10, 15)], "bold");

    expect(textAfter("x \\textbf{hello} y", result)).toBe("x hello y");
    expect(result.selections).toEqual([selection(2, 7)]);
  });

  it("recognises textit as emphasis and writes emph when adding it", () => {
    const removed = toggleLatexInline("A \\textit{word} B", [selection(10, 14)], "emphasis");
    expect(textAfter("A \\textit{word} B", removed)).toBe("A word B");
    expect(removed.selections).toEqual([selection(2, 6)]);

    const added = toggleLatexInline("word", [selection(0, 4)], "emphasis");
    expect(textAfter("word", added)).toBe("\\emph{word}");
    expect(added.selections).toEqual([selection(6, 10)]);
  });

  it("leaves whitespace around the selection outside the command", () => {
    const result = toggleLatexInline("  hello  ", [selection(0, 9)], "bold");

    expect(textAfter("  hello  ", result)).toBe("  \\textbf{hello}  ");
    expect(result.selections).toEqual([selection(10, 15)]);
  });

  it("handles nested braces inside a command", () => {
    const source = "\\textbf{a {nested} value}";
    const result = toggleLatexInline(source, [selection(0, source.length)], "bold");

    expect(textAfter(source, result)).toBe("a {nested} value");
    expect(result.selections).toEqual([selection(0, 16)]);
  });

  it("toggles several non-overlapping selections", () => {
    const source = "one two";
    const result = toggleLatexInline(source, [selection(0, 3), selection(4, 7)], "bold");

    expect(textAfter(source, result)).toBe("\\textbf{one} \\textbf{two}");
    expect(result.selections).toEqual([selection(8, 11), selection(21, 24)]);
  });

  it("leaves a selection that only partially overlaps a command alone", () => {
    const source = "\\textbf{hello} world";
    const result = toggleLatexInline(source, [selection(8, 19)], "bold");

    expect(textAfter(source, result)).toBe(source);
    expect(result.edits).toEqual([]);
    expect(result.selections).toEqual([selection(8, 19)]);
  });

  it("combines unwrapping and wrapping across several selections", () => {
    const source = "\\textbf{one} two";
    const result = toggleLatexInline(source, [selection(8, 11), selection(13, 16)], "bold");

    expect(textAfter(source, result)).toBe("one \\textbf{two}");
    expect(result.selections).toEqual([selection(0, 3), selection(12, 15)]);
  });

  it("does not treat a command in a comment as an enclosing group", () => {
    const source = "% \\textbf{old}\nword";
    const start = source.indexOf("word");
    const result = toggleLatexInline(source, [selection(start, start + 4)], "bold");

    expect(textAfter(source, result)).toBe("% \\textbf{old}\n\\textbf{word}");
    expect(result.selections).toEqual([selection(start + 8, start + 12)]);
  });

  it("handles escaped percent signs before a command", () => {
    const source = "100\\% \\textbf{word}";
    const start = source.indexOf("word");
    const result = toggleLatexInline(source, [selection(start, start + 4)], "bold");

    expect(textAfter(source, result)).toBe("100\\% word");
    expect(result.selections).toEqual([selection(6, 10)]);
  });

  it("ignores a selection that begins in a comment", () => {
    const source = "% hello";
    expect(toggleLatexInline(source, [selection(2, 7)], "bold")).toEqual({
      edits: [],
      selections: [selection(2, 7)],
    });
  });

  it("leaves empty selections alone", () => {
    const source = "hello";
    expect(toggleLatexInline(source, [selection(2)], "bold")).toEqual({
      edits: [],
      selections: [selection(2)],
    });
  });
});
