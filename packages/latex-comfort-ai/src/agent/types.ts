export type AgentId = "opencode" | "codex";

export interface AgentSettings {
  opencodePath: string;
  codexAcpPath: string;
  codexPath: string;
}

export interface AgentDefinition {
  id: AgentId;
  label: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  missingCommandMessage: string;
}

export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool"; title: string; status?: string }
  | { type: "notice"; message: string };

export interface AgentRunRequest {
  definition: AgentDefinition;
  cwd: string;
  prompt: string;
  onEvent(event: AgentEvent): void;
  requestPermission(request: AgentPermissionRequest): Promise<string | undefined>;
  signal?: AbortSignal;
}

export interface AgentPermissionRequest {
  title: string;
  options: AgentPermissionOption[];
}

export interface AgentPermissionOption {
  id: string;
  label: string;
}
