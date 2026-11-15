import type * as vscode from "vscode";
import type { SelectionContext } from "@latex-comfort/shared";

export interface LatexComfortApi {
  apiVersion: 1;
  getSelectionContext(editor: vscode.TextEditor): SelectionContext;
}

/**
 * Converts VS Code editor objects into serializable context for the AI
 * companion. Keeping this conversion in the core extension gives both
 * extensions one shared definition of a selection.
 */
export function toSelectionContext(editor: vscode.TextEditor): SelectionContext {
  const { document, selection } = editor;
  return {
    uri: document.uri.toString(),
    range: {
      start: {
        line: selection.start.line,
        character: selection.start.character,
      },
      end: {
        line: selection.end.line,
        character: selection.end.character,
      },
    },
    text: document.getText(selection),
    languageId: document.languageId,
    documentVersion: document.version,
  };
}

export function createCoreApi(): LatexComfortApi {
  return {
    apiVersion: 1,
    getSelectionContext: toSelectionContext,
  };
}
