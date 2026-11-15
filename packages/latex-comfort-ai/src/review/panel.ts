import { readFile } from "node:fs/promises";
import * as vscode from "vscode";
import type {
  EditMode,
  HostToWebviewMessage,
  ReviewReadyState,
  WebviewToHostMessage,
} from "@latex-comfort/shared";
import type { ReviewSurface } from "../session/controller";
import { parseWebviewMessage } from "./protocol";

type Handlers = {
  onMessage(message: WebviewToHostMessage): void;
  onDispose(): void;
};

/** One reusable review panel beside the editor. */
export class ReviewPanel implements ReviewSurface {
  private panel: vscode.WebviewPanel | undefined;
  private opening: Promise<void> | undefined;
  private ready = false;
  private pending: HostToWebviewMessage | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly handlers: Handlers,
  ) {}

  showLoading(mode: EditMode, instruction?: string): void {
    void this.post({
      type: "loading",
      mode,
      ...(instruction ? { instruction } : {}),
    }).catch((error: unknown) => this.reportOpenError(error));
  }

  showReady(state: ReviewReadyState): void {
    void this.post({ type: "ready", state }).catch((error: unknown) => this.reportOpenError(error));
  }

  showError(message: string, canConfigure = false): void {
    void this.post({ type: "error", message, canConfigure }).catch((error: unknown) => this.reportOpenError(error));
  }

  close(): void {
    const panel = this.panel;
    this.panel = undefined;
    this.opening = undefined;
    this.ready = false;
    this.pending = undefined;
    panel?.dispose();
  }

  private post(message: HostToWebviewMessage): Promise<void> {
    this.pending = message;
    return this.ensurePanel().then(() => {
      if (!this.panel || !this.ready || this.pending !== message) return;
      this.pending = undefined;
      void this.panel.webview.postMessage(message);
    });
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

    panel.webview.onDidReceiveMessage((raw: unknown) => {
      const message = parseWebviewMessage(raw);
      if (!message) return;
      if (message.type === "webviewReady") {
        this.ready = true;
        const pending = this.pending;
        this.pending = undefined;
        if (pending) void panel.webview.postMessage(pending);
        return;
      }
      this.handlers.onMessage(message);
    });

    panel.onDidDispose(() => {
      if (this.panel === panel) this.panel = undefined;
      this.ready = false;
      this.pending = undefined;
      this.handlers.onDispose();
    });

    panel.webview.html = await this.html(panel.webview);
    panel.reveal(undefined, true);
  }

  private reportOpenError(error: unknown): void {
    void vscode.window.showErrorMessage(
      `Could not open the LaTeX Comfort AI review: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  private async html(webview: vscode.Webview): Promise<string> {
    const root = vscode.Uri.joinPath(this.extensionUri, "dist", "webview");
    const raw = await readFile(vscode.Uri.joinPath(root, "index.html").fsPath, "utf8");
    const base = webview.asWebviewUri(root).toString();
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src ${webview.cspSource}`,
      `img-src ${webview.cspSource} data:`,
      `font-src ${webview.cspSource}`,
    ].join("; ");
    return raw.replace(
      /<head>/i,
      `<head><base href="${base}/"><meta http-equiv="Content-Security-Policy" content="${csp}">`,
    );
  }
}
