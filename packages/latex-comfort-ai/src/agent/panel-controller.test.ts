import { describe, expect, it, vi } from "vitest";
import { AgentPanelController, type AgentRuntime } from "./panel-controller";
import type {
  AgentAuthMethod,
  AgentConfigOption,
  AgentPermissionRequest,
  AgentSettings,
} from "./types";

const SETTINGS: AgentSettings = {
  opencodePath: "opencode",
  codexAcpPath: "codex-acp",
  codexPath: "codex",
};

function runtime(overrides: Partial<AgentRuntime> = {}): AgentRuntime {
  return {
    start: vi.fn(async () => ({
      sessionId: "session-1",
      configOptions: [],
      availableCommands: [],
      authMethods: [],
      resumed: false,
      capabilities: {
        list: true,
        load: true,
        resume: true,
        delete: true,
        close: true,
      },
    })),
    prompt: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
    setConfigOption: vi.fn(async () => []),
    dispose: vi.fn(async () => undefined),
    ...overrides,
  };
}

function controller(
  agentRuntime: AgentRuntime,
  overrides: Record<string, unknown> = {},
) {
  const snapshots: unknown[] = [];
  const instance = new AgentPanelController({
    settings: SETTINGS,
    workspaceDirectory: () => "/workspace",
    activeFileDirectory: () => "/workspace/paper",
    createRuntime: vi.fn(async () => agentRuntime),
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    now: () => 100,
    ...overrides,
  });
  return { instance, snapshots };
}

describe("AgentPanelController", () => {
  it("starts one runtime and keeps it across multiple turns", async () => {
    const agentRuntime = runtime();
    const { instance } = controller(agentRuntime);

    await instance.submit("First task");
    await instance.submit("Second task");

    expect(agentRuntime.start).toHaveBeenCalledTimes(1);
    expect(agentRuntime.prompt).toHaveBeenNthCalledWith(1, "First task");
    expect(agentRuntime.prompt).toHaveBeenNthCalledWith(2, "Second task");
    expect(instance.snapshot().entries.map((entry) => entry.type)).toEqual([
      "user",
      "user",
    ]);
    expect(instance.snapshot().phase).toBe("ready");
  });

  it("waits for an inline permission decision before continuing", async () => {
    let resolvePrompt!: () => void;
    const agentRuntime = runtime();
    const createRuntime = vi.fn(
      async (deps: {
        requestPermission(request: AgentPermissionRequest): Promise<string | undefined>;
      }) => ({
        ...agentRuntime,
        prompt: vi.fn(async () => {
          const selected = await deps.requestPermission({
            toolCallId: "tool-1",
            title: "Edit main.tex",
            locations: [{ path: "/workspace/main.tex", line: 8 }],
            options: [
              { id: "allow", label: "Allow once", kind: "allow_once" },
              { id: "reject", label: "Reject", kind: "reject_once" },
            ],
          });
          expect(selected).toBe("allow");
          await new Promise<void>((resolve) => {
            resolvePrompt = resolve;
          });
        }),
      }),
    );
    const { instance } = controller(agentRuntime, { createRuntime });

    const running = instance.submit("Edit the section");
    await vi.waitFor(() => {
      expect(instance.snapshot().phase).toBe("waiting_permission");
    });

    const entry = instance.snapshot().entries.find(
      (candidate) => candidate.type === "permission",
    );
    expect(entry).toBeDefined();
    if (!entry || entry.type !== "permission") throw new Error("missing permission");

    instance.resolvePermission(entry.id, "allow");
    await vi.waitFor(() => {
      expect(instance.snapshot().phase).toBe("running");
    });
    resolvePrompt();
    await running;

    expect(instance.snapshot().phase).toBe("ready");
  });

  it("surfaces advertised authentication methods and resumes the turn", async () => {
    const agentRuntime = runtime();
    const createRuntime = vi.fn(
      async (deps: {
        authenticate(request: {
          agentId: string;
          methods: Array<{ id: string; label: string; type: "agent" | "terminal" }>;
        }): Promise<unknown>;
      }) => ({
        ...agentRuntime,
        prompt: vi.fn(async () => {
          const decision = await deps.authenticate({
            agentId: "opencode",
            methods: [
              {
                id: "login",
                label: "Sign in with OpenCode",
                type: "agent",
              },
            ],
          });
          expect(decision).toEqual({ type: "agent", methodId: "login" });
        }),
      }),
    );
    const { instance } = controller(agentRuntime, { createRuntime });

    const running = instance.submit("Start");
    await vi.waitFor(() => {
      expect(instance.snapshot().phase).toBe("authentication_required");
    });
    expect(instance.snapshot().authMethods).toEqual([
      { id: "login", label: "Sign in with OpenCode", type: "agent" },
    ]);

    await instance.authenticate("login");
    await running;

    expect(instance.snapshot().phase).toBe("ready");
  });

  it("keeps the selected model across a new thread", async () => {
    const first = runtime({
      start: vi.fn(async () => ({
        sessionId: "session-model",
        resumed: false,
        capabilities: {
          list: true,
          load: true,
          resume: true,
          delete: true,
          close: true,
        },
        configOptions: [
          {
            id: "model",
            name: "Model",
            category: "model",
            currentValue: "provider/one",
            options: [
              { value: "provider/one", label: "One" },
              { value: "provider/two", label: "Two" },
            ],
          },
        ] satisfies AgentConfigOption[],
        availableCommands: [],
        authMethods: [] satisfies AgentAuthMethod[],
      })),
      setConfigOption: vi.fn(async () => [
        {
          id: "model",
          name: "Model",
          category: "model",
          currentValue: "provider/two",
          options: [
            { value: "provider/one", label: "One" },
            { value: "provider/two", label: "Two" },
          ],
        },
      ]),
    });
    const createRuntime = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(runtime());
    const { instance } = controller(first, { createRuntime });

    await instance.submit("Use the normal model");
    await instance.selectConfig("model", "provider/two");
    expect(instance.snapshot().currentModel).toBe("provider/two");

    await instance.newThread();
    expect(instance.snapshot().entries).toEqual([]);
    expect(instance.snapshot().currentModel).toBe("provider/two");
    await vi.waitFor(() => expect(createRuntime).toHaveBeenCalledTimes(2));
  });
});
