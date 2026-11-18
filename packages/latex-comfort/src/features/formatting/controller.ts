import * as vscode from "vscode";
import { toggleLatexInline, type InlineFormat, type OffsetRange } from "./inline";
import {
  toggleDisplayMath,
  toggleEnvironment,
  toggleIffalse,
  toggleInlineMath,
  type OffsetRange as ToggleOffsetRange,
  type ToggleResult,
} from "./toggles";

export const TOGGLE_BOLD_COMMAND = "latexComfort.toggleBold";
export const TOGGLE_EMPHASIS_COMMAND = "latexComfort.toggleEmphasis";
export const TOGGLE_UNDERLINE_COMMAND = "latexComfort.toggleUnderline";
export const TOGGLE_INLINE_MATH_COMMAND = "latexComfort.toggleInlineMath";
export const TOGGLE_DISPLAY_MATH_COMMAND = "latexComfort.toggleDisplayMath";
export const TOGGLE_EQUATION_COMMAND = "latexComfort.toggleEquation";
export const TOGGLE_ITEMIZE_COMMAND = "latexComfort.toggleItemize";
export const TOGGLE_ENUMERATE_COMMAND = "latexComfort.toggleEnumerate";
export const TOGGLE_QUOTE_COMMAND = "latexComfort.toggleQuote";
export const TOGGLE_COMMENT_COMMAND = "latexComfort.toggleComment";
export const TOGGLE_IFFALSE_COMMAND = "latexComfort.toggleIffalse";

function isLatexEditor(editor: vscode.TextEditor): boolean {
  const language = editor.document.languageId;
  return language === "latex"
    || language === "tex"
    || language === "latex-expl3"
    || /\.(?:tex|ltx)$/iu.test(editor.document.fileName);
}

async function applyEdits(
  editor: vscode.TextEditor,
  edits: readonly { start: number; end: number; insert: string }[],
  selections: readonly OffsetRange[],
): Promise<void> {
  if (edits.length === 0) return;
  const applied = await editor.edit((builder) => {
    for (const edit of edits) {
      builder.replace(
        new vscode.Range(
          editor.document.positionAt(edit.start),
          editor.document.positionAt(edit.end),
        ),
        edit.insert,
      );
    }
  }, {
    undoStopBefore: true,
    undoStopAfter: false,
  });
  if (!applied) return;

  editor.selections = selections.map((range) => new vscode.Selection(
    editor.document.positionAt(range.start),
    editor.document.positionAt(range.end),
  ));
}

async function applyInlineFormat(editor: vscode.TextEditor, format: InlineFormat): Promise<void> {
  if (!isLatexEditor(editor) || editor.document.isClosed) return;
  const ranges: OffsetRange[] = editor.selections.map((selection) => ({
    start: editor.document.offsetAt(selection.start),
    end: editor.document.offsetAt(selection.end),
  }));
  const result = toggleLatexInline(editor.document.getText(), ranges, format);
  await applyEdits(editor, result.edits, result.selections);
}

async function applyToggle(
  editor: vscode.TextEditor,
  toggle: (source: string, range: ToggleOffsetRange) => ToggleResult,
): Promise<void> {
  if (!isLatexEditor(editor) || editor.document.isClosed) return;
  const selection = editor.selection;
  const range: ToggleOffsetRange = {
    start: editor.document.offsetAt(selection.start),
    end: editor.document.offsetAt(selection.end),
  };
  const result = toggle(editor.document.getText(), range);
  await applyEdits(editor, result.edits, result.selections);
}

function registerToggle(
  command: string,
  toggle: (source: string, range: ToggleOffsetRange) => ToggleResult,
): vscode.Disposable {
  return vscode.commands.registerTextEditorCommand(
    command,
    (editor) => void applyToggle(editor, toggle),
  );
}

export function registerInlineFormattingCommands(): vscode.Disposable[] {
  return [
    vscode.commands.registerTextEditorCommand(
      TOGGLE_BOLD_COMMAND,
      (editor) => void applyInlineFormat(editor, "bold"),
    ),
    vscode.commands.registerTextEditorCommand(
      TOGGLE_EMPHASIS_COMMAND,
      (editor) => void applyInlineFormat(editor, "emphasis"),
    ),
    vscode.commands.registerTextEditorCommand(
      TOGGLE_UNDERLINE_COMMAND,
      (editor) => void applyInlineFormat(editor, "underline"),
    ),
    registerToggle(TOGGLE_INLINE_MATH_COMMAND, toggleInlineMath),
    registerToggle(TOGGLE_DISPLAY_MATH_COMMAND, toggleDisplayMath),
    registerToggle(TOGGLE_EQUATION_COMMAND, (source, range) => toggleEnvironment(source, range, "equation")),
    registerToggle(TOGGLE_ITEMIZE_COMMAND, (source, range) => toggleEnvironment(source, range, "itemize")),
    registerToggle(TOGGLE_ENUMERATE_COMMAND, (source, range) => toggleEnvironment(source, range, "enumerate")),
    registerToggle(TOGGLE_QUOTE_COMMAND, (source, range) => toggleEnvironment(source, range, "quote")),
    registerToggle(TOGGLE_COMMENT_COMMAND, (source, range) => toggleEnvironment(source, range, "comment")),
    registerToggle(TOGGLE_IFFALSE_COMMAND, toggleIffalse),
  ];
}
