/*
 * File-grouped compile-problem presentation adapted from Lattice's
 * src/build/compile-diagnostics-panel.tsx (Apache-2.0).
 * Copyright 2026 Leonardo and the Lattice contributors.
 * Licensed under the Apache License, Version 2.0.
 * Modified for LaTeX Comfort: VS Code Quick Pick rows.
 */

import { groupCompileProblems, type CompileProblem } from "./model";

export type CompileProblemPickerRow =
  | { kind: "separator"; label: string }
  | {
      kind: "problem";
      label: string;
      description: string;
      problem: CompileProblem;
    };

export function compileProblemRows(
  problems: readonly CompileProblem[],
): CompileProblemPickerRow[] {
  return groupCompileProblems(problems).flatMap((group) => [
    { kind: "separator" as const, label: group.fileLabel },
    ...group.problems.map((problem) => ({
      kind: "problem" as const,
      label: problem.message,
      description: `${problem.severity} · line ${problem.range.start.line + 1}, column ${problem.range.start.character + 1}`,
      problem,
    })),
  ]);
}
