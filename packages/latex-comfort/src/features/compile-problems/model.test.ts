import { describe, expect, it } from "vitest";
import {
  collectCompileProblems,
  groupCompileProblems,
  summarizeCompileProblems,
  type CompileProblemInput,
} from "./model";

const problem = (overrides: Partial<CompileProblemInput> = {}): CompileProblemInput => ({
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

describe("compile problem model", () => {
  it("keeps only LaTeX errors from project source files", () => {
    const problems = collectCompileProblems([
      problem(),
      problem({ severity: "warning", message: "Overfull hbox" }),
      problem({ severity: "info", message: "Informational" }),
      problem({ uri: "file:///workspace/paper/notes.md", fileLabel: "paper/notes.md" }),
      problem({ uri: "file:///workspace/paper/refs.bib", fileLabel: "paper/refs.bib" }),
    ]);

    expect(problems.map((item) => item.fileLabel)).toEqual([
      "paper/main.tex",
      "paper/refs.bib",
    ]);
  });

  it("deduplicates the same diagnostic while preserving distinct errors", () => {
    const problems = collectCompileProblems([
      problem({ message: "  Undefined control sequence  " }),
      problem({ message: "Undefined control sequence" }),
      problem({ range: { start: { line: 5, character: 0 }, end: { line: 5, character: 3 } } }),
    ]);

    expect(problems).toHaveLength(2);
    expect(problems.map((item) => item.message)).toEqual([
      "Undefined control sequence",
      "Undefined control sequence",
    ]);
  });

  it("sorts by file, line and column and groups errors under their file", () => {
    const problems = collectCompileProblems([
      problem({ uri: "file:///workspace/paper/z.tex", fileLabel: "paper/z.tex", range: { start: { line: 2, character: 0 }, end: { line: 2, character: 1 } } }),
      problem({ uri: "file:///workspace/paper/a.tex", fileLabel: "paper/a.tex", range: { start: { line: 9, character: 0 }, end: { line: 9, character: 1 } } }),
      problem({ uri: "file:///workspace/paper/a.tex", fileLabel: "paper/a.tex", range: { start: { line: 3, character: 4 }, end: { line: 3, character: 5 } } }),
    ]);

    expect(problems.map((item) => `${item.fileLabel}:${item.range.start.line}:${item.range.start.character}`)).toEqual([
      "paper/a.tex:3:4",
      "paper/a.tex:9:0",
      "paper/z.tex:2:0",
    ]);
    expect(groupCompileProblems(problems).map((group) => [group.fileLabel, group.problems.length])).toEqual([
      ["paper/a.tex", 2],
      ["paper/z.tex", 1],
    ]);
  });

  it("counts errors and affected files for the status bar", () => {
    const problems = collectCompileProblems([
      problem(),
      problem({ range: { start: { line: 7, character: 0 }, end: { line: 7, character: 1 } } }),
      problem({ uri: "file:///workspace/paper/chapters/intro.tex", fileLabel: "paper/chapters/intro.tex" }),
    ]);

    expect(summarizeCompileProblems(problems)).toEqual({ errors: 3, files: 2 });
  });
});
