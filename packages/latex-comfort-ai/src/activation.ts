import * as vscode from "vscode";
import { COMMANDS, type SelectionContext } from "@latex-comfort/shared";
import { registerCommands } from "./commands";
import { readProviderSettings, readReviewPresentation } from "./model/vscode-settings";
import { NativeInlineSurface } from "./review/native-inline-surface";
import { PanelSurface } from "./review/panel-surface";
import { chooseReviewSurface } from "./review/presentation";
import { ReviewSurfaceHost, type ReviewSurface } from "./review/surface";
import type { ReviewAction, ReviewViewState } from "./review/state";
import { EditController } from "./session/controller";
import type { EditSession } from "./session/session";

export interface ActivationOptions {
  editorInset?: {
    available(): boolean;
    create(dispatch: (action: ReviewAction) => void): ReviewSurface;
  };
}

export function activateLatexComfort(
  context: vscode.ExtensionContext,
  options: ActivationOptions = {},
): void {
  let controller: EditController | undefined;
  let host: ReviewSurfaceHost | undefined;
  const editorInsetAvailable = options.editorInset?.available() === true;
  const dispatch = (action: ReviewAction): void => {
    if (action.type === "openSidebar") {
      host?.showSidebar();
      return;
    }
    void handleAction(action, controller);
  };
  host = new ReviewSurfaceHost(
    {
      sidePanel: () => new PanelSurface(context.extensionUri, dispatch),
      nativeInline: () => new NativeInlineSurface(dispatch),
      ...(options.editorInset && editorInsetAvailable
        ? { editorInset: () => options.editorInset!.create(dispatch) }
        : {}),
    },
    (state: ReviewViewState) =>
      chooseStateSurface(
        state,
        readReviewPresentation(),
        editorInsetAvailable,
      ),
  );

  controller = new EditController({
    provider: async () => {
      const { createProvider } = await import("./model/vscode-settings");
      return createProvider(context);
    },
    surface: host,
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
    host,
  );

  void readProviderSettings();
}

function chooseStateSurface(
  state: ReviewViewState,
  setting: ReturnType<typeof readReviewPresentation>,
  editorInsetAvailable: boolean,
): "sidePanel" | "nativeInline" | "editorInset" {
  if (state.status === "idle") return "sidePanel";
  if (!("context" in state) || !state.context) return "sidePanel";
  return chooseReviewSurface(
    setting,
    state.context,
    editorInsetAvailable,
  );
}

async function handleAction(
  action: ReviewAction,
  controller: EditController | undefined,
): Promise<void> {
  if (!controller) return;
  switch (action.type) {
    case "toggleHunk":
      controller.toggleHunk(action.id, action.accepted);
      return;
    case "accept":
      await controller.accept();
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
