import type {
  AgentUiApprovalMode,
  AgentUiAttachment,
} from "@latex-comfort/shared";

export type AgentId = "opencode" | "codex";

export type AgentApprovalMode = AgentUiApprovalMode;

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

export interface AgentToolLocation {
  path: string;
  line?: number;
}

export type AgentToolKind =
  | "read"
  | "edit"
  | "delete"
  | "move"
  | "search"
  | "execute"
  | "think"
  | "fetch"
  | "switch_mode"
  | "other";

export interface AgentProposedDiff {
  path: string;
  oldText?: string;
  newText: string;
}

export interface AgentConfigOption {
  id: string;
  name: string;
  category?: string;
  currentValue?: string;
  options: AgentModelOption[];
}

export interface AgentCommand {
  name: string;
  description: string;
  inputHint?: string;
}

export type AgentEvent =
  | { type: "user"; messageId?: string; text: string }
  | { type: "text"; messageId?: string; text: string }
  | { type: "thinking"; messageId?: string; text: string }
  | {
      type: "tool";
      toolCallId: string;
      title?: string;
      name?: string;
      kind?: string;
      status?: string;
      locations?: AgentToolLocation[];
      output?: string;
    }
  | { type: "notice"; severity?: string; message: string }
  | { type: "config"; options: AgentConfigOption[] }
  | { type: "commands"; commands: AgentCommand[] };

export interface AgentRunRequest {
  definition: AgentDefinition;
  cwd: string;
  prompt: string;
  attachments?: AgentUiAttachment[];
  onEvent(event: AgentEvent): void;
  requestPermission(request: AgentPermissionRequest): Promise<string | undefined>;
  selectModel?(selection: AgentModelSelection): Promise<string | undefined>;
  authenticate?(request: AgentAuthRequest): Promise<AgentAuthDecision>;
  signal?: AbortSignal;
}

export interface AgentPermissionRequest {
  toolCallId?: string;
  toolKind?: AgentToolKind;
  title: string;
  locations?: AgentToolLocation[];
  diffs?: AgentProposedDiff[];
  options: AgentPermissionOption[];
}

export interface AgentPermissionOption {
  id: string;
  label: string;
  kind?: string;
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
