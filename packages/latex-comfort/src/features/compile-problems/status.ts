/*
 * Diagnostic count wording adapted from Lattice's
 * src/build/build-result-text.ts (Apache-2.0).
 * Copyright 2026 Leonardo and the Lattice contributors.
 * Licensed under the Apache License, Version 2.0.
 * Modified for LaTeX Comfort: VS Code status bar text.
 */

import { summarizeCompileProblems, type CompileProblem } from "./model";

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function compileProblemStatus(problems: readonly CompileProblem[]): {
  text: string;
  tooltip: string;
} | null {
  const { errors, warnings, files } = summarizeCompileProblems(problems);
  if (errors === 0 && warnings === 0) return null;
  const counts = [
    errors ? countLabel(errors, "error", "errors") : "",
    warnings ? countLabel(warnings, "warning", "warnings") : "",
  ].filter(Boolean);
  const text = [
    errors ? `$(error) ${errors}` : "",
    warnings ? `$(warning) ${warnings}` : "",
  ].filter(Boolean).join(" ");
  const fileLabel = countLabel(files, "file", "files");
  return {
    text,
    tooltip: `${counts.join(" and ")} in ${fileLabel}. Click to show compile problems.`,
  };
}
