import * as vscode from "vscode";
import { countWords, wordCountLabel } from "./word-count";

const CONFIG_SECTION = "latexComfort";
const ENABLED_SETTING = "status.wordCount.enabled";
const LATEX_LANGUAGES = new Set(["latex", "tex", "latex-expl3"]);

function isLatexEditor(editor: vscode.TextEditor): boolean {
  return LATEX_LANGUAGES.has(editor.document.languageId)
    || /\.(?:tex|ltx)$/iu.test(editor.document.fileName);
}

export class WordCountStatusController implements vscode.Disposable {
  private readonly statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    90,
  );
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.statusBar.name = "LaTeX Comfort Word Count";
  }

  start(): vscode.Disposable[] {
    this.refresh();
    return [
      this,
      vscode.window.onDidChangeActiveTextEditor(() => this.refresh()),
      vscode.window.onDidChangeTextEditorSelection((event) => {
        if (event.textEditor === vscode.window.activeTextEditor) this.refresh();
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document === vscode.window.activeTextEditor?.document) this.scheduleRefresh();
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration(`${CONFIG_SECTION}.${ENABLED_SETTING}`)) this.refresh();
      }),
    ];
  }

  dispose(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.statusBar.dispose();
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      this.refresh();
    }, 120);
  }

  private refresh(): void {
    const enabled = vscode.workspace
      .getConfiguration(CONFIG_SECTION)
      .get<boolean>(ENABLED_SETTING, true);
    const editor = vscode.window.activeTextEditor;
    if (!enabled || !editor || !isLatexEditor(editor)) {
      this.statusBar.hide();
      return;
    }

    const selected = editor.selections.filter((selection) => !selection.isEmpty);
    const text = selected.length
      ? selected.map((selection) => editor.document.getText(selection)).join("\n")
      : editor.document.getText();
    const label = wordCountLabel(countWords(text), selected.length > 0);
    this.statusBar.text = label.text;
    this.statusBar.tooltip = label.tooltip;
    this.statusBar.show();
  }
}
