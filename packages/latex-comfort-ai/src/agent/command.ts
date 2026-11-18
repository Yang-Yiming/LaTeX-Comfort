import { getAgentDefinition } from "./definitions";
import type {
  AgentEvent,
  AgentId,
  AgentPermissionRequest,
  AgentRunRequest,
  AgentSettings,
} from "./types";

export interface AgentOutput {
  show(): void;
  append(text: string): void;
  appendLine(text: string): void;
}

export interface AgentCommandDependencies {
  settings: AgentSettings;
  selectAgent(): Promise<AgentId | undefined>;
  inputPrompt(): Promise<string | undefined>;
  workspaceDirectory(): string | undefined;
  activeFileDirectory(): string | undefined;
  requestPermission(request: AgentPermissionRequest): Promise<string | undefined>;
  withCancellation(
    task: (signal: AbortSignal) => Promise<void>,
  ): Promise<void>;
  runAgent(request: AgentRunRequest): Promise<void>;
  output: AgentOutput;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function writeEvent(output: AgentOutput, event: AgentEvent): void {
  switch (event.type) {
    case "text":
      output.append(event.text);
      return;
    case "thinking":
      output.appendLine(`[thinking] ${event.text}`);
      return;
    case "tool":
      output.appendLine(
        `[tool] ${event.title}${event.status ? ` (${event.status})` : ""}`,
      );
      return;
    case "notice":
      output.appendLine(`[notice] ${event.message}`);
      return;
  }
}

export async function runAgentCommand(
  deps: AgentCommandDependencies,
): Promise<void> {
  const agentId = await deps.selectAgent();
  if (!agentId) return;

  const prompt = (await deps.inputPrompt())?.trim();
  if (!prompt) return;

  const cwd = deps.workspaceDirectory() ?? deps.activeFileDirectory();
  if (!cwd) {
    throw new Error("Open a folder or file before running an agent.");
  }

  const definition = getAgentDefinition(agentId, deps.settings);
  deps.output.show();
  deps.output.appendLine(`[${definition.label}] Running in ${cwd}`);

  try {
    await deps.withCancellation((signal) =>
      deps.runAgent({
        definition,
        cwd,
        prompt,
        signal,
        onEvent: (event) => writeEvent(deps.output, event),
        requestPermission: deps.requestPermission,
      }),
    );
  } catch (error) {
    if (isAbortError(error)) {
      deps.output.appendLine("Agent run cancelled.");
      return;
    }
    throw error;
  }
}
