import nodePath from "node:path";
import * as vscode from "vscode";
import { EDIT_ASK_RULE, insertEditAskRule } from "./opencode-config";

export const CONFIGURE_OPENCODE_REVIEW_COMMAND =
  "latexComfort.ai.agent.configureReview";

const CANDIDATES = [
  ".opencode/opencode.json",
  ".opencode/opencode.jsonc",
  "opencode.json",
  "opencode.jsonc",
] as const;

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function configureOpenCodeReview(): Promise<void> {
  const root =
    vscode.workspace.workspaceFolders?.[0]?.uri ??
    (vscode.window.activeTextEditor?.document.uri.scheme === "file"
      ? vscode.Uri.file(
          nodePath.dirname(vscode.window.activeTextEditor.document.uri.fsPath),
        )
      : undefined);
  if (!root) {
    void vscode.window.showWarningMessage(
      "Open a folder before configuring OpenCode review.",
    );
    return;
  }

  let target: vscode.Uri | undefined;
  for (const candidate of CANDIDATES) {
    const uri = vscode.Uri.joinPath(root, candidate);
    if (await exists(uri)) {
      target = uri;
      break;
    }
  }
  const create = !target;
  target ??= vscode.Uri.joinPath(root, ".opencode/opencode.json");

  let text = "";
  if (!create) {
    const bytes = await vscode.workspace.fs.readFile(target);
    text = new TextDecoder().decode(bytes);
  }
  let next: ReturnType<typeof insertEditAskRule>;
  try {
    next = insertEditAskRule(text);
  } catch (error) {
    void vscode.window.showErrorMessage(
      `Could not update ${nodePath.basename(target.fsPath)}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    await vscode.window.showTextDocument(target);
    return;
  }
  if (!next.changed) {
    void vscode.window.showInformationMessage(
      "OpenCode already asks before every edit in this workspace.",
    );
    return;
  }

  const rule = JSON.stringify(EDIT_ASK_RULE);
  const choice = await vscode.window.showWarningMessage(
    create
      ? "Enable per-edit review for OpenCode in this workspace?"
      : `Add a per-edit review rule to ${nodePath.basename(target.fsPath)}?`,
    {
      modal: true,
      detail: [
        "The agent will show a diff and wait for approval before writing a file.",
        "",
        "Rule to add:",
        `  ${rule}`,
        "",
        create
          ? `A new file will be created: ${vscode.workspace.asRelativePath(target)}`
          : "The rule is placed where it overrides edit allowances but not explicit edit denials.",
      ].join("\n"),
    },
    "Enable per-edit review",
  );
  if (choice !== "Enable per-edit review") return;

  if (create) {
    await vscode.workspace.fs.createDirectory(
      vscode.Uri.joinPath(root, ".opencode"),
    );
    await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(next.text));
  } else {
    const document = await vscode.workspace.openTextDocument(target);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      target,
      new vscode.Range(0, 0, document.lineCount, 0),
      next.text,
    );
    const applied = await vscode.workspace.applyEdit(edit);
    if (!applied) {
      void vscode.window.showErrorMessage(
        `Could not update ${nodePath.basename(target.fsPath)}.`,
      );
      return;
    }
  }

  void vscode.window.showInformationMessage(
    "OpenCode will now ask before each edit. Start a new agent thread to apply it.",
  );
}

export function registerOpenCodeReviewCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    CONFIGURE_OPENCODE_REVIEW_COMMAND,
    configureOpenCodeReview,
  );
}
