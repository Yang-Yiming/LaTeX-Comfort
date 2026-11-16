/*
 * Diagnostic count wording adapted from Lattice's
 * src/build/build-result-text.ts (Apache-2.0).
 * Copyright 2026 Leonardo and the Lattice contributors.
 * Licensed under the Apache License, Version 2.0.
 * Modified for LaTeX Comfort: VS Code status bar text.
 */

import { summarizeCompileProblems, type CompileProblem } from "./model";

export function compileProblemStatus(problems: readonly CompileProblem[]): {
  text: string;
  tooltip: string;
} | null {
  const { errors, files } = summarizeCompileProblems(problems);
  if (errors === 0) return null;
  const errorWord = errors === 1 ? "error" : "errors";
  const fileWord = files === 1 ? "file" : "files";
  return {
    text: `$(error) ${errors} LaTeX ${errorWord}`,
    tooltip: `${errors} ${errorWord} in ${files} ${fileWord}. Click to show compile problems.`,
  };
}
