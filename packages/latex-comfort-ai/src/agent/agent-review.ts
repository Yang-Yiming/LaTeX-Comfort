import { createHash } from "node:crypto";
import * as vscode from "vscode";
import type { AgentUiTurnSummary } from "@latex-comfort/shared";
import type { AgentTurnCheckpointService } from "./history-types";
import { lineHunks, type LineHunk } from "./line-diff";

const COMMAND = {
  accept: "latexComfort.ai.agentReview.accept",
  reject: "latexComfort.ai.agentReview.reject",
  acceptAll: "latexComfort.ai.agentReview.acceptAll",
  close: "latexComfort.ai.agentReview.close",
} as const;

interface PendingHunk {
  hunk: LineHunk;
  signature: string;
}

interface ActiveReview {
  turnId: string;
  path: string;
  uri: vscode.Uri;
  beforeText: string;
  afterText: string;
  approved: Set<string>;
  pending: PendingHunk[];
}

function signature(hunk: LineHunk): string {
  return createHash("sha256")
    .update(hunk.beforeText)
    .update("\0")
    .update(hunk.afterText)
    .digest("hex");
}

class AgentTurnReviewCodeLensProvider implements vscode.CodeLensProvider {
  private readonly changed = new vscode.EventEmitter<void>();
  private uri: string | undefined;
  private pending: PendingHunk[] = [];
  readonly onDidChangeCodeLenses = this.changed.event;

  set(uri: string | undefined, pending: PendingHunk[]): void {
    this.uri = uri;
    this.pending = pending;
    this.changed.fire();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!this.uri || document.uri.toString() !== this.uri) return [];
    const lenses: vscode.CodeLens[] = [];
    if (this.pending.length > 0) {
      const top = new vscode.Range(0, 0, 0, 0);
      lenses.push(
        new vscode.CodeLens(top, {
          title: `$(check-all) Approve all in this file (${this.pending.length})`,
          command: COMMAND.acceptAll,
          tooltip: "Keep every agent change in this file.",
        }),
        new vscode.CodeLens(top, {
          title: "$(close) Close review",
          command: COMMAND.close,
          tooltip: "Close this agent review without changing the file.",
        }),
      );
    }
    for (const { hunk } of this.pending) {
      const line = Math.min(hunk.afterStart, Math.max(0, document.lineCount - 1));
      const range = new vscode.Range(line, 0, line, 0);
      lenses.push(
        new vscode.CodeLens(range, {
          title: "$(check) Approve change",
          command: COMMAND.accept,
          arguments: [hunk.id],
          tooltip: "Keep this agent change.",
        }),
        new vscode.CodeLens(range, {
          title: "$(discard) Reject change",
          command: COMMAND.reject,
          arguments: [hunk.id],
          tooltip: "Restore the original text for this change.",
        }),
      );
    }
    return lenses;
  }

  dispose(): void {
    this.changed.dispose();
  }
}

export class AgentTurnReview implements vscode.Disposable {
  private readonly codeLens = new AgentTurnReviewCodeLensProvider();
  private readonly disposables: vscode.Disposable[];
  private readonly approvedByFile = new Map<string, Set<string>>();
  private active: ActiveReview | undefined;
  private queue: Array<{ turnId: string; path: string }> = [];
  private queueTotal = 0;
  private queueIndex = 0;
  private status: vscode.Disposable | undefined;
  private applyingEdit = false;
  private readonly approveAllStatus = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  private readonly closeStatus = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    99,
  );

  constructor(
    private readonly checkpoints: AgentTurnCheckpointService,
    private readonly viewColumn: () => vscode.ViewColumn = () =>
      vscode.ViewColumn.One,
  ) {
    this.disposables = [
      this.codeLens,
      this.approveAllStatus,
      this.closeStatus,
      vscode.languages.registerCodeLensProvider("*", this.codeLens),
      vscode.commands.registerCommand(COMMAND.accept, (id: number) =>
        this.accept(id),
      ),
      vscode.commands.registerCommand(COMMAND.reject, (id: number) =>
        this.reject(id),
      ),
      vscode.commands.registerCommand(COMMAND.acceptAll, () => this.acceptAll()),
      vscode.commands.registerCommand(COMMAND.close, () => this.close()),
      vscode.workspace.onDidChangeTextDocument((event) => {
        const active = this.active;
        if (
          !active ||
          event.document.uri.toString() !== active.uri.toString() ||
          this.applyingEdit
        ) {
          return;
        }
        const currentText = event.document.getText();
        if (currentText === active.afterText) {
          this.render();
          return;
        }
        if (!this.reconcileRevert(active, currentText)) {
          this.abandonForExternalEdit(active);
          return;
        }
        this.render();
      }),
      vscode.window.onDidChangeVisibleTextEditors(() => this.render()),
    ];
  }

  async open(turnId: string, filePath: string): Promise<void> {
    this.queue = [];
    this.queueTotal = 0;
    this.queueIndex = 0;
    this.clearActive();
    await this.openFile(turnId, filePath);
  }

  openTurn(turn: AgentUiTurnSummary): void {
    this.clearActive();
    this.queue = turn.changes.map((change) => ({
      turnId: turn.id,
      path: change.path,
    }));
    this.queueTotal = this.queue.length;
    this.queueIndex = 0;
    if (this.queue.length === 0) return;
    void this.openNext();
  }

  dispose(): void {
    this.close();
    for (const disposable of this.disposables) disposable.dispose();
  }

  private async openNext(): Promise<void> {
    const next = this.queue.shift();
    if (!next) {
      this.status?.dispose();
      this.status = undefined;
      const total = this.queueTotal;
      this.queueTotal = 0;
      this.queueIndex = 0;
      if (total > 0) {
        void vscode.window.showInformationMessage(
          `Agent review complete: ${total} changed file${total === 1 ? "" : "s"}.`,
        );
      }
      return;
    }
    this.queueIndex += 1;
    this.status?.dispose();
    this.status = vscode.window.setStatusBarMessage(
      `$(diff) Reviewing ${this.queueIndex}/${this.queueTotal}: ${next.path}`,
    );
    const opened = await this.openFile(next.turnId, next.path);
    if (!opened) void this.openNext();
  }

  private async openFile(turnId: string, filePath: string): Promise<boolean> {
    const versions = await this.checkpoints.versions(turnId, filePath);
    if (!versions) {
      void vscode.window.showWarningMessage(
        "The checkpoint for this file is no longer available.",
      );
      return false;
    }
    const uri = vscode.Uri.file(versions.absolutePath);
    let document: vscode.TextDocument | undefined;
    try {
      document = await vscode.workspace.openTextDocument(uri);
    } catch {
      document = undefined;
    }
    if (!document) {
      await this.checkpoints.openDiff(turnId, filePath);
      void vscode.window.showInformationMessage(
        "This file was deleted by the agent turn, so it was opened as a side-by-side diff.",
      );
      return false;
    }
    if (document.getText() !== versions.afterText) {
      void vscode.window.showInformationMessage(
        "This file changed after the agent turn, so its automatic review was skipped.",
      );
      return false;
    }
    const opened = await this.checkpoints.openReviewDiff(
      turnId,
      filePath,
      this.viewColumn(),
    );
    if (!opened) {
      await this.checkpoints.openDiff(turnId, filePath);
      void vscode.window.showInformationMessage(
        "This file no longer exists, so it was opened as a side-by-side diff.",
      );
      return false;
    }
    this.clearActive();
    const key = `${turnId}\0${filePath}`;
    this.active = {
      turnId,
      path: filePath,
      uri,
      beforeText: versions.beforeText,
      afterText: versions.afterText,
      approved: this.approvedByFile.get(key) ?? new Set(),
      pending: [],
    };
    this.render();
    return true;
  }

  private accept(id: number): void {
    const active = this.active;
    const pending = active?.pending.find((item) => item.hunk.id === id);
    if (!active || !pending) return;
    active.approved.add(pending.signature);
    this.approvedByFile.set(
      `${active.turnId}\0${active.path}`,
      active.approved,
    );
    this.render();
  }

  private acceptAll(): void {
    const active = this.active;
    if (!active) return;
    for (const pending of active.pending) {
      active.approved.add(pending.signature);
    }
    this.approvedByFile.set(
      `${active.turnId}\0${active.path}`,
      active.approved,
    );
    this.render();
  }

  private async reject(id: number): Promise<void> {
    const active = this.active;
    const pending = active?.pending.find((item) => item.hunk.id === id);
    if (!active || !pending) return;
    const editor = this.editor(active);
    const document = editor?.document;
    if (!editor || !document) return;
    const { hunk } = pending;
    const start = Math.min(hunk.afterStart, document.lineCount);
    const end = Math.min(hunk.afterEnd, document.lineCount);
    let range: vscode.Range;
    if (start === end) {
      const position = new vscode.Position(start, 0);
      range = new vscode.Range(position, position);
    } else {
      const last = Math.max(start, end - 1);
      range = new vscode.Range(
        start,
        0,
        last,
        document.lineAt(last).range.end.character,
      );
    }
    if (document.getText() !== active.afterText) {
      this.abandonForExternalEdit(active);
      return;
    }
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, range, hunk.beforeText);
    this.applyingEdit = true;
    try {
      const applied = await vscode.workspace.applyEdit(edit);
      if (!applied || this.active !== active) return;
      active.afterText = document.getText();
      this.render();
    } finally {
      this.applyingEdit = false;
    }
  }

  private close(): void {
    this.queue = [];
    this.queueTotal = 0;
    this.queueIndex = 0;
    this.status?.dispose();
    this.status = undefined;
    this.clearActive();
  }

  private abandonForExternalEdit(active: ActiveReview): void {
    if (this.active !== active) return;
    this.clearActive();
    void vscode.window.setStatusBarMessage(
      "$(info) Agent review closed because the file changed after the turn.",
      5000,
    );
    if (this.queue.length > 0) void this.openNext();
  }

  private clearActive(): void {
    this.active = undefined;
    this.approveAllStatus.hide();
    this.closeStatus.hide();
    this.codeLens.set(undefined, []);
  }

  /**
   * Accepts edits that only undo known agent hunks, such as a revert from the
   * diff gutter. Anything else is an unrelated manual edit.
   */
  private reconcileRevert(active: ActiveReview, currentText: string): boolean {
    const known = new Set<string>([
      ...active.approved,
      ...active.pending.map((item) => item.signature),
    ]);
    const remaining = lineHunks(active.beforeText, currentText);
    if (!remaining.every((hunk) => known.has(signature(hunk)))) return false;
    active.afterText = currentText;
    return true;
  }

  private render(): void {
    const active = this.active;
    if (!active) return;
    const all = lineHunks(active.beforeText, active.afterText);
    const pending = all
      .map((hunk) => ({ hunk, signature: signature(hunk) }))
      .filter((item) => !active.approved.has(item.signature));
    active.pending = pending;
    if (pending.length === 0) {
      this.clearActive();
      if (this.queue.length > 0) void this.openNext();
      else if (this.queueTotal > 0) void this.openNext();
      return;
    }

    this.codeLens.set(active.uri.toString(), pending);
    this.approveAllStatus.text = `$(check-all) Approve all (${pending.length})`;
    this.approveAllStatus.tooltip =
      "Keep every agent change in this file. To restore one change, use the revert action in the diff gutter.";
    this.approveAllStatus.command = COMMAND.acceptAll;
    this.approveAllStatus.show();
    this.closeStatus.text = "$(close) Close agent review";
    this.closeStatus.tooltip = "Close this agent review without changing the file.";
    this.closeStatus.command = COMMAND.close;
    this.closeStatus.show();
  }

  private editor(active: ActiveReview): vscode.TextEditor | undefined {
    return vscode.window.visibleTextEditors.find(
      (candidate) => candidate.document.uri.toString() === active.uri.toString(),
    );
  }
}
