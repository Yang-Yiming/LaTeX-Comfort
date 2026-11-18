import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
import { runAcpSession } from "./acp-session";
import type { AgentRunRequest } from "./types";

const STDERR_LIMIT = 8 * 1024;
const STOP_GRACE_MS = 2_000;

function appendStderr(current: string, chunk: Buffer | string): string {
  const next = current + chunk.toString();
  return next.length <= STDERR_LIMIT ? next : next.slice(next.length - STDERR_LIMIT);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function signalProcessTree(child: ChildProcessWithoutNullStreams, signal: NodeJS.Signals) {
  if (process.platform === "win32") {
    child.kill(signal);
    return;
  }
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

async function stopChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  signalProcessTree(child, "SIGTERM");
  const exited = once(child, "exit").then(() => true).catch(() => true);
  const timedOut = new Promise<false>((resolve) => {
    setTimeout(() => resolve(false), STOP_GRACE_MS).unref();
  });
  if (await Promise.race([exited, timedOut])) return;
  signalProcessTree(child, "SIGKILL");
  await once(child, "exit").catch(() => undefined);
}

function failureMessage(request: AgentRunRequest, error: unknown, stderr: string): Error {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : undefined;
  const base =
    code === "ENOENT"
      ? request.definition.missingCommandMessage
      : error instanceof Error
        ? error.message
        : String(error);
  const detail = stderr.trim();
  return new Error(detail ? `${base}\n\nAgent stderr:\n${detail}` : base);
}

export async function runAcpAgent(request: AgentRunRequest): Promise<void> {
  if (request.signal?.aborted) {
    const error = new Error("The agent run was cancelled.");
    error.name = "AbortError";
    throw error;
  }

  const child = spawn(request.definition.command, request.definition.args, {
    cwd: request.cwd,
    env: { ...process.env, ...request.definition.env },
    stdio: ["pipe", "pipe", "pipe"],
    shell: false,
    detached: process.platform !== "win32",
  });

  let stderr = "";
  child.stderr.on("data", (chunk: Buffer | string) => {
    stderr = appendStderr(stderr, chunk);
  });

  const spawned = new Promise<void>((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });

  const cancel = () => {
    void stopChild(child);
  };
  request.signal?.addEventListener("abort", cancel, { once: true });

  try {
    await spawned;
    await runAcpSession({
      target: acp.ndJsonStream(
        Writable.toWeb(child.stdin),
        Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
      ),
      cwd: request.cwd,
      prompt: request.prompt,
      onEvent: request.onEvent,
      requestPermission: request.requestPermission,
      ...(request.signal ? { signal: request.signal } : {}),
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw failureMessage(request, error, stderr);
  } finally {
    request.signal?.removeEventListener("abort", cancel);
    await stopChild(child);
  }
}
