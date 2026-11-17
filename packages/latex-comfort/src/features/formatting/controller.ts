import * as vscode from "vscode";
import { toggleLatexInline, type InlineFormat, type OffsetRange } from "./inline";

export const TOGGLE_BOLD_COMMAND = "latexComfort.toggleBold";
export const TOGGLE_EMPHASIS_COMMAND = "latexComfort.toggleEmphasis";

function isLatexEditor(editor: vscode.TextEditor): boolean {
  const language = editor.document.languageId;
  return language === "latex"
    || language === "tex"
    || language === "latex-expl3"
    || /\.(?:tex|ltx)$/iu.test(editor.document.fileName);
}

async function applyInlineFormat(editor: vscode.TextEditor, format: InlineFormat): Promise<void> {
  if (!isLatexEditor(editor) || editor.document.isClosed) return;
  const ranges: OffsetRange[] = editor.selections.map((selection) => ({
    start: editor.document.offsetAt(selection.start),
    end: editor.document.offsetAt(selection.end),
  }));
  const result = toggleLatexInline(editor.document.getText(), ranges, format);
  if (result.edits.length === 0) return;

  const applied = await editor.edit((builder) => {
    for (const edit of result.edits) {
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

  editor.selections = result.selections.map((range) => new vscode.Selection(
    editor.document.positionAt(range.start),
    editor.document.positionAt(range.end),
  ));
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
  ];
}
