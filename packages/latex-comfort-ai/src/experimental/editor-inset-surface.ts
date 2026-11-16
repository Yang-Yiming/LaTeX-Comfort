import * as vscode from "vscode";
import type { ReviewAction, ReviewViewState } from "../review/state";
import type { ReviewSurface } from "../review/surface";
import { parseWebviewMessage } from "../review/protocol";
import { reviewStateToMessage } from "../review/webview-message";
import { webviewHtml } from "../review/webview-html";
import {
  chooseInsetLine,
  contentHeightToLines,
  estimateInsetHeight,
} from "./editor-inset-layout";

type InsetWindow = typeof vscode.window & {
  createWebviewTextEditorInset?: (
    editor: vscode.TextEditor,
    line: number,
    height: number,
    options?: vscode.WebviewOptions,
  ) => vscode.WebviewEditorInset;
};

export function editorInsetsAvailable(): boolean {
  return (
    typeof (vscode.window as InsetWindow).createWebviewTextEditorInset ===
    "function"
  );
}

/** Experimental review card rendered inside a Proposed editor inset. */
export class EditorInsetSurface implements ReviewSurface {
  private inset: vscode.WebviewEditorInset | undefined;
  private insetLine: number | undefined;
  private insetHeight: number | undefined;
  private ready = false;
  private readonly suppressedDisposals = new Set<vscode.WebviewEditorInset>();
  private state: ReviewViewState = { status: "idle" };
  private measuredHeight: number | undefined;
  private readonly editorListener: vscode.Disposable;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly dispatch: (action: ReviewAction) => void,
  ) {
    this.editorListener = vscode.window.onDidChangeVisibleTextEditors(() => {
      this.sync();
      if (
        this.state.status !== "idle" &&
        this.state.status !== "error" &&
        !this.editor()
      ) {
        this.dispatch({ type: "openSidebar" });
      }
    });
  }

  render(state: ReviewViewState): void {
    if (state.status !== this.state.status) this.measuredHeight = undefined;
    this.state = state;
    this.sync();
  }

  dispose(): void {
    this.editorListener.dispose();
    this.disposeInset();
    this.state = { status: "idle" };
  }

  private sync(): void {
    const state = this.state;
    if (state.status === "idle") {
      this.disposeInset();
      return;
    }
    if (!("context" in state) || !state.context) {
      this.disposeInset();
      return;
    }

    const editor = this.editor();
    if (!editor) {
      this.disposeInset();
      return;
    }

    const line = chooseInsetLine(state.context);
    const fallbackHeight =
      state.status === "ready"
        ? estimateInsetHeight(state.review)
        : state.status === "error"
          ? 14
          : 16;
    const height = this.measuredHeight
      ? contentHeightToLines(this.measuredHeight, this.lineHeight(editor))
      : fallbackHeight;

    if (this.inset && this.insetLine === line && this.insetHeight === height) {
      this.postState();
      return;
    }

    this.disposeInset();
    try {
      const create = (vscode.window as InsetWindow)
        .createWebviewTextEditorInset;
      if (!create) {
        this.dispatch({ type: "openSidebar" });
        return;
      }
      const inset = create(editor, line, height, {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, "dist", "webview"),
        ],
      });
      this.inset = inset;
      this.insetLine = line;
      this.insetHeight = height;
      this.ready = false;

      inset.webview.onDidReceiveMessage((raw: unknown) => {
        const message = parseWebviewMessage(raw);
        if (!message) return;
        if (message.type === "webviewReady") {
          this.ready = true;
          this.postState();
          return;
        }
        if (message.type === "contentHeight") {
          const measured = message.height;
          const nextHeight = contentHeightToLines(
            measured,
            this.lineHeight(this.editor()),
          );
          this.measuredHeight = measured;
          if (this.insetHeight !== nextHeight) {
            this.disposeInset();
            this.sync();
          }
          return;
        }
        this.dispatch(message);
      });
      inset.onDidDispose(() => {
        const wasCurrent = this.inset === inset;
        if (wasCurrent) {
          this.inset = undefined;
          this.insetLine = undefined;
          this.insetHeight = undefined;
          this.ready = false;
        }
        const suppressed = this.suppressedDisposals.delete(inset);
        if (!suppressed && wasCurrent) {
          this.dispatch({ type: "reject" });
        }
      });

      void webviewHtml(inset.webview, this.extensionUri, "inset")
        .then((html) => {
          if (this.inset === inset) inset.webview.html = html;
        })
        .catch((error: unknown) => {
          this.dispatch({
            type: "openSidebar",
          });
          void vscode.window.showErrorMessage(
            `Could not render the inline review: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
    } catch (error) {
      this.dispatch({ type: "openSidebar" });
      void vscode.window.showWarningMessage(
        `Inline review is unavailable in this VS Code build: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private postState(): void {
    if (!this.inset || !this.ready) return;
    const message = reviewStateToMessage(this.state, true);
    if (message) void this.inset.webview.postMessage(message);
  }

  private editor(): vscode.TextEditor | undefined {
    if (!("context" in this.state) || !this.state.context) return undefined;
    const uri = this.state.context.uri;
    return vscode.window.visibleTextEditors.find(
      (editor) => editor.document.uri.toString() === uri,
    );
  }

  private lineHeight(editor: vscode.TextEditor | undefined): number {
    const config = vscode.workspace.getConfiguration(
      "editor",
      editor?.document.uri,
    );
    const configured = config.get<number>("lineHeight", 0);
    if (configured > 0) return configured;
    const fontSize = config.get<number>("fontSize", 14);
    return Math.max(16, Math.round(fontSize * 1.5));
  }

  private disposeInset(): void {
    const inset = this.inset;
    this.inset = undefined;
    this.insetLine = undefined;
    this.insetHeight = undefined;
    this.ready = false;
    if (inset) {
      this.suppressedDisposals.add(inset);
      inset.dispose();
    }
  }
}
