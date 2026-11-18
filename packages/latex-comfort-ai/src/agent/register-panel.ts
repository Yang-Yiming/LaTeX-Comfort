import * as path from "node:path";
import * as vscode from "vscode";
import {
  COMMANDS,
  type AgentUiAgentId,
  type AgentUiAuthMethod,
  type AgentUiContext,
  type AgentWebviewToHostMessage,
} from "@latex-comfort/shared";
import { createInteractiveRuntime } from "./interactive-runtime";
import { AgentPanelController } from "./panel-controller";
import { AgentPanelSurface } from "./panel-surface";
import type { AgentId, AgentSettings } from "./types";

const LAST_AGENT_KEY = "latexComfort.agent.lastAgent";

function readSettings(): AgentSettings {
  const config = vscode.workspace.getConfiguration("latexComfort.ai.agent");
  return {
    opencodePath: config.get("opencodePath", "opencode"),
    codexAcpPath: config.get("codexAcpPath", "codex-acp"),
    codexPath: config.get("codexPath", "codex"),
    opencodeModel: config.get("opencodeModel", ""),
    codexModel: config.get("codexModel", ""),
  };
}

function workspaceDirectory(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function activeFileDirectory(): string | undefined {
  const uri = vscode.window.activeTextEditor?.document.uri;
  return uri?.scheme === "file" ? path.dirname(uri.fsPath) : undefined;
}

function editorContext(): AgentUiContext | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.uri.scheme !== "file") return undefined;
  if (editor.selection.isEmpty) return undefined;
  const name = path.basename(editor.document.uri.fsPath);
  const start = editor.selection.start.line + 1;
  const end = editor.selection.end.line + 1;
  return {
    label: `${name}:${start}${end === start ? "" : `-${end}`} · selection`,
    uri: editor.document.uri.toString(),
    line: start,
    character: editor.selection.start.character,
    selectedText: editor.document.getText(editor.selection).slice(0, 12_000),
  };
}

async function authenticateTerminal(
  agentId: AgentId,
  method: AgentUiAuthMethod,
): Promise<void> {
  const settings = readSettings();
  const definition =
    agentId === "opencode"
      ? {
          command: settings.opencodePath.trim() || "opencode",
          args: ["acp"],
          env: undefined,
        }
      : {
          command: settings.codexAcpPath.trim() || "codex-acp",
          args: [] as string[],
          env: { CODEX_PATH: settings.codexPath.trim() || "codex" },
        };
  const terminal = vscode.window.createTerminal({
    name: `${agentId === "opencode" ? "OpenCode" : "Codex"} Login`,
    shellPath: definition.command,
    shellArgs: [...definition.args, ...(method.args ?? [])],
    env: { ...process.env, ...definition.env, ...method.env },
  });
  const closed = new Promise<void>((resolve) => {
    const subscription = vscode.window.onDidCloseTerminal((candidate) => {
      if (candidate !== terminal) return;
      subscription.dispose();
      resolve();
    });
  });
  terminal.show();
  await closed;
}

function containedPath(candidate: string): string | undefined {
  const folders = vscode.workspace.workspaceFolders ?? [];
  for (const folder of folders) {
    const root = folder.uri.fsPath;
    const absolute = path.isAbsolute(candidate)
      ? path.normalize(candidate)
      : path.resolve(root, candidate);
    const relative = path.relative(root, absolute);
    if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
      return absolute;
    }
  }
  return undefined;
}

async function openLocation(file: string, line?: number): Promise<void> {
  const absolute = containedPath(file);
  if (!absolute) {
    void vscode.window.showWarningMessage(
      "The agent referenced a file outside the open workspace.",
    );
    return;
  }
  const document = await vscode.workspace.openTextDocument(
    vscode.Uri.file(absolute),
  );
  const editor = await vscode.window.showTextDocument(document, {
    preview: false,
    preserveFocus: false,
  });
  if (line && line > 0) {
    const position = new vscode.Position(Math.max(0, line - 1), 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(
      new vscode.Range(position, position),
      vscode.TextEditorRevealType.InCenterIfOutsideViewport,
    );
  }
}

function initialAgent(context: vscode.ExtensionContext): AgentId {
  const stored = context.workspaceState.get<string>(LAST_AGENT_KEY);
  return stored === "codex" ? "codex" : "opencode";
}

export function registerAgentPanel(
  context: vscode.ExtensionContext,
): vscode.Disposable[] {
  const settings = readSettings();
  let panel: AgentPanelSurface;
  let controller: AgentPanelController;

  const dispatch = async (message: AgentWebviewToHostMessage): Promise<void> => {
    switch (message.type) {
      case "agentSend":
        await controller.submit(message.text);
        return;
      case "agentCancel":
        await controller.cancel();
        return;
      case "agentNewThread":
        await controller.newThread();
        return;
      case "agentSelectAgent":
        controller.selectAgent(message.agentId);
        await context.workspaceState.update(LAST_AGENT_KEY, message.agentId);
        return;
      case "agentSelectConfig":
        await controller.selectConfig(message.configId, message.value);
        return;
      case "agentResolvePermission":
        controller.resolvePermission(message.permissionId, message.optionId);
        return;
      case "agentAuthenticate":
        await controller.authenticate(message.methodId);
        return;
      case "agentOpenLocation":
        await openLocation(message.path, message.line);
        return;
      case "agentOpenSettings":
        await vscode.commands.executeCommand(
          "workbench.action.openSettings",
          "latexComfort.ai.agent",
        );
        return;
      case "agentWebviewReady":
        return;
    }
  };

  panel = new AgentPanelSurface(context.extensionUri, dispatch);
  controller = new AgentPanelController({
    settings,
    workspaceDirectory,
    activeFileDirectory,
    createRuntime: createInteractiveRuntime,
    onSnapshot: (snapshot) => panel.render(snapshot),
    authenticateTerminal,
    initialAgentId: initialAgent(context),
    initialModels: {
      ...(settings.opencodeModel?.trim()
        ? { opencode: settings.opencodeModel.trim() }
        : {}),
      ...(settings.codexModel?.trim()
        ? { codex: settings.codexModel.trim() }
        : {}),
    },
  });

  const open = (): void => {
    controller.setContext(editorContext());
    panel.show();
    panel.render(controller.snapshot());
  };

  const refreshContext = (): void => {
    controller.setContext(editorContext());
  };

  return [
    vscode.commands.registerCommand(COMMANDS.openAgent, open),
    vscode.window.onDidChangeActiveTextEditor(refreshContext),
    vscode.window.onDidChangeTextEditorSelection(refreshContext),
    { dispose: () => void controller.dispose() },
    panel,
  ];
}
