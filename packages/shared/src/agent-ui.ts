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

export interface AgentUiCommand {
  name: string;
  description: string;
  inputHint?: string;
}

export interface AgentUiPromptCapabilities {
  image: boolean;
  audio: boolean;
  embeddedContext: boolean;
}

export interface AgentUiAttachment {
  id: string;
  kind: "image" | "file";
  name: string;
  mimeType: string;
  size: number;
  /** Base64 payload for images and binary files. */
  data?: string;
  /** Decoded text for text files. */
  text?: string;
}

export interface AgentUiAttachmentSummary {
  name: string;
  kind: "image" | "file";
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
      attachments?: AgentUiAttachmentSummary[];
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

export interface AgentUiChangeFile {
  path: string;
  kind: "created" | "modified" | "deleted";
  additions: number;
  deletions: number;
}

export interface AgentUiTurnSummary {
  id: string;
  threadId: string;
  threadTitle: string;
  createdAt: number;
  prompt: string;
  changes: AgentUiChangeFile[];
}

export interface AgentUiThreadSummary {
  id: string;
  title: string;
  agentId: AgentUiAgentId;
  createdAt: number;
  updatedAt: number;
  sessionId?: string;
  remoteOnly?: boolean;
}

export interface AgentUiSnapshot {
  revision: number;
  threadId: string;
  agentId: AgentUiAgentId;
  agentLabel: string;
  phase: AgentUiPhase;
  title: string;
  entries: AgentUiEntry[];
  configOptions: AgentUiConfigOption[];
  availableCommands: AgentUiCommand[];
  promptCapabilities: AgentUiPromptCapabilities;
  currentModel?: string;
  visibleModels?: string[];
  authMethods: AgentUiAuthMethod[];
  threads: AgentUiThreadSummary[];
  turns: AgentUiTurnSummary[];
  context?: AgentUiContext;
  error?: string;
}

export type AgentHostToWebviewMessage = {
  type: "agentSnapshot";
  snapshot: AgentUiSnapshot;
};

export type AgentWebviewToHostMessage =
  | { type: "agentWebviewReady" }
  | { type: "agentSend"; text: string; attachments?: AgentUiAttachment[] }
  | { type: "agentCancel" }
  | { type: "agentNewThread" }
  | { type: "agentOpenThread"; threadId: string }
  | { type: "agentDeleteThread"; threadId: string }
  | { type: "agentSelectAgent"; agentId: AgentUiAgentId }
  | {
      type: "agentSelectConfig";
      configId: string;
      value: string;
    }
  | {
      type: "agentSetVisibleModels";
      values: string[] | null;
    }
  | {
      type: "agentResolvePermission";
      permissionId: string;
      optionId?: string;
    }
  | { type: "agentAuthenticate"; methodId?: string }
  | { type: "agentOpenDiff"; turnId: string; path: string }
  | { type: "agentOpenTurnDiffs"; turnId: string }
  | { type: "agentRestoreTurn"; turnId: string }
  | { type: "agentOpenLocation"; path: string; line?: number }
  | { type: "agentOpenSettings" };
