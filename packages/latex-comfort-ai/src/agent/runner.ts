import { runAcpSession } from "./acp-session";
import { spawnAcpProcess } from "./process";
import type { AgentRunRequest } from "./types";

function abortError(): Error {
  const error = new Error("The agent run was cancelled.");
  error.name = "AbortError";
  return error;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export async function runAcpAgent(request: AgentRunRequest): Promise<void> {
  if (request.signal?.aborted) throw abortError();

  const process = await spawnAcpProcess(request.definition, request.cwd);
  const cancel = () => {
    void process.stop();
  };
  request.signal?.addEventListener("abort", cancel, { once: true });

  try {
    await runAcpSession({
      target: process.target,
      agentId: request.definition.id,
      cwd: request.cwd,
      prompt: request.prompt,
      onEvent: request.onEvent,
      requestPermission: request.requestPermission,
      ...(request.selectModel ? { selectModel: request.selectModel } : {}),
      ...(request.authenticate ? { authenticate: request.authenticate } : {}),
      ...(request.signal ? { signal: request.signal } : {}),
    });
  } catch (error) {
    if (request.signal?.aborted || isAbortError(error)) throw abortError();
    throw process.failure(error);
  } finally {
    request.signal?.removeEventListener("abort", cancel);
    await process.stop();
  }
}
