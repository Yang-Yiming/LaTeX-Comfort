import type { AgentRuntime, AgentRuntimeDependencies } from "./panel-controller";
import { InteractiveAcpSession } from "./interactive-session";
import { spawnAcpProcess } from "./process";

export async function createInteractiveRuntime(
  dependencies: AgentRuntimeDependencies,
): Promise<AgentRuntime> {
  const process = await spawnAcpProcess(
    dependencies.definition,
    dependencies.cwd,
  );
  const session = new InteractiveAcpSession({
    target: process.target,
    agentId: dependencies.definition.id,
    cwd: dependencies.cwd,
    onEvent: dependencies.onEvent,
    requestPermission: dependencies.requestPermission,
    authenticate: dependencies.authenticate,
    ...(dependencies.preferredModel
      ? { preferredModel: dependencies.preferredModel }
      : {}),
    ...(dependencies.resumeSessionId
      ? { resumeSessionId: dependencies.resumeSessionId }
      : {}),
    ...(dependencies.replayHistory ? { replayHistory: true } : {}),
  });

  return {
    start: async () => {
      try {
        return await session.start();
      } catch (error) {
        await session.dispose().catch(() => undefined);
        await process.stop().catch(() => undefined);
        throw process.failure(error);
      }
    },
    prompt: async (prompt, attachments = []) => {
      try {
        await session.prompt(prompt, attachments);
      } catch (error) {
        throw process.failure(error);
      }
    },
    cancel: () => session.cancel(),
    setConfigOption: (configId, value) =>
      session.setConfigOption(configId, value),
    listSessions: () => session.listSessions(),
    deleteSession: (sessionId) => session.deleteSession(sessionId),
    dispose: async () => {
      await session.dispose();
      await process.stop();
    },
  };
}
