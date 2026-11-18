import type { AgentDefinition, AgentId, AgentSettings } from "./types";

const DEFAULT_OPENCODE_PATH = "opencode";
const DEFAULT_CODEX_ACP_PATH = "codex-acp";
const DEFAULT_CODEX_PATH = "codex";

function pathOr(value: string, fallback: string): string {
  return value.trim() || fallback;
}

export function agentDefinitions(settings: AgentSettings): AgentDefinition[] {
  const opencode = pathOr(settings.opencodePath, DEFAULT_OPENCODE_PATH);
  const codexAcp = pathOr(settings.codexAcpPath, DEFAULT_CODEX_ACP_PATH);
  const codex = pathOr(settings.codexPath, DEFAULT_CODEX_PATH);

  return [
    {
      id: "opencode",
      label: "OpenCode",
      command: opencode,
      args: ["acp"],
      env: undefined,
      missingCommandMessage:
        `Could not start OpenCode from "${opencode}". Install OpenCode 2 or set ` +
        "latexComfort.ai.agent.opencodePath.",
    },
    {
      id: "codex",
      label: "Codex",
      command: codexAcp,
      args: [],
      env: { CODEX_PATH: codex },
      missingCommandMessage:
        `Could not start the Codex ACP bridge from "${codexAcp}". Install it with ` +
        `"npm install -g @agentclientprotocol/codex-acp", or set ` +
        "latexComfort.ai.agent.codexAcpPath and latexComfort.ai.agent.codexPath.",
    },
  ];
}

export function getAgentDefinition(
  id: AgentId,
  settings: AgentSettings,
): AgentDefinition {
  const definition = agentDefinitions(settings).find((candidate) => candidate.id === id);
  if (!definition) throw new Error(`Unknown agent: ${id}`);
  return definition;
}
