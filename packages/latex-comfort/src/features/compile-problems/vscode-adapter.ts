import type {
  CompileProblemInput,
  CompileProblemRange,
  CompileProblemSeverity,
} from "./model";

type DiagnosticLike = {
  range: CompileProblemRange;
  severity: number;
  message: string;
  source?: string;
};

const SEVERITIES: Record<number, CompileProblemSeverity> = {
  0: "error",
  1: "warning",
  2: "info",
  3: "hint",
};

export function diagnosticToProblemInput(
  uri: string,
  fileLabel: string,
  diagnostic: DiagnosticLike,
): CompileProblemInput {
  return {
    uri,
    fileLabel,
    range: diagnostic.range,
    severity: SEVERITIES[diagnostic.severity] ?? "info",
    message: diagnostic.message,
    ...(diagnostic.source ? { source: diagnostic.source } : {}),
  };
}
