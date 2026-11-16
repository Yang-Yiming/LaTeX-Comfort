import type * as vscode from "vscode";

declare module "vscode" {
  export interface WebviewEditorInset {
    readonly editor: vscode.TextEditor;
    readonly line: number;
    readonly height: number;
    readonly webview: vscode.Webview;
    readonly onDidDispose: vscode.Event<void>;
    dispose(): void;
  }

  export namespace window {
    export function createWebviewTextEditorInset(
      editor: vscode.TextEditor,
      line: number,
      height: number,
      options?: vscode.WebviewOptions,
    ): WebviewEditorInset;
  }
}
