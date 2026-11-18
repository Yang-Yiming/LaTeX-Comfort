import type {
  AgentUiAgentId,
  AgentUiChangeFile,
  AgentUiEntry,
  AgentUiThreadSummary,
  AgentUiTurnSummary,
} from "@latex-comfort/shared";

export interface StoredAgentThread {
  id: string;
  agentId: AgentUiAgentId;
  workspacePath: string;
  sessionId?: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  model?: string;
  entries: AgentUiEntry[];
  turns: AgentUiTurnSummary[];
}

export interface AgentRemoteSession {
  sessionId: string;
  title?: string;
  updatedAt?: string;
}

export interface AgentThreadRepository {
  list(workspacePath: string): Promise<AgentUiThreadSummary[]>;
  load(threadId: string): Promise<StoredAgentThread | undefined>;
  save(thread: StoredAgentThread): Promise<void>;
  delete(threadId: string): Promise<void>;
}

export interface AgentWorkspaceSnapshot {
  root: string;
  files: Record<string, string>;
}

export interface AgentRestoreResult {
  restored: number;
  skipped: string[];
}

export interface AgentTurnCheckpointService {
  capture(workspaceRoot: string): Promise<AgentWorkspaceSnapshot>;
  complete(
    turnId: string,
    before: AgentWorkspaceSnapshot,
  ): Promise<AgentUiChangeFile[]>;
  openDiff(turnId: string, path: string): Promise<void>;
  restoreTurn(turnId: string): Promise<AgentRestoreResult>;
}
