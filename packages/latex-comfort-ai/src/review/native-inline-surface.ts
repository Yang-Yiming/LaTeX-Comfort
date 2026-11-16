import * as vscode from "vscode";
import type { Hunk, TextRange } from "@latex-comfort/shared";
import {
  acceptLensTitle,
  hunkHoverMarkdown,
  rangeWithinSelection,
} from "./native-inline-layout";
import type { ReviewAction, ReviewViewState } from "./state";
import type { ReviewSurface } from "./surface";

const COMMAND = {
  accept: "latexComfort.ai.review.accept",
  reject: "latexComfort.ai.review.reject",
  openSidebar: "latexComfort.ai.review.openSidebar",
  toggleHunk: "latexComfort.ai.review.toggleHunk",
} as const;

export class NativeInlineSurface implements ReviewSurface {
  private state: ReviewViewState = { status: "idle" };
  private readonly removedDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor("diffEditor.removedTextBackground"),
    textDecoration: "line-through",
    overviewRulerColor: new vscode.ThemeColor("editorOverviewRuler.errorForeground"),
    overviewRulerLane: vscode.OverviewRulerLane.Left,
  });
  private readonly rejectedDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor("editor.wordHighlightBackground"),
    textDecoration: "underline dashed",
  });
  private readonly insertionDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor("diffEditor.insertedTextBackground"),
    border: "1px solid",
    borderColor: new vscode.ThemeColor("diffEditor.insertedTextBorder"),
  });
  private readonly rejectedInsertionDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor("editor.wordHighlightBackground"),
    border: "1px dashed",
    borderColor: new vscode.ThemeColor("editorWarning.foreground"),
  });
  private readonly codeLens = new ReviewCodeLensProvider();
  private readonly disposables: vscode.Disposable[];
  private loadingStatus: vscode.Disposable | undefined;
  private lastError: string | undefined;

  constructor(private readonly dispatch: (action: ReviewAction) => void) {
    this.disposables = [
      this.removedDecoration,
      this.rejectedDecoration,
      this.insertionDecoration,
      this.rejectedInsertionDecoration,
      this.codeLens,
      vscode.languages.registerCodeLensProvider("*", this.codeLens),
      vscode.commands.registerCommand(COMMAND.accept, () =>
        this.dispatch({ type: "accept" }),
      ),
      vscode.commands.registerCommand(COMMAND.reject, () =>
        this.dispatch({ type: "reject" }),
      ),
      vscode.commands.registerCommand(COMMAND.openSidebar, () =>
        this.dispatch({ type: "openSidebar" }),
      ),
      vscode.commands.registerCommand(
        COMMAND.toggleHunk,
        (id: number, accepted: boolean) =>
          this.dispatch({ type: "toggleHunk", id, accepted }),
      ),
      vscode.window.onDidChangeVisibleTextEditors(() => this.apply()),
    ];
  }

  render(state: ReviewViewState): void {
    this.state = state;
    this.apply();
  }

  dispose(): void {
    this.loadingStatus?.dispose();
    this.loadingStatus = undefined;
    this.clearDecorations();
    this.codeLens.clear();
    for (const disposable of this.disposables) disposable.dispose();
    this.state = { status: "idle" };
  }

  private apply(): void {
    const editor = this.editor();
    if (!editor) {
      this.codeLens.clear();
      if (this.state.status !== "idle" && this.state.status !== "error") {
        this.dispatch({ type: "openSidebar" });
      }
      return;
    }

    if (this.state.status === "error") {
      this.clearDecorations(editor);
      this.codeLens.clear();
      this.loadingStatus?.dispose();
      this.loadingStatus = undefined;
      if (this.lastError !== this.state.message) {
        this.lastError = this.state.message;
        void vscode.window.showErrorMessage(this.state.message);
      }
      return;
    }

    if (this.state.status === "idle" || this.state.status === "loading") {
      this.clearDecorations(editor);
      this.codeLens.clear();
      this.lastError = undefined;
      if (this.state.status === "loading" && !this.loadingStatus) {
        this.loadingStatus = vscode.window.setStatusBarMessage(
          "$(sparkle) LaTeX Comfort AI is editing the selection…",
        );
      } else if (this.state.status === "idle") {
        this.loadingStatus?.dispose();
        this.loadingStatus = undefined;
      }
      return;
    }

    this.loadingStatus?.dispose();
    this.loadingStatus = undefined;
    this.lastError = undefined;

    const { review, context, selectedHunkIds } = this.state;
    const selected = new Set(selectedHunkIds);
    const removed: vscode.DecorationOptions[] = [];
    const rejected: vscode.DecorationOptions[] = [];
    const inserted: vscode.DecorationOptions[] = [];
    const rejectedInsertions: vscode.DecorationOptions[] = [];

    for (const hunk of review.hunks) {
      const accepted = selected.has(hunk.id);
      const hoverMessage = new vscode.MarkdownString(
        hunkHoverMarkdown(
          hunk.id,
          review.hunks.length,
          accepted,
          COMMAND.toggleHunk,
        ),
      );
      hoverMessage.isTrusted = true;

      const deleted = review.original.slice(hunk.from, hunk.to);
      if (deleted) {
        const range = toVscodeRange(
          rangeWithinSelection(
            context.range,
            review.original,
            hunk.from,
            hunk.to,
          ),
        );
        (accepted ? removed : rejected).push({ range, hoverMessage });
      } else if (hunk.insert) {
        const option = {
          range: insertionAnchor(review.original, context.range, hunk),
          hoverMessage,
        };
        (accepted ? inserted : rejectedInsertions).push(option);
      }
    }

    editor.setDecorations(this.removedDecoration, removed);
    editor.setDecorations(this.rejectedDecoration, rejected);
    editor.setDecorations(this.insertionDecoration, inserted);
    editor.setDecorations(this.rejectedInsertionDecoration, rejectedInsertions);
    this.codeLens.setState(this.state);
  }

  private clearDecorations(editor?: vscode.TextEditor): void {
    const target = editor ?? this.editor();
    if (!target) return;
    target.setDecorations(this.removedDecoration, []);
    target.setDecorations(this.rejectedDecoration, []);
    target.setDecorations(this.insertionDecoration, []);
    target.setDecorations(this.rejectedInsertionDecoration, []);
  }

  private editor(): vscode.TextEditor | undefined {
    const uri =
      this.state.status === "idle" || this.state.status === "error"
        ? undefined
        : this.state.context.uri;
    if (!uri) return undefined;
    return vscode.window.visibleTextEditors.find(
      (editor) => editor.document.uri.toString() === uri,
    );
  }
}

class ReviewCodeLensProvider implements vscode.CodeLensProvider {
  private state: ReviewViewState = { status: "idle" };
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.changed.event;

  setState(state: ReviewViewState): void {
    this.state = state;
    this.changed.fire();
  }

  clear(): void {
    this.setState({ status: "idle" });
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (this.state.status !== "ready") return [];
    if (document.uri.toString() !== this.state.context.uri) return [];

    const { review, context, selectedHunkIds } = this.state;
    const start = new vscode.Range(
      context.range.start.line,
      0,
      context.range.start.line,
      0,
    );

    return [
      new vscode.CodeLens(start, {
        title: acceptLensTitle(selectedHunkIds.length, review.hunks.length),
        command: COMMAND.accept,
      }),
      new vscode.CodeLens(start, {
        title: "$(book) Review",
        command: COMMAND.openSidebar,
      }),
      new vscode.CodeLens(start, {
        title: "$(close) Discard",
        command: COMMAND.reject,
      }),
    ];
  }

  dispose(): void {
    this.changed.dispose();
  }
}

function insertionAnchor(
  original: string,
  selection: TextRange,
  hunk: Hunk,
): vscode.Range {
  const from = hunk.from;
  if (original.length === 0) return new vscode.Range(0, 0, 0, 0);
  if (from > 0) {
    return toVscodeRange(
      rangeWithinSelection(selection, original, from - 1, from),
    );
  }
  return toVscodeRange(
    rangeWithinSelection(selection, original, 0, Math.min(1, original.length)),
  );
}

function toVscodeRange(range: {
  start: { line: number; character: number };
  end: { line: number; character: number };
}): vscode.Range {
  return new vscode.Range(
    range.start.line,
    range.start.character,
    range.end.line,
    range.end.character,
  );
}
