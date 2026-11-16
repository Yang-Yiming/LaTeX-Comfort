import type * as vscode from "vscode";
import { createCoreApi, type LatexComfortApi } from "./api";
import { CompileProblemsController } from "./features/compile-problems/controller";

export function activate(context: vscode.ExtensionContext): LatexComfortApi {
  const compileProblems = new CompileProblemsController();
  context.subscriptions.push(...compileProblems.start());
  return createCoreApi();
}

export function deactivate(): void {}
