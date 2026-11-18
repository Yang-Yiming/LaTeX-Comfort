import * as vscode from "vscode";
import type {
  AgentUiSnapshot,
  AgentWebviewToHostMessage,
} from "@latex-comfort/shared";
import { webviewHtml } from "../review/webview-html";

export class AgentPanelSurface implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private ready = false;
  private latest: AgentUiSnapshot | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly dispatch: (
      message: AgentWebviewToHostMessage,
    ) => Promise<void> | void,
  ) {}

  show(): void {
    if (this.panel) {
      this.panel.reveal(undefined, true);
      this.postLatest();
      return;
    }
    void this.createPanel().catch((error: unknown) => {
      void vscode.window.showErrorMessage(
        `Could not open the LaTeX Comfort Agent: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }

  render(snapshot: AgentUiSnapshot): void {
    this.latest = snapshot;
    this.postLatest();
  }

  dispose(): void {
    const panel = this.panel;
    this.panel = undefined;
    this.ready = false;
    panel?.dispose();
  }

  private postLatest(): void {
    if (!this.panel || !this.ready || !this.latest) return;
    void this.panel.webview.postMessage({
      type: "agentSnapshot",
      snapshot: this.latest,
    });
  }

  private async createPanel(): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
      "latexComfort.agent",
      "LaTeX Comfort Agent",
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
      void import("./panel-messages").then(async ({ parseAgentWebviewMessage }) => {
        const message = parseAgentWebviewMessage(raw);
        if (!message) return;
        if (message.type === "agentWebviewReady") {
          this.ready = true;
          this.postLatest();
          return;
        }
        await this.dispatch(message);
      });
    });

    panel.onDidDispose(() => {
      if (this.panel === panel) {
        this.panel = undefined;
        this.ready = false;
      }
    });

    panel.webview.html = await webviewHtml(
      panel.webview,
      this.extensionUri,
      "agent",
    );
    panel.reveal(undefined, true);
  }
}
