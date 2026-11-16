import * as vscode from "vscode";
import { activateLatexComfort } from "../activation";
import {
  EditorInsetSurface,
  editorInsetsAvailable,
} from "./editor-inset-surface";

export function activate(context: vscode.ExtensionContext): void {
  activateLatexComfort(context, {
    editorInset: {
      available: editorInsetsAvailable,
      create: (dispatch) =>
        new EditorInsetSurface(context.extensionUri, dispatch),
    },
  });
}
