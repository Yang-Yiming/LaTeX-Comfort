import type * as vscode from "vscode";
import { createCoreApi, type LatexComfortApi } from "./api";
import { CompileProblemsController } from "./features/compile-problems/controller";
import { PapersController } from "./features/papers/controller";

export function activate(context: vscode.ExtensionContext): LatexComfortApi {
  const compileProblems = new CompileProblemsController();
  const papers = new PapersController();
  context.subscriptions.push(...compileProblems.start(), ...papers.start());
  return createCoreApi();
}

export function deactivate(): void {}
