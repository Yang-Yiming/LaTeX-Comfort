import * as path from "node:path";
import * as vscode from "vscode";
import {
  COMMANDS,
  type EditMode,
  type SelectionContext,
} from "@latex-comfort/shared";
import { runAgentCommand } from "./agent/command";
import { agentDefinitions } from "./agent/definitions";
import { runAcpAgent } from "./agent/runner";
import type { AgentId, AgentSettings } from "./agent/types";
import { getCoreApi } from "./core-api";
import {
  readProviderSettings,
  readReviewPresentation,
} from "./model/vscode-settings";
import { reviewPresentationOptions } from "./review/presentation-options";
import type { ReviewPresentationSetting } from "./review/presentation";
import type { EditController } from "./session/controller";

type ModePick = vscode.QuickPickItem & {
  mode: EditMode;
};

const MODE_ITEMS: ModePick[] = [
  {
    label: "Proofread",
    description: "Correct spelling, grammar and punctuation only",
    mode: "proofread",
  },
  {
    label: "Polish",
    description: "Improve clarity, flow and academic style",
    mode: "polish",
  },
  {
    label: "Rewrite…",
    description: "Give the AI your own instruction",
    mode: "rewrite",
  },
];

export async function editSelection(controller: EditController): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showInformationMessage(
      "Open a file before using LaTeX Comfort AI.",
    );
    return;
  }
  if (editor.selection.isEmpty) {
    void vscode.window.showInformationMessage(
      "Select the text you want LaTeX Comfort AI to edit.",
    );
    return;
  }
  if (editor.document.isClosed || editor.document.uri.scheme === "untitled") {
    void vscode.window.showInformationMessage(
      "Save the file before asking LaTeX Comfort AI to edit it.",
    );
    return;
  }

  const settings = readProviderSettings();
  const selectedText = editor.document.getText(editor.selection);
  if (!selectedText.trim()) {
    void vscode.window.showInformationMessage(
      "The selected text is empty.",
    );
    return;
  }
  if (selectedText.length > settings.maxChars) {
    void vscode.window.showWarningMessage(
      `Select at most ${settings.maxChars.toLocaleString()} characters for one AI edit.`,
    );
    return;
  }

  const pick = await vscode.window.showQuickPick(MODE_ITEMS, {
    title: "LaTeX Comfort AI",
    placeHolder: "What should happen to the selection?",
    ignoreFocusOut: true,
  });
  if (!pick) return;

  let instruction = "";
  if (pick.mode === "rewrite") {
    const input = await vscode.window.showInputBox({
      title: "LaTeX Comfort AI: Rewrite",
      prompt: "Describe the change",
      placeHolder: "e.g. tighten this paragraph, preserve citations",
      ignoreFocusOut: true,
      validateInput: (value) =>
        value.trim() ? undefined : "An instruction is required.",
    });
    if (input === undefined) return;
    instruction = input.trim();
  }

  let selection: SelectionContext;
  try {
    const api = await getCoreApi();
    selection = api.getSelectionContext(editor);
  } catch (error) {
    void vscode.window.showErrorMessage(messageOf(error));
    return;
  }

  await controller.start(selection, pick.mode, instruction, contextAround(editor));
}

function contextAround(editor: vscode.TextEditor): {
  before: string;
  after: string;
} {
  const { document, selection } = editor;
  const beforeLine = Math.max(0, selection.start.line - 20);
  const afterLine = Math.min(
    document.lineCount - 1,
    selection.end.line + 20,
  );
  const before = document
    .getText(
      new vscode.Range(
        new vscode.Position(beforeLine, 0),
        selection.start,
      ),
    )
    .slice(-4_000);
  const after = document
    .getText(
      new vscode.Range(
        selection.end,
        document.lineAt(afterLine).range.end,
      ),
    )
    .slice(0, 4_000);
  return { before, after };
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function configureReviewSurface(
  supportsEditorInset: boolean,
): Promise<void> {
  const current = readReviewPresentation();
  const options = reviewPresentationOptions(supportsEditorInset);
  const currentOption = options.find((option) => option.value === current);
  const picked = await vscode.window.showQuickPick(
    options.map((option) => ({
      label: option.label,
      description: option.description,
      detail: option.detail,
      value: option.value,
      picked: option.value === current,
    })),
    {
      title: "LaTeX Comfort AI: Review Surface",
      placeHolder: `Current: ${currentOption?.label ?? current}`,
      ignoreFocusOut: true,
    },
  );
  if (!picked) return;
  const config = vscode.workspace.getConfiguration("latexComfort.ai");
  await config.update(
    "review.presentation",
    picked.value satisfies ReviewPresentationSetting,
    vscode.ConfigurationTarget.Global,
  );
}

function readAgentSettings(): AgentSettings {
  const config = vscode.workspace.getConfiguration("latexComfort.ai.agent");
  return {
    opencodePath: config.get("opencodePath", "opencode"),
    codexAcpPath: config.get("codexAcpPath", "codex-acp"),
    codexPath: config.get("codexPath", "codex"),
  };
}

function workspaceDirectory(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function activeFileDirectory(): string | undefined {
  const uri = vscode.window.activeTextEditor?.document.uri;
  return uri?.scheme === "file" ? path.dirname(uri.fsPath) : undefined;
}

async function runAgentFromCommand(output: vscode.OutputChannel): Promise<void> {
  const settings = readAgentSettings();
  await runAgentCommand({
    settings,
    output,
    workspaceDirectory,
    activeFileDirectory,
    runAgent: runAcpAgent,
    selectAgent: async () => {
      const picked = await vscode.window.showQuickPick(
        agentDefinitions(settings).map((definition) => ({
          label: definition.label,
          description: definition.command,
          id: definition.id,
        })),
        {
          title: "LaTeX Comfort AI: Run Agent",
          placeHolder: "Choose a local CLI agent",
          ignoreFocusOut: true,
        },
      );
      return picked?.id satisfies AgentId | undefined;
    },
    inputPrompt: async () =>
      vscode.window.showInputBox({
        title: "LaTeX Comfort AI: Run Agent",
        prompt: "What should the agent do in this project?",
        placeHolder: "e.g. inspect the paper and fix compile errors",
        ignoreFocusOut: true,
        validateInput: (value) =>
          value.trim() ? undefined : "Enter a task for the agent.",
      }),
    requestPermission: async (request) => {
      const items = request.options.map((option) => ({
        title: option.label,
        id: option.id,
      }));
      const picked = await vscode.window.showWarningMessage(
        request.title,
        { modal: true },
        ...items,
      );
      return picked?.id;
    },
    withCancellation: async (task) =>
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "LaTeX Comfort Agent",
          cancellable: true,
        },
        async (_progress, token) => {
          const abort = new AbortController();
          const subscription = token.onCancellationRequested(() => abort.abort());
          try {
            await task(abort.signal);
          } finally {
            subscription.dispose();
          }
        },
      ),
  });
}

export function registerCommands(
  context: vscode.ExtensionContext,
  controller: EditController,
  options: { supportsEditorInset: boolean } = { supportsEditorInset: false },
): vscode.Disposable[] {
  const agentOutput = vscode.window.createOutputChannel("LaTeX Comfort Agent");
  return [
    vscode.commands.registerCommand(COMMANDS.editSelection, () =>
      editSelection(controller).catch((error: unknown) => {
        void vscode.window.showErrorMessage(messageOf(error));
      }),
    ),
    vscode.commands.registerCommand(COMMANDS.configureProvider, () =>
      import("./model/vscode-settings").then(({ configureProvider }) =>
        configureProvider(context),
      ),
    ),
    vscode.commands.registerCommand(COMMANDS.configureReviewSurface, () =>
      configureReviewSurface(options.supportsEditorInset).catch(
        (error: unknown) => {
          void vscode.window.showErrorMessage(messageOf(error));
        },
      ),
    ),
    vscode.commands.registerCommand(COMMANDS.runAgent, () =>
      runAgentFromCommand(agentOutput).catch((error: unknown) => {
        void vscode.window.showErrorMessage(messageOf(error));
      }),
    ),
    agentOutput,
  ];
}
