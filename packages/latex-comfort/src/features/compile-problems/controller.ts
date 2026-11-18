/*
 * Diagnostic navigation adapted from Lattice's
 * src/build/compile-diagnostics-panel.tsx (Apache-2.0).
 * Copyright 2026 Leonardo and the Lattice contributors.
 * Licensed under the Apache License, Version 2.0.
 * Modified for LaTeX Comfort: VS Code status bar and Quick Pick.
 */

import * as vscode from "vscode";
import { collectCompileProblems, type CompileProblem } from "./model";
import { cycleProblemIndex } from "./navigation";
import { compileProblemRows } from "./picker";
import { compileProblemStatus } from "./status";
import { diagnosticToProblemInput } from "./vscode-adapter";

export const SHOW_COMPILE_PROBLEMS_COMMAND = "latexComfort.showCompileProblems";
export const NEXT_COMPILE_PROBLEM_COMMAND = "latexComfort.nextCompileProblem";
export const PREVIOUS_COMPILE_PROBLEM_COMMAND = "latexComfort.previousCompileProblem";

type ProblemQuickPickItem = vscode.QuickPickItem & { problem?: CompileProblem };

export class CompileProblemsController implements vscode.Disposable {
  private readonly statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    90,
  );
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private problems: CompileProblem[] = [];
  private currentProblem = -1;

  constructor() {
    this.statusBar.command = SHOW_COMPILE_PROBLEMS_COMMAND;
    this.statusBar.name = "LaTeX Comfort Compile Problems";
  }

  start(): vscode.Disposable[] {
    this.refresh();
    return [
      this,
      vscode.commands.registerCommand(
        SHOW_COMPILE_PROBLEMS_COMMAND,
        () => void this.show(),
      ),
      vscode.commands.registerCommand(
        NEXT_COMPILE_PROBLEM_COMMAND,
        () => void this.move(1),
      ),
      vscode.commands.registerCommand(
        PREVIOUS_COMPILE_PROBLEM_COMMAND,
        () => void this.move(-1),
      ),
      vscode.languages.onDidChangeDiagnostics(() => this.scheduleRefresh()),
      vscode.window.onDidChangeActiveTextEditor(() => this.scheduleRefresh()),
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
    }, 100);
  }

  private refresh(): void {
    const previousCount = this.problems.length;
    const active = vscode.window.activeTextEditor;
    const activeFolder = active && vscode.workspace.getWorkspaceFolder(active.document.uri);
    const diagnostics = vscode.languages.getDiagnostics().filter(([uri]) => {
      if (!activeFolder) return true;
      return vscode.workspace.getWorkspaceFolder(uri)?.uri.toString() === activeFolder.uri.toString();
    });
    this.problems = collectCompileProblems(
      diagnostics.flatMap(([uri, items]) =>
        items.map((diagnostic) => diagnosticToProblemInput(
          uri.toString(),
          vscode.workspace.asRelativePath(uri, false),
          diagnostic,
        )),
      ),
    );

    if (this.currentProblem >= this.problems.length || this.problems.length !== previousCount) {
      this.currentProblem = -1;
    }
    const status = compileProblemStatus(this.problems);
    if (!status) {
      this.statusBar.hide();
      return;
    }
    this.statusBar.text = status.text;
    this.statusBar.tooltip = status.tooltip;
    this.statusBar.show();
  }

  private async show(): Promise<void> {
    if (this.problems.length === 0) {
      void vscode.window.showInformationMessage("No LaTeX compile problems found.");
      return;
    }

    const items = compileProblemRows(this.problems).map((row): ProblemQuickPickItem =>
      row.kind === "separator"
        ? { label: row.label, kind: vscode.QuickPickItemKind.Separator }
        : {
            label: row.label,
            description: row.description,
            detail: row.problem.source ? `Source: ${row.problem.source}` : undefined,
            iconPath: row.problem.severity === "error"
              ? new vscode.ThemeIcon("error", new vscode.ThemeColor("errorForeground"))
              : new vscode.ThemeIcon("warning", new vscode.ThemeColor("editorWarning.foreground")),
            problem: row.problem,
          },
    );
    const status = compileProblemStatus(this.problems);
    const picked = await vscode.window.showQuickPick(items, {
      title: "LaTeX Compile Problems",
      placeHolder: status?.tooltip ?? "Select a problem to jump to its source",
      matchOnDescription: true,
      matchOnDetail: true,
    });
    if (picked?.problem) {
      this.currentProblem = this.problems.indexOf(picked.problem);
      await this.open(picked.problem);
    }
  }

  private async move(delta: number): Promise<void> {
    this.refresh();
    if (this.problems.length === 0) {
      void vscode.window.showInformationMessage("No LaTeX compile problems found.");
      return;
    }
    this.currentProblem = cycleProblemIndex(this.problems.length, this.currentProblem, delta);
    const problem = this.problems[this.currentProblem];
    if (problem) await this.open(problem);
  }

  private async open(problem: CompileProblem): Promise<void> {
    try {
      const uri = vscode.Uri.parse(problem.uri);
      const document = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(document, { preview: true });
      const { start, end } = problem.range;
      const range = new vscode.Range(start.line, start.character, end.line, end.character);
      editor.selection = new vscode.Selection(range.start, range.end);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`Could not open LaTeX compile problem: ${message}`);
    }
  }
}
