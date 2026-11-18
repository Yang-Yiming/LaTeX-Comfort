import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
import type { AgentDefinition } from "./types";

const STDERR_LIMIT = 8 * 1024;
const STOP_GRACE_MS = 2_000;

export interface AcpProcess {
  target: acp.Stream;
  failure(error: unknown): Error;
  stop(): Promise<void>;
}

function appendStderr(current: string, chunk: Buffer | string): string {
  const next = current + chunk.toString();
  return next.length <= STDERR_LIMIT
    ? next
    : next.slice(next.length - STDERR_LIMIT);
}

function signalProcessTree(
  child: ChildProcessWithoutNullStreams,
  signal: NodeJS.Signals,
): void {
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

async function stopChild(
  child: ChildProcessWithoutNullStreams,
): Promise<void> {
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

export async function spawnAcpProcess(
  definition: AgentDefinition,
  cwd: string,
): Promise<AcpProcess> {
  const child = spawn(definition.command, definition.args, {
    cwd,
    env: { ...process.env, ...definition.env },
    stdio: ["pipe", "pipe", "pipe"],
    shell: false,
    detached: process.platform !== "win32",
  });

  let stderr = "";
  child.stderr.on("data", (chunk: Buffer | string) => {
    stderr = appendStderr(stderr, chunk);
  });

  await new Promise<void>((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  }).catch((error: unknown) => {
    throw failureMessage(definition, error, stderr);
  });

  return {
    target: acp.ndJsonStream(
      Writable.toWeb(child.stdin),
      Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
    ),
    failure: (error) => failureMessage(definition, error, stderr),
    stop: () => stopChild(child),
  };
}

function failureMessage(
  definition: AgentDefinition,
  error: unknown,
  stderr: string,
): Error {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : undefined;
  const base =
    code === "ENOENT"
      ? definition.missingCommandMessage
      : error instanceof Error
        ? error.message
        : String(error);
  const detail = stderr.trim();
  return new Error(detail ? `${base}\n\nAgent stderr:\n${detail}` : base);
}
