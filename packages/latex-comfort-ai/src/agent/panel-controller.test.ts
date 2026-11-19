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
      promptCapabilities: {
        image: false,
        audio: false,
        embeddedContext: false,
      },
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

  it("auto-approves every edit in full access without a permission card", async () => {
    const agentRuntime = runtime();
    let selected: string | undefined;
    const createRuntime = vi.fn(
      async (deps: {
        requestPermission(request: AgentPermissionRequest): Promise<string | undefined>;
      }) => ({
        ...agentRuntime,
        prompt: vi.fn(async () => {
          selected = await deps.requestPermission({
            toolCallId: "tool-1",
            toolKind: "edit",
            title: "Edit main.tex",
            diffs: [
              { path: "/workspace/main.tex", oldText: "old\n", newText: "new\n" },
            ],
            options: [
              { id: "allow", label: "Allow once", kind: "allow_once" },
              { id: "reject", label: "Reject", kind: "reject_once" },
            ],
          });
        }),
      }),
    );
    const { instance } = controller(agentRuntime, {
      createRuntime,
      initialApprovalMode: "full-access",
    });

    await instance.submit("Edit the section");

    expect(selected).toBe("allow");
    const entry = instance.snapshot().entries.find(
      (candidate) => candidate.type === "permission",
    );
    expect(entry?.type).toBe("permission");
    if (entry?.type === "permission") {
      expect(entry.autoResolved).toBe(true);
      expect(entry.diffs?.[0]?.path).toBe("/workspace/main.tex");
    }
  });

  it("auto-allows workspace edits but asks outside it in auto mode", async () => {
    let inside = "";
    let outside = "";
    const agentRuntime = runtime();
    const createRuntime = vi.fn(
      async (deps: {
        requestPermission(request: AgentPermissionRequest): Promise<string | undefined>;
      }) => ({
        ...agentRuntime,
        prompt: vi.fn(async () => {
          const options = [
            { id: "allow", label: "Allow once", kind: "allow_once" },
            { id: "reject", label: "Reject", kind: "reject_once" },
          ];
          inside =
            (await deps.requestPermission({
              toolKind: "edit",
              title: "Edit inside",
              diffs: [
                { path: "/workspace/main.tex", oldText: "a\n", newText: "b\n" },
              ],
              options,
            })) ?? "";
          outside =
            (await deps.requestPermission({
              toolKind: "edit",
              title: "Edit outside",
              diffs: [
                { path: "/outside/main.tex", oldText: "a\n", newText: "b\n" },
              ],
              options,
            })) ?? "";
        }),
      }),
    );
    const { instance } = controller(agentRuntime, {
      createRuntime,
      initialApprovalMode: "auto",
    });

    const running = instance.submit("Edit");
    await vi.waitFor(() => {
      expect(instance.snapshot().phase).toBe("waiting_permission");
    });
    const pending = instance
      .snapshot()
      .entries.find(
        (entry) => entry.type === "permission" && !entry.resolvedOptionId,
      );
    if (!pending) throw new Error("missing pending permission");
    instance.resolvePermission(pending.id, "allow");
    await running;

    expect(inside).toBe("allow");
    expect(outside).toBe("allow");
    expect(
      instance
        .snapshot()
        .entries.filter((entry) => entry.type === "permission")
        .map((entry) => entry.type === "permission" && entry.autoResolved),
    ).toEqual([true, undefined]);
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
        promptCapabilities: {
          image: false,
          audio: false,
          embeddedContext: false,
        },
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

  it("settles streaming blocks when the agent turn fails", async () => {
    const agentRuntime = runtime();
    const createRuntime = vi.fn(
      async (deps: { onEvent(event: { type: "thinking"; messageId: string; text: string }): void }) => ({
        ...agentRuntime,
        prompt: vi.fn(async () => {
          deps.onEvent({
            type: "thinking",
            messageId: "message-1:reasoning:0",
            text: "Working",
          });
          throw new Error("Agent crashed");
        }),
      }),
    );
    const { instance } = controller(agentRuntime, { createRuntime });

    await instance.submit("Do the task");

    expect(instance.snapshot().phase).toBe("failed");
    expect(
      instance.snapshot().entries.flatMap((entry) =>
        entry.type === "thinking" || entry.type === "assistant"
          ? [entry.streaming]
          : [],
      ),
    ).toEqual([false]);
  });
});
