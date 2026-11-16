import { describe, expect, it } from "vitest";
import { diagnosticToProblemInput } from "./vscode-adapter";

describe("VS Code diagnostic adapter", () => {
  it("keeps the real error range and converts the severity", () => {
    expect(diagnosticToProblemInput(
      "file:///workspace/paper/main.tex",
      "paper/main.tex",
      {
        range: {
          start: { line: 4, character: 2 },
          end: { line: 4, character: 8 },
        },
        severity: 0,
        message: "Undefined control sequence",
        source: "LaTeX",
      },
    )).toEqual({
      uri: "file:///workspace/paper/main.tex",
      fileLabel: "paper/main.tex",
      range: {
        start: { line: 4, character: 2 },
        end: { line: 4, character: 8 },
      },
      severity: "error",
      message: "Undefined control sequence",
      source: "LaTeX",
    });
  });

  it("maps warnings, information and hints without losing their severity", () => {
    const base = {
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
      message: "Message",
    };

    expect([1, 2, 3].map((severity) => diagnosticToProblemInput(
      "file:///workspace/main.tex",
      "main.tex",
      { ...base, severity },
    ).severity)).toEqual(["warning", "info", "hint"]);
  });
});
