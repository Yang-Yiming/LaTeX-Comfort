export type AgentId = "opencode" | "codex";

export interface AgentSettings {
  opencodePath: string;
  codexAcpPath: string;
  codexPath: string;
  opencodeModel?: string;
  codexModel?: string;
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
  selectModel?(selection: AgentModelSelection): Promise<string | undefined>;
  authenticate?(request: AgentAuthRequest): Promise<AgentAuthDecision>;
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

export interface AgentModelOption {
  value: string;
  label: string;
}

export interface AgentModelSelection {
  current?: string;
  options: AgentModelOption[];
}

export interface AgentAuthMethod {
  id: string;
  label: string;
  description?: string;
  type: "agent" | "terminal";
  args?: string[];
  env?: Record<string, string>;
}

export interface AgentAuthRequest {
  agentId: AgentId;
  methods: AgentAuthMethod[];
}

export type AgentAuthDecision =
  | { type: "agent"; methodId: string }
  | { type: "completed" }
  | { type: "cancelled" };
