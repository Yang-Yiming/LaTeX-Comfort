/*
 * Diagnostic filtering, ordering and file grouping adapted from Lattice's
 * src/build/compile-diagnostics.ts (Apache-2.0).
 * Copyright 2026 Leonardo and the Lattice contributors.
 * Licensed under the Apache License, Version 2.0.
 * Modified for LaTeX Comfort: VS Code diagnostics with errors and warnings.
 */

export type CompileProblemSeverity = "error" | "warning" | "info" | "hint";

export type CompileProblemPosition = {
  line: number;
  character: number;
};

export type CompileProblemRange = {
  start: CompileProblemPosition;
  end: CompileProblemPosition;
};

export type CompileProblemInput = {
  uri: string;
  fileLabel: string;
  range: CompileProblemRange;
  severity: CompileProblemSeverity;
  message: string;
  source?: string;
};

export type CompileProblem = CompileProblemInput & {
  id: string;
};

export type CompileProblemGroup = {
  fileLabel: string;
  problems: CompileProblem[];
};

const LATEX_SOURCE_FILE = /\.(?:tex|bib|sty|cls|ltx|bbl)$/i;

function uriPath(uri: string): string {
  try {
    return decodeURIComponent(new URL(uri).pathname);
  } catch {
    return uri.split(/[?#]/, 1)[0] ?? uri;
  }
}

export function isLatexSourceUri(uri: string): boolean {
  return LATEX_SOURCE_FILE.test(uriPath(uri));
}

function problemId(problem: CompileProblemInput): string {
  const { start, end } = problem.range;
  return [
    problem.uri,
    start.line,
    start.character,
    end.line,
    end.character,
    problem.message,
  ].join("\u0000");
}

export function collectCompileProblems(
  inputs: readonly CompileProblemInput[],
): CompileProblem[] {
  const unique = new Map<string, CompileProblem>();

  for (const input of inputs) {
    if ((input.severity !== "error" && input.severity !== "warning") || !isLatexSourceUri(input.uri)) continue;
    const problem: CompileProblem = {
      ...input,
      message: input.message.trim(),
      id: problemId({ ...input, message: input.message.trim() }),
    };
    if (!unique.has(problem.id)) unique.set(problem.id, problem);
  }

  return [...unique.values()].sort((left, right) => {
    const file = left.fileLabel.localeCompare(right.fileLabel);
    if (file !== 0) return file;
    const line = left.range.start.line - right.range.start.line;
    if (line !== 0) return line;
    const character = left.range.start.character - right.range.start.character;
    if (character !== 0) return character;
    const severity = Number(left.severity !== "error") - Number(right.severity !== "error");
    if (severity !== 0) return severity;
    return left.message.localeCompare(right.message);
  });
}

export function groupCompileProblems(
  problems: readonly CompileProblem[],
): CompileProblemGroup[] {
  const groups = new Map<string, CompileProblem[]>();
  for (const problem of problems) {
    const group = groups.get(problem.fileLabel);
    if (group) group.push(problem);
    else groups.set(problem.fileLabel, [problem]);
  }
  return [...groups].map(([fileLabel, items]) => ({ fileLabel, problems: items }));
}

export function summarizeCompileProblems(problems: readonly CompileProblem[]): {
  errors: number;
  warnings: number;
  files: number;
} {
  return {
    errors: problems.filter((problem) => problem.severity === "error").length,
    warnings: problems.filter((problem) => problem.severity === "warning").length,
    files: new Set(problems.map((problem) => problem.fileLabel)).size,
  };
}
