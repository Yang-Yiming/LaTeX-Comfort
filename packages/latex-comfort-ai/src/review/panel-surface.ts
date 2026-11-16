import * as vscode from "vscode";
import type {
  ReviewAction,
  ReviewViewState,
} from "./state";
import type { ReviewSurface } from "./surface";
import { parseWebviewMessage } from "./protocol";
import { reviewStateToMessage } from "./webview-message";
import { webviewHtml } from "./webview-html";

/** Full review surface shown beside the editor. */
export class PanelSurface implements ReviewSurface {
  private panel: vscode.WebviewPanel | undefined;
  private opening: Promise<void> | undefined;
  private ready = false;
  private state: ReviewViewState = { status: "idle" };
  private suppressDispose = false;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly dispatch: (action: ReviewAction) => void,
  ) {}

  render(state: ReviewViewState): void {
    this.state = state;
    if (state.status === "idle") {
      this.dispose();
      return;
    }
    void this.sync().catch((error: unknown) => this.reportOpenError(error));
  }

  dispose(): void {
    const panel = this.panel;
    this.panel = undefined;
    this.opening = undefined;
    this.ready = false;
    this.state = { status: "idle" };
    if (panel) {
      this.suppressDispose = true;
      panel.dispose();
    }
  }

  private async sync(): Promise<void> {
    await this.ensurePanel();
    if (!this.panel || !this.ready || this.state.status === "idle") return;
    const message = reviewStateToMessage(this.state, false);
    if (message) await this.panel.webview.postMessage(message);
  }

  private ensurePanel(): Promise<void> {
    if (this.panel) return Promise.resolve();
    this.opening ??= this.createPanel().finally(() => {
      this.opening = undefined;
    });
    return this.opening;
  }

  private async createPanel(): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
      "latexComfort.aiReview",
      "LaTeX Comfort AI",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, "dist", "webview"),
        ],
      },
    );
    this.panel = panel;
    this.ready = false;
    this.suppressDispose = false;

    panel.webview.onDidReceiveMessage((raw: unknown) => {
      const message = parseWebviewMessage(raw);
      if (!message) return;
      if (message.type === "webviewReady") {
        this.ready = true;
        void this.sync().catch((error: unknown) => this.reportOpenError(error));
        return;
      }
      if (message.type === "contentHeight") return;
      this.dispatch(message);
    });

    panel.onDidDispose(() => {
      if (this.panel === panel) {
        this.panel = undefined;
        this.ready = false;
      }
      if (!this.suppressDispose) {
        this.dispatch({ type: "reject" });
      }
      this.suppressDispose = false;
    });

    panel.webview.html = await webviewHtml(panel.webview, this.extensionUri);
    panel.reveal(undefined, true);
  }

  private reportOpenError(error: unknown): void {
    void vscode.window.showErrorMessage(
      `Could not open the LaTeX Comfort AI review: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
