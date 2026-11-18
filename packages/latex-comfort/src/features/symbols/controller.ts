import * as vscode from "vscode";
import { searchLatexSymbols, type LatexSymbol } from "./catalog";

export const INSERT_SYMBOL_COMMAND = "latexComfort.insertSymbol";

const LATEX_LANGUAGES = new Set(["latex", "tex", "latex-expl3"]);

const ARGUMENT_SNIPPETS: Readonly<Record<string, string>> = {
  "\\binom": "\\binom{${1:n}}{${2:k}}",
  "\\frac": "\\frac{${1:numerator}}{${2:denominator}}",
  "\\mathbb": "\\mathbb{${1:R}}",
  "\\mathbf": "\\mathbf{${1:v}}",
  "\\mathcal": "\\mathcal{${1:F}}",
  "\\mathrm": "\\mathrm{${1:text}}",
  "\\operatorname": "\\operatorname{${1:name}}",
  "\\overset": "\\overset{${1:top}}{${2:base}}",
  "\\sqrt": "\\sqrt{${1:x}}",
  "\\text": "\\text{${1:text}}",
  "\\underset": "\\underset{${1:bottom}}{${2:base}}",
};

function isLatexEditor(editor: vscode.TextEditor): boolean {
  return LATEX_LANGUAGES.has(editor.document.languageId)
    || /\.(?:tex|ltx)$/iu.test(editor.document.fileName);
}

function symbolItem(symbol: LatexSymbol): vscode.QuickPickItem & { symbol: LatexSymbol } {
  return {
    label: symbol.command,
    description: symbol.label,
    detail: symbol.category,
    symbol,
  };
}

export async function insertLatexSymbol(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isLatexEditor(editor)) return;
  const items = searchLatexSymbols("").map(symbolItem);
  const picked = await vscode.window.showQuickPick(items, {
    title: "Insert LaTeX Symbol",
    placeHolder: "Search by command, symbol name, or category",
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (!picked) return;
  const template = ARGUMENT_SNIPPETS[picked.symbol.command] ?? picked.symbol.command;
  await editor.insertSnippet(new vscode.SnippetString(template));
}

export function registerSymbolCommands(): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(INSERT_SYMBOL_COMMAND, () => void insertLatexSymbol()),
  ];
}
