import * as vscode from "vscode";
import { activateLatexComfort } from "./activation";

export function activate(context: vscode.ExtensionContext): void {
  activateLatexComfort(context);
}
