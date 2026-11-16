import { describe, expect, it } from "vitest";
import { collectCompileProblems, type CompileProblemInput } from "./model";
import { compileProblemRows } from "./picker";

const input = (overrides: Partial<CompileProblemInput> = {}): CompileProblemInput => ({
  uri: "file:///workspace/paper/main.tex",
  fileLabel: "paper/main.tex",
  range: {
    start: { line: 4, character: 2 },
    end: { line: 4, character: 8 },
  },
  severity: "error",
  message: "Undefined control sequence",
  source: "LaTeX",
  ...overrides,
});

describe("compile problem picker rows", () => {
  it("lists a file separator before its problems and keeps the exact diagnostic", () => {
    const [problem] = collectCompileProblems([input()]);
    const rows = compileProblemRows([problem!]);

    expect(rows).toEqual([
      { kind: "separator", label: "paper/main.tex" },
      {
        kind: "problem",
        label: "Undefined control sequence",
        description: "line 5, column 3",
        problem,
      },
    ]);
  });

  it("does not repeat a file separator for errors in the same file", () => {
    const problems = collectCompileProblems([
      input(),
      input({ range: { start: { line: 8, character: 0 }, end: { line: 8, character: 1 } }, message: "Missing $ inserted" }),
    ]);

    expect(compileProblemRows(problems).map((row) => row.kind)).toEqual([
      "separator",
      "problem",
      "problem",
    ]);
  });
});
