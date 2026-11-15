import type * as vscode from "vscode";
import { createCoreApi, type LatexComfortApi } from "./api";

export function activate(_context: vscode.ExtensionContext): LatexComfortApi {
  return createCoreApi();
}

export function deactivate(): void {}
