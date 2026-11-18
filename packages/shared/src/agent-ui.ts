export type AgentUiAgentId = "opencode" | "codex";

export type AgentUiPhase =
  | "idle"
  | "starting"
  | "ready"
  | "running"
  | "waiting_permission"
  | "authentication_required"
  | "failed";

export interface AgentUiLocation {
  path: string;
  line?: number;
}

export interface AgentUiOption {
  id: string;
  label: string;
  kind?: string;
}

export interface AgentUiConfigOption {
  id: string;
  name: string;
  category?: string;
  currentValue?: string;
  options: Array<{ value: string; label: string }>;
}

export interface AgentUiAuthMethod {
  id: string;
  label: string;
  description?: string;
  type: "agent" | "terminal";
  args?: string[];
  env?: Record<string, string>;
}

export interface AgentUiContext {
  label: string;
  uri?: string;
  line?: number;
  character?: number;
  selectedText?: string;
}

export type AgentUiEntry =
  | {
      type: "user";
      id: string;
      at: number;
      text: string;
      contextLabel?: string;
    }
  | {
      type: "assistant";
      id: string;
      at: number;
      text: string;
      streaming?: boolean;
    }
  | {
      type: "thinking";
      id: string;
      at: number;
      text: string;
      streaming?: boolean;
    }
  | {
      type: "tool";
      id: string;
      at: number;
      toolCallId: string;
      title?: string;
      name?: string;
      kind?: string;
      status?: string;
      locations?: AgentUiLocation[];
    }
  | {
      type: "notice";
      id: string;
      at: number;
      severity?: string;
      text: string;
    }
  | {
      type: "permission";
      id: string;
      at: number;
      toolCallId?: string;
      title: string;
      locations?: AgentUiLocation[];
      options: AgentUiOption[];
      resolvedOptionId?: string;
    }
  | {
      type: "error";
      id: string;
      at: number;
      text: string;
    };

export interface AgentUiSnapshot {
  revision: number;
  agentId: AgentUiAgentId;
  agentLabel: string;
  phase: AgentUiPhase;
  title: string;
  entries: AgentUiEntry[];
  configOptions: AgentUiConfigOption[];
  currentModel?: string;
  authMethods: AgentUiAuthMethod[];
  context?: AgentUiContext;
  error?: string;
}

export type AgentHostToWebviewMessage = {
  type: "agentSnapshot";
  snapshot: AgentUiSnapshot;
};

export type AgentWebviewToHostMessage =
  | { type: "agentWebviewReady" }
  | { type: "agentSend"; text: string }
  | { type: "agentCancel" }
  | { type: "agentNewThread" }
  | { type: "agentSelectAgent"; agentId: AgentUiAgentId }
  | {
      type: "agentSelectConfig";
      configId: string;
      value: string;
    }
  | {
      type: "agentResolvePermission";
      permissionId: string;
      optionId?: string;
    }
  | { type: "agentAuthenticate"; methodId?: string }
  | { type: "agentOpenLocation"; path: string; line?: number }
  | { type: "agentOpenSettings" };
