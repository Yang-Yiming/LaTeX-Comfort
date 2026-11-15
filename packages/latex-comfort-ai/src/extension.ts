import * as vscode from "vscode";
import { COMMANDS, type WebviewToHostMessage } from "@latex-comfort/shared";
import { registerCommands } from "./commands";
import { readProviderSettings } from "./model/vscode-settings";
import { ReviewPanel } from "./review/panel";
import { EditController } from "./session/controller";
import type { EditSession } from "./session/session";

export function activate(context: vscode.ExtensionContext): void {
  let controller: EditController | undefined;

  const panel = new ReviewPanel(context.extensionUri, {
    onMessage: (message) => void handleMessage(message, controller),
    onDispose: () => controller?.dispose(),
  });

  controller = new EditController({
    provider: async () => {
      const { createProvider } = await import("./model/vscode-settings");
      return createProvider(context);
    },
    panel,
    currentSnapshot: async (session) => {
      const document = findDocument(session.uri);
      if (!document) return { uri: session.uri, version: -1, text: "" };
      return {
        uri: document.uri.toString(),
        version: document.version,
        text: document.getText(toRange(session)),
      };
    },
    applyEdit: async (session, replacement) => {
      const document = findDocument(session.uri);
      if (!document) return false;
      const edit = new vscode.WorkspaceEdit();
      edit.replace(document.uri, toRange(session), replacement);
      const applied = await vscode.workspace.applyEdit(edit);
      if (applied) {
        await vscode.window.showTextDocument(document, {
          preview: false,
          preserveFocus: false,
        });
      }
      return applied;
    },
  });

  context.subscriptions.push(
    ...registerCommands(context, controller),
    { dispose: () => controller?.dispose() },
  );

  // Keep this import referenced in the extension host bundle. Configuration is
  // loaded lazily by the first request, but reading it here catches malformed
  // user settings early and gives the AI extension a stable activation path.
  void readProviderSettings();
}

async function handleMessage(
  message: WebviewToHostMessage,
  controller: EditController | undefined,
): Promise<void> {
  if (!controller) return;
  switch (message.type) {
    case "webviewReady":
      return;
    case "toggleHunk":
      // The webview owns the rejected-hunk set; acceptance sends the final list.
      return;
    case "accept":
      await controller.accept(message.acceptedIds);
      return;
    case "reject":
      controller.reject();
      return;
    case "configureProvider":
      await vscode.commands.executeCommand(COMMANDS.configureProvider);
      return;
  }
}

function findDocument(uri: string): vscode.TextDocument | undefined {
  return vscode.workspace.textDocuments.find(
    (document) => document.uri.toString() === uri,
  );
}

function toRange(session: EditSession): vscode.Range {
  return new vscode.Range(
    session.range.start.line,
    session.range.start.character,
    session.range.end.line,
    session.range.end.character,
  );
}
