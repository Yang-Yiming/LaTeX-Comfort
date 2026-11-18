import { describe, expect, it } from "vitest";
import {
  toggleDisplayMath,
  toggleEnvironment,
  toggleIffalse,
  toggleInlineMath,
  type OffsetRange,
  type ToggleResult,
} from "./toggles";

function selection(start: number, end = start): OffsetRange {
  return { start, end };
}

function textAfter(source: string, result: ToggleResult): string {
  let text = source;
  for (const edit of [...result.edits].sort((a, b) => b.start - a.start || b.end - a.end)) {
    text = text.slice(0, edit.start) + edit.insert + text.slice(edit.end);
  }
  return text;
}

function contentSelection(source: string, content: string): OffsetRange {
  const start = source.indexOf(content);
  return selection(start, start + content.length);
}

describe("toggleInlineMath", () => {
  it("wraps trimmed content in single dollar delimiters", () => {
    const source = "  x + y  ";
    const result = toggleInlineMath(source, selection(0, source.length));

    expect(result).toEqual({
      edits: [
        { start: 2, end: 2, insert: "$" },
        { start: 7, end: 7, insert: "$" },
      ],
      selections: [selection(3, 8)],
    });
    expect(textAfter(source, result)).toBe("  $x + y$  ");
  });

  it("unwraps when the selected content is inside existing delimiters", () => {
    const source = "a $x + y$ b";
    const result = toggleInlineMath(source, selection(3, 8));

    expect(result).toEqual({
      edits: [
        { start: 2, end: 3, insert: "" },
        { start: 8, end: 9, insert: "" },
      ],
      selections: [selection(2, 7)],
    });
    expect(textAfter(source, result)).toBe("a x + y b");
  });

  it("inserts a pair around the caret for an empty selection", () => {
    const source = "abc";
    const result = toggleInlineMath(source, selection(1));

    expect(result).toEqual({
      edits: [{ start: 1, end: 1, insert: "$$" }],
      selections: [selection(2)],
    });
    expect(textAfter(source, result)).toBe("a$$bc");
  });

  it("ignores a selection that starts at a comment", () => {
    const source = "% $old$";
    const range = selection(0, source.length);

    expect(toggleInlineMath(source, range)).toEqual({ edits: [], selections: [range] });
  });

  it("treats an escaped percent sign as normal text", () => {
    const source = "100\\% $x$";
    const result = toggleInlineMath(source, selection(7, 8));

    expect(textAfter(source, result)).toBe("100\\% x");
  });

  it("leaves a partially overlapping wrapper unchanged", () => {
    const source = "$hello$";
    const range = selection(1, 7);

    expect(toggleInlineMath(source, range)).toEqual({ edits: [], selections: [range] });
  });
});

describe("toggleDisplayMath", () => {
  it("wraps trimmed content in display math delimiters", () => {
    const source = "  x + y  ";
    const result = toggleDisplayMath(source, selection(0, source.length));

    expect(result).toEqual({
      edits: [
        { start: 2, end: 2, insert: "\\[" },
        { start: 7, end: 7, insert: "\\]" },
      ],
      selections: [selection(4, 9)],
    });
    expect(textAfter(source, result)).toBe("  \\[x + y\\]  ");
  });

  it("unwraps when the selected content is inside existing delimiters", () => {
    const source = "a \\[x + y\\] b";
    const result = toggleDisplayMath(source, selection(4, 9));

    expect(textAfter(source, result)).toBe("a x + y b");
    expect(result.selections).toEqual([selection(2, 7)]);
  });

  it("inserts delimiters around the caret for an empty selection", () => {
    const source = "abc";
    const result = toggleDisplayMath(source, selection(1));

    expect(result).toEqual({
      edits: [{ start: 1, end: 1, insert: "\\[\\]" }],
      selections: [selection(3)],
    });
    expect(textAfter(source, result)).toBe("a\\[\\]bc");
  });
});

describe("toggleEnvironment", () => {
  it("wraps a multi-line selection and preserves outside whitespace", () => {
    const source = "  first\nsecond  ";
    const result = toggleEnvironment(source, selection(0, source.length), "itemize");
    const expected = "  \\begin{itemize}\nfirst\nsecond\n\\end{itemize}  ";

    expect(textAfter(source, result)).toBe(expected);
    expect(result.selections).toEqual([
      contentSelection(expected, "first\nsecond"),
    ]);
  });

  it("unwraps when the selected content is inside a matching environment", () => {
    const source = "before\n\\begin{itemize}\n\\item one\n\\item two\n\\end{itemize}\nafter";
    const start = source.indexOf("\\item one");
    const end = source.indexOf("\n\\end{itemize}");
    const result = toggleEnvironment(source, selection(start, end), "itemize");
    const expected = "before\n\\item one\n\\item two\nafter";

    expect(textAfter(source, result)).toBe(expected);
    expect(result.selections).toEqual([
      contentSelection(expected, "\\item one\n\\item two"),
    ]);
  });

  it("inserts a multi-line skeleton with the caret on the empty body line", () => {
    const result = toggleEnvironment("", selection(0), "note");

    expect(result).toEqual({
      edits: [{ start: 0, end: 0, insert: "\\begin{note}\n\n\\end{note}" }],
      selections: [selection(13)],
    });
  });

  it("does nothing when the environment name is empty", () => {
    const range = selection(0, 4);
    expect(toggleEnvironment("text", range, "")).toEqual({ edits: [], selections: [range] });
  });

  it("wraps inside a different environment without unwrapping it", () => {
    const source = "\\begin{center}\ntext\n\\end{center}";
    const start = source.indexOf("text");
    const range = selection(start, start + 4);
    const result = toggleEnvironment(source, range, "itemize");
    const expected = "\\begin{center}\n\\begin{itemize}\ntext\n\\end{itemize}\n\\end{center}";

    expect(textAfter(source, result)).toBe(expected);
    expect(result.selections).toEqual([contentSelection(expected, "text")]);
  });
});

describe("toggleIffalse", () => {
  it("wraps a multi-line selection", () => {
    const source = " draft\nrevision ";
    const result = toggleIffalse(source, selection(0, source.length));
    const expected = " \\iffalse\ndraft\nrevision\n\\fi ";

    expect(textAfter(source, result)).toBe(expected);
    expect(result.selections).toEqual([
      contentSelection(expected, "draft\nrevision"),
    ]);
  });

  it("unwraps when the selected content is inside an existing block", () => {
    const source = "before\n\\iffalse\ndraft\n\\fi\nafter";
    const start = source.indexOf("draft");
    const result = toggleIffalse(source, selection(start, start + 5));

    expect(textAfter(source, result)).toBe("before\ndraft\nafter");
    expect(result.selections).toEqual([contentSelection("before\ndraft\nafter", "draft")]);
  });

  it("inserts a skeleton with the caret on the empty body line", () => {
    const result = toggleIffalse("", selection(0));

    expect(result).toEqual({
      edits: [{ start: 0, end: 0, insert: "\\iffalse\n\n\\fi" }],
      selections: [selection(9)],
    });
  });
});

describe("wrapper toggle safeguards", () => {
  it.each([
    ["display math", (source: string, range: OffsetRange) => toggleDisplayMath(source, range)],
    ["environment", (source: string, range: OffsetRange) => toggleEnvironment(source, range, "note")],
    ["iffalse", (source: string, range: OffsetRange) => toggleIffalse(source, range)],
  ])("ignores a selection that starts in a comment for %s", (_name, toggle) => {
    const source = "% existing\n";
    const range = selection(0, source.length);

    expect(toggle(source, range)).toEqual({ edits: [], selections: [range] });
  });
});
