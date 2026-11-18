import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentUiThreadSummary } from "@latex-comfort/shared";
import type {
  AgentThreadRepository,
  StoredAgentThread,
} from "./history-types";

const THREAD_ID = /^[A-Za-z0-9][A-Za-z0-9-]*$/;

export class AgentThreadStore implements AgentThreadRepository {
  private readonly directory: string;

  constructor(storageRoot: string) {
    this.directory = path.join(storageRoot, "agent-threads");
  }

  async list(workspacePath: string): Promise<AgentUiThreadSummary[]> {
    await mkdir(this.directory, { recursive: true });
    const entries = await readdir(this.directory, { withFileTypes: true });
    const threads: AgentUiThreadSummary[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const thread = await this.load(entry.name.slice(0, -5)).catch(
        () => undefined,
      );
      if (!thread || thread.workspacePath !== workspacePath) continue;
      threads.push({
        id: thread.id,
        title: thread.title,
        agentId: thread.agentId,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
        ...(thread.sessionId ? { sessionId: thread.sessionId } : {}),
      });
    }
    return threads.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async load(threadId: string): Promise<StoredAgentThread | undefined> {
    if (!THREAD_ID.test(threadId)) return undefined;
    try {
      const raw = await readFile(this.file(threadId), "utf8");
      const value = JSON.parse(raw) as unknown;
      return isStoredThread(value) ? value : undefined;
    } catch {
      return undefined;
    }
  }

  async save(thread: StoredAgentThread): Promise<void> {
    if (!THREAD_ID.test(thread.id)) {
      throw new Error("Invalid agent thread id.");
    }
    await mkdir(this.directory, { recursive: true });
    const target = this.file(thread.id);
    const temporary = `${target}.tmp`;
    await writeFile(temporary, `${JSON.stringify(thread, null, 2)}\n`, "utf8");
    await rename(temporary, target);
  }

  async delete(threadId: string): Promise<void> {
    if (!THREAD_ID.test(threadId)) return;
    await unlink(this.file(threadId)).catch(() => undefined);
  }

  private file(threadId: string): string {
    return path.join(this.directory, `${threadId}.json`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStoredThread(value: unknown): value is StoredAgentThread {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    THREAD_ID.test(value.id) &&
    (value.agentId === "opencode" || value.agentId === "codex") &&
    typeof value.workspacePath === "string" &&
    (value.sessionId === undefined || typeof value.sessionId === "string") &&
    typeof value.title === "string" &&
    typeof value.createdAt === "number" &&
    typeof value.updatedAt === "number" &&
    (value.model === undefined || typeof value.model === "string") &&
    Array.isArray(value.entries) &&
    Array.isArray(value.turns)
  );
}
