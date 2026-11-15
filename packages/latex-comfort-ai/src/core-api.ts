import * as vscode from "vscode";
import type { SelectionContext } from "@latex-comfort/shared";

export interface LatexComfortApi {
  apiVersion: 1;
  getSelectionContext(editor: vscode.TextEditor): SelectionContext;
}

const CORE_EXTENSION_ID = "latex-comfort-dev.latex-comfort";

export async function getCoreApi(): Promise<LatexComfortApi> {
  const extension = vscode.extensions.getExtension<LatexComfortApi>(
    CORE_EXTENSION_ID,
  );
  if (!extension) {
    throw new Error(
      "LaTeX Comfort is not installed. Install the LaTeX Comfort core extension first.",
    );
  }
  return extension.isActive ? extension.exports : extension.activate();
}
