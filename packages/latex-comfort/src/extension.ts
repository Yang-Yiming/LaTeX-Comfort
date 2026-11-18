import type * as vscode from "vscode";
import { createCoreApi, type LatexComfortApi } from "./api";
import { CompileProblemsController } from "./features/compile-problems/controller";
import { registerInlineFormattingCommands } from "./features/formatting/controller";
import { PapersController } from "./features/papers/controller";
import { WordCountStatusController } from "./features/status/controller";
import { registerSymbolCommands } from "./features/symbols/controller";

export function activate(context: vscode.ExtensionContext): LatexComfortApi {
  const compileProblems = new CompileProblemsController();
  const papers = new PapersController();
  const wordCount = new WordCountStatusController();
  context.subscriptions.push(
    ...compileProblems.start(),
    ...papers.start(),
    ...wordCount.start(),
    ...registerInlineFormattingCommands(),
    ...registerSymbolCommands(),
  );
  return createCoreApi();
}

export function deactivate(): void {}
