import nodePath from "node:path";
import * as vscode from "vscode";
import type { AgentProposedDiff } from "./types";

const SCHEME = "latex-comfort-agent-proposal";

class ProposalContentProvider implements vscode.TextDocumentContentProvider {
  private readonly changed = new vscode.EventEmitter<vscode.Uri>();
  private readonly contents = new Map<string, string>();
  readonly onDidChange = this.changed.event;

  set(uri: vscode.Uri, content: string): void {
    this.contents.set(uri.toString(), content);
    this.changed.fire(uri);
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.toString()) ?? "";
  }

  dispose(): void {
    this.changed.dispose();
  }
}

/**
 * Shows a proposed edit before the agent writes it. Both sides are virtual
 * documents, so the diff is read-only and the workspace is untouched.
 */
export class AgentProposalDiff implements vscode.Disposable {
  private readonly provider = new ProposalContentProvider();
  private readonly registration: vscode.Disposable;
  private sequence = 0;

  constructor(
    private readonly viewColumn: () => vscode.ViewColumn = () =>
      vscode.ViewColumn.One,
  ) {
    this.registration = vscode.workspace.registerTextDocumentContentProvider(
      SCHEME,
      this.provider,
    );
  }

  async open(diff: AgentProposedDiff): Promise<void> {
    const id = `${++this.sequence}`;
    const name = encodeURIComponent(nodePath.basename(diff.path));
    const before = vscode.Uri.from({
      scheme: SCHEME,
      path: `/${id}/before/${name}`,
    });
    const after = vscode.Uri.from({
      scheme: SCHEME,
      path: `/${id}/after/${name}`,
    });
    this.provider.set(before, diff.oldText ?? "");
    this.provider.set(after, diff.newText);
    await vscode.commands.executeCommand(
      "vscode.diff",
      before,
      after,
      `${nodePath.basename(diff.path)} · Proposed edit`,
      {
        preview: true,
        preserveFocus: false,
        viewColumn: this.viewColumn(),
      },
    );
  }

  dispose(): void {
    this.registration.dispose();
    this.provider.dispose();
  }
}
