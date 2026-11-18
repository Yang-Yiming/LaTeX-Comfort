import { describe, expect, it } from "vitest";
import { collectCompileProblems, type CompileProblemInput } from "./model";
import { compileProblemStatus } from "./status";

const problem = (overrides: Partial<CompileProblemInput> = {}): CompileProblemInput => ({
  uri: "file:///workspace/paper/main.tex",
  fileLabel: "paper/main.tex",
  range: {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 1 },
  },
  severity: "error",
  message: "Undefined control sequence",
  ...overrides,
});

describe("compile problem status", () => {
  it("stays hidden when there are no problems", () => {
    expect(compileProblemStatus([])).toBeNull();
  });

  it("uses singular wording for one error in one file", () => {
    expect(compileProblemStatus(collectCompileProblems([problem()]))).toEqual({
      text: "$(error) 1",
      tooltip: "1 error in 1 file. Click to show compile problems.",
    });
  });

  it("shows errors and warnings together", () => {
    const problems = collectCompileProblems([
      problem(),
      problem({ severity: "warning", message: "Overfull hbox" }),
      problem({ uri: "file:///workspace/paper/intro.tex", fileLabel: "paper/intro.tex" }),
    ]);

    expect(compileProblemStatus(problems)).toEqual({
      text: "$(error) 2 $(warning) 1",
      tooltip: "2 errors and 1 warning in 2 files. Click to show compile problems.",
    });
  });

  it("shows warnings even when there are no errors", () => {
    const problems = collectCompileProblems([
      problem({ severity: "warning", message: "Overfull hbox" }),
    ]);

    expect(compileProblemStatus(problems)).toEqual({
      text: "$(warning) 1",
      tooltip: "1 warning in 1 file. Click to show compile problems.",
    });
  });
});
