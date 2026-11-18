import { randomUUID } from "node:crypto";
import type {
  AgentUiAuthMethod,
  AgentUiChangeFile,
  AgentUiConfigOption,
  AgentUiContext,
  AgentUiEntry,
  AgentUiSnapshot,
  AgentUiThreadSummary,
  AgentUiTurnSummary,
} from "@latex-comfort/shared";
import { getAgentDefinition } from "./definitions";
import {
  addPermission,
  appendUserMessage,
  createAgentPanelState,
  finishTurn,
  reduceAgentEvent,
  resolvePermission,
  setPhase,
  type AgentPanelState,
} from "./panel-state";
import type {
  AgentRemoteSession,
  AgentThreadRepository,
  AgentTurnCheckpointService,
  AgentWorkspaceSnapshot,
  StoredAgentThread,
} from "./history-types";
import type {
  AgentAuthDecision,
  AgentAuthRequest,
  AgentConfigOption,
  AgentDefinition,
  AgentEvent,
  AgentId,
  AgentPermissionRequest,
  AgentSettings,
} from "./types";

export interface AgentRuntime {
  start(): Promise<{
    sessionId: string;
    configOptions: AgentConfigOption[];
    authMethods: AgentUiAuthMethod[];
    resumed: boolean;
    capabilities: {
      list: boolean;
      load: boolean;
      resume: boolean;
      delete: boolean;
      close: boolean;
    };
  }>;
  prompt(prompt: string): Promise<void>;
  cancel(): Promise<void>;
  setConfigOption(
    configId: string,
    value: string,
  ): Promise<AgentConfigOption[]>;
  dispose(): Promise<void>;
  listSessions?(): Promise<AgentRemoteSession[]>;
  deleteSession?(sessionId: string): Promise<void>;
}

export interface AgentRuntimeDependencies {
  definition: AgentDefinition;
  cwd: string;
  preferredModel?: string;
  resumeSessionId?: string;
  replayHistory?: boolean;
  onEvent(event: AgentEvent): void;
  requestPermission(request: AgentPermissionRequest): Promise<string | undefined>;
  authenticate(request: AgentAuthRequest): Promise<AgentAuthDecision>;
}

export interface AgentPanelControllerOptions {
  settings: AgentSettings;
  workspaceDirectory(): string | undefined;
  activeFileDirectory(): string | undefined;
  createRuntime(dependencies: AgentRuntimeDependencies): Promise<AgentRuntime>;
  onSnapshot(snapshot: AgentUiSnapshot): void;
  authenticateTerminal?(
    agentId: AgentId,
    method: AgentUiAuthMethod,
  ): Promise<void>;
  now?: () => number;
  initialAgentId?: AgentId;
  initialModels?: Partial<Record<AgentId, string>>;
  initialVisibleModels?: Partial<Record<AgentId, string[] | null>>;
  onVisibleModelsChanged?(
    agentId: AgentId,
    values: string[] | null,
  ): Promise<void> | void;
  threadStore?: AgentThreadRepository;
  checkpoints?: AgentTurnCheckpointService;
  newThreadId?: () => string;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toUiConfigOptions(options: AgentConfigOption[]): AgentUiConfigOption[] {
  return options;
}

function contextPrompt(context: AgentUiContext | undefined): string {
  if (!context?.selectedText) return "";
  return [
    `Editor context from ${context.label}:`,
    "```text",
    context.selectedText,
    "```",
    "",
    "Task:",
  ].join("\n");
}

function errorEntry(state: AgentPanelState, text: string): AgentUiEntry {
  return {
    type: "error",
    id: `error-${state.revision + 1}`,
    at: state.now(),
    text,
  };
}

export class AgentPanelController {
  private agentId: AgentId;
  private state: AgentPanelState;
  private runtime: AgentRuntime | undefined;
  private starting: Promise<AgentRuntime> | undefined;
  private readonly selectedModels = new Map<AgentId, string>();
  private readonly visibleModels = new Map<AgentId, Set<string>>();
  private threadId: string;
  private threadCreatedAt: number;
  private threadSessionId: string | undefined;
  private localThreads: AgentUiThreadSummary[] = [];
  private remoteSessions: AgentRemoteSession[] = [];
  private threads: AgentUiThreadSummary[] = [];
  private turns: AgentUiTurnSummary[] = [];
  private replayHistoryOnStart = false;
  private threadsLoaded = false;
  private pendingTurn:
    | {
        id: string;
        prompt: string;
        createdAt: number;
        before?: AgentWorkspaceSnapshot;
      }
    | undefined;
  private permissionSequence = 0;
  private pendingPermission:
    | {
        resolve(optionId: string | undefined): void;
      }
    | undefined;
  private pendingAuthentication:
    | {
        resolve(decision: AgentAuthDecision): void;
      }
    | undefined;
  private phaseBeforeAuthentication: AgentUiSnapshot["phase"] = "running";

  constructor(private readonly options: AgentPanelControllerOptions) {
    this.agentId = options.initialAgentId ?? "opencode";
    this.threadId = options.newThreadId?.() ?? randomUUID();
    this.threadCreatedAt = options.now?.() ?? Date.now();
    for (const [agentId, model] of Object.entries(options.initialModels ?? {})) {
      if (model) this.selectedModels.set(agentId as AgentId, model);
    }
    for (const [agentId, models] of Object.entries(
      options.initialVisibleModels ?? {},
    )) {
      if (models && models.length > 0) {
        this.visibleModels.set(agentId as AgentId, new Set(models));
      }
    }
    this.state = this.freshState(this.agentId);
  }

  snapshot(): AgentUiSnapshot {
    const {
      nextUserId: _nextUserId,
      fallbackAssistantId: _fallbackAssistantId,
      now: _now,
      ...snapshot
    } = this.state;
    return {
      ...snapshot,
      threadId: this.threadId,
      threads: this.threads,
      turns: this.turns,
    };
  }

  setContext(context: AgentUiContext | undefined): void {
    this.state = {
      ...this.state,
      revision: this.state.revision + 1,
      ...(context ? { context } : { context: undefined }),
    };
    this.emit();
  }

  async selectAgent(agentId: AgentId): Promise<void> {
    if (agentId === this.agentId) return;
    if (this.state.entries.length > 0) {
      throw new Error("Start a new thread before switching agents.");
    }
    await this.stopRuntime();
    this.remoteSessions = [];
    this.resetThread(agentId);
    this.emit();
    void this.prepare();
  }

  async prepare(): Promise<void> {
    await this.loadThreads();
    if (this.runtime || this.starting) return;
    try {
      await this.ensureRuntime();
    } catch (error) {
      if (!isAbortError(error)) this.fail(error, false);
    }
  }

  async submit(text: string): Promise<void> {
    const prompt = text.trim();
    if (!prompt) return;
    if (
      this.state.phase === "running" ||
      this.state.phase === "waiting_permission" ||
      this.state.phase === "authentication_required"
    ) {
      throw new Error("The agent is already running.");
    }

    const context = this.state.context;
    if (this.state.title === "New thread") {
      this.state = {
        ...this.state,
        title: prompt.replace(/\s+/g, " ").slice(0, 72),
        revision: this.state.revision + 1,
      };
    }
    this.state = appendUserMessage(
      this.state,
      prompt,
      context?.label,
    );
    this.state = setPhase(this.state, "running");
    this.emit();
    void this.persistThread();

    const turnId = randomUUID();
    const turnCreatedAt = this.options.now?.() ?? Date.now();
    const root = this.options.workspaceDirectory();
    let before: AgentWorkspaceSnapshot | undefined;
    if (root && this.options.checkpoints) {
      before = await this.options.checkpoints
        .capture(root)
        .catch(() => undefined);
    }
    this.pendingTurn = {
      id: turnId,
      prompt,
      createdAt: turnCreatedAt,
      ...(before ? { before } : {}),
    };

    try {
      const runtime = await this.ensureRuntime();
      this.state = setPhase(this.state, "running");
      this.emit();
      await runtime.prompt(`${contextPrompt(context)}${prompt}`);
      this.state = finishTurn(this.state);
      this.emit();
      await this.recordPendingTurn();
    } catch (error) {
      if (this.state.phase === "failed") {
        await this.recordPendingTurn();
        return;
      }
      if (isAbortError(error)) {
        this.state = reduceAgentEvent(this.state, {
          type: "notice",
          message: "Stopped.",
        });
        this.state = finishTurn(this.state);
        this.emit();
        await this.recordPendingTurn();
        return;
      }
      this.fail(error);
      await this.recordPendingTurn();
    }
  }

  async cancel(): Promise<void> {
    this.pendingPermission?.resolve(undefined);
    this.pendingPermission = undefined;
    this.pendingAuthentication?.resolve({ type: "cancelled" });
    this.pendingAuthentication = undefined;
    await this.runtime?.cancel().catch(() => undefined);
  }

  resolvePermission(permissionId: string, optionId?: string): void {
    const pending = this.pendingPermission;
    if (!pending) return;
    this.pendingPermission = undefined;
    this.state = resolvePermission(this.state, permissionId, optionId);
    this.emit();
    pending.resolve(optionId);
  }

  async authenticate(methodId?: string): Promise<void> {
    const pending = this.pendingAuthentication;
    if (!pending) return;
    const method = this.state.authMethods.find(
      (candidate) => candidate.id === methodId,
    );
    if (!method) return;

    this.pendingAuthentication = undefined;
    if (method.type === "terminal") {
      if (!this.options.authenticateTerminal) {
        this.fail(
          new Error(
            "This agent needs terminal authentication, but the terminal integration is unavailable.",
          ),
        );
        pending.resolve({ type: "cancelled" });
        return;
      }
      this.state = setPhase(this.state, "starting");
      this.emit();
      try {
        await this.options.authenticateTerminal(this.agentId, method);
        this.state = setPhase(this.state, this.phaseBeforeAuthentication);
        this.emit();
        pending.resolve({ type: "completed" });
      } catch (error) {
        this.fail(error);
        pending.resolve({ type: "cancelled" });
      }
      return;
    }

    this.state = setPhase(this.state, this.phaseBeforeAuthentication);
    this.emit();
    pending.resolve({ type: "agent", methodId: method.id });
  }

  async setVisibleModels(values: string[] | null): Promise<void> {
    if (values === null) {
      this.visibleModels.delete(this.agentId);
    } else {
      const unique = [...new Set(values)];
      if (unique.length === 0) return;
      this.visibleModels.set(this.agentId, new Set(unique));
    }

    const model = this.state.configOptions.find(
      (option) => option.id === "model" || option.category === "model",
    );
    const visible = this.visibleModels.get(this.agentId);
    const current = model?.currentValue;
    let next = current;
    if (model && visible && current && !visible.has(current)) {
      next = model.options.find((option) => visible.has(option.value))?.value;
    }

    if (model && next && next !== current && this.runtime) {
      const options = await this.runtime.setConfigOption(model.id, next);
      this.selectedModels.set(this.agentId, next);
      this.state = reduceAgentEvent(this.state, {
        type: "config",
        options,
      });
    }

    this.state = {
      ...this.state,
      revision: this.state.revision + 1,
      ...(visible ? { visibleModels: [...visible] } : { visibleModels: undefined }),
      ...(next ? { currentModel: next } : {}),
    };
    this.emit();
    await this.options.onVisibleModelsChanged?.(
      this.agentId,
      visible ? [...visible] : null,
    );
  }

  async selectConfig(configId: string, value: string): Promise<void> {
    const runtime = this.runtime;
    if (!runtime) return;
    const options = await runtime.setConfigOption(configId, value);
    const model = options.find(
      (option) => option.id === "model" || option.category === "model",
    );
    if (model?.currentValue) {
      this.selectedModels.set(this.agentId, model.currentValue);
    }
    this.state = reduceAgentEvent(this.state, {
      type: "config",
      options,
    });
    this.emit();
  }

  async newThread(): Promise<void> {
    await this.stopRuntime();
    this.resetThread(this.agentId);
    this.emit();
    void this.prepare();
  }

  async openThread(threadId: string): Promise<void> {
    if (threadId === this.threadId) return;
    const remote = threadId.startsWith("remote:")
      ? this.remoteSessions.find(
          (session) => session.sessionId === threadId.slice(7),
        )
      : undefined;
    const thread = remote
      ? undefined
      : await this.options.threadStore?.load(threadId);
    if (!remote && !thread) return;
    await this.stopRuntime();
    if (thread) {
      this.agentId = thread.agentId;
      this.threadId = thread.id;
      this.threadCreatedAt = thread.createdAt;
      this.threadSessionId = thread.sessionId;
      this.turns = thread.turns;
      this.state = {
        ...this.freshState(thread.agentId),
        title: thread.title,
        entries: thread.entries,
        ...(thread.model ? { currentModel: thread.model } : {}),
      };
    } else if (remote) {
      const updatedAt = remote.updatedAt
        ? Date.parse(remote.updatedAt) || Date.now()
        : Date.now();
      this.threadId = threadId;
      this.threadCreatedAt = updatedAt;
      this.threadSessionId = remote.sessionId;
      this.turns = [];
      this.state = {
        ...this.freshState(this.agentId),
        title: remote.title?.trim() || "Remote agent session",
        entries: [],
      };
      this.replayHistoryOnStart = true;
    }
    this.emit();
    void this.prepare();
  }

  async deleteThread(threadId: string): Promise<void> {
    if (threadId.startsWith("remote:")) {
      const sessionId = threadId.slice(7);
      await this.runtime?.deleteSession?.(sessionId).catch(() => undefined);
      this.remoteSessions = this.remoteSessions.filter(
        (session) => session.sessionId !== sessionId,
      );
      this.rebuildThreads();
      this.emit();
      return;
    }
    await this.options.threadStore?.delete(threadId);
    if (threadId === this.threadId) {
      await this.newThread();
    }
    await this.loadThreads(true);
    this.emit();
  }

  async openDiff(turnId: string, filePath: string): Promise<void> {
    await this.options.checkpoints?.openDiff(turnId, filePath);
  }

  async openTurnDiffs(turnId: string): Promise<void> {
    const turn = this.turns.find((candidate) => candidate.id === turnId);
    if (!turn) return;
    for (const file of turn.changes.slice(0, 10)) {
      await this.options.checkpoints?.openDiff(turnId, file.path);
    }
  }

  async restoreTurn(turnId: string) {
    return (
      (await this.options.checkpoints?.restoreTurn(turnId)) ?? {
        restored: 0,
        skipped: [],
      }
    );
  }

  async releaseIdleSession(): Promise<void> {
    if (
      this.state.entries.length > 0 ||
      this.state.phase === "running" ||
      this.state.phase === "waiting_permission"
    ) {
      return;
    }
    await this.stopRuntime();
  }

  async dispose(): Promise<void> {
    await this.stopRuntime();
  }

  private async recordPendingTurn(): Promise<void> {
    const pending = this.pendingTurn;
    this.pendingTurn = undefined;
    if (!pending) {
      await this.persistThread();
      return;
    }
    let changes: AgentUiChangeFile[] = [];
    if (pending.before && this.options.checkpoints) {
      changes = await this.options.checkpoints
        .complete(pending.id, pending.before)
        .catch(() => []);
    }
    const turn: AgentUiTurnSummary = {
      id: pending.id,
      threadId: this.threadId,
      threadTitle: this.state.title,
      createdAt: pending.createdAt,
      prompt: pending.prompt,
      changes,
    };
    this.turns = [turn, ...this.turns.filter((item) => item.id !== turn.id)];
    this.emit();
    await this.persistThread();
  }

  private async persistThread(): Promise<void> {
    const store = this.options.threadStore;
    const workspacePath = this.options.workspaceDirectory();
    if (!store || !workspacePath || this.state.entries.length === 0) return;
    const now = this.options.now?.() ?? Date.now();
    const thread: StoredAgentThread = {
      id: this.threadId,
      agentId: this.agentId,
      workspacePath,
      ...(this.threadSessionId ? { sessionId: this.threadSessionId } : {}),
      title: this.state.title,
      createdAt: this.threadCreatedAt,
      updatedAt: now,
      ...(this.state.currentModel ? { model: this.state.currentModel } : {}),
      entries: this.state.entries,
      turns: this.turns,
    };
    await store.save(thread);
    await this.loadThreads(true);
    this.emit();
  }

  private async loadThreads(force = false): Promise<void> {
    if ((this.threadsLoaded && !force) || !this.options.threadStore) return;
    const cwd =
      this.options.workspaceDirectory() ?? this.options.activeFileDirectory();
    if (!cwd) return;
    this.localThreads = await this.options.threadStore.list(cwd);
    this.rebuildThreads();
    this.threadsLoaded = true;
  }

  private async syncRemoteSessions(runtime: AgentRuntime): Promise<void> {
    if (!runtime.listSessions) return;
    try {
      this.remoteSessions = await runtime.listSessions();
      this.rebuildThreads();
      this.emit();
    } catch {
      // Session listing is an enhancement; local history remains usable.
    }
  }

  private rebuildThreads(): void {
    const sessionIds = new Set(
      [
        ...this.localThreads.map((thread) => thread.sessionId),
        this.threadSessionId,
      ].filter((value): value is string => Boolean(value)),
    );
    const remote: AgentUiThreadSummary[] = this.remoteSessions
      .filter((session) => !sessionIds.has(session.sessionId))
      .map((session) => {
        const updatedAt = session.updatedAt
          ? Date.parse(session.updatedAt) || Date.now()
          : Date.now();
        return {
          id: `remote:${session.sessionId}`,
          title: session.title?.trim() || "Remote agent session",
          agentId: this.agentId,
          createdAt: updatedAt,
          updatedAt,
          sessionId: session.sessionId,
          remoteOnly: true,
        };
      });
    this.threads = [...this.localThreads, ...remote].sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
  }

  private resetThread(agentId: AgentId): void {
    const now = this.options.now?.() ?? Date.now();
    this.threadId = this.options.newThreadId?.() ?? randomUUID();
    this.threadCreatedAt = now;
    this.threadSessionId = undefined;
    this.turns = [];
    this.replayHistoryOnStart = false;
    this.agentId = agentId;
    const model = this.selectedModels.get(agentId);
    const previousConfig = this.state.configOptions;
    this.state = {
      ...this.freshState(agentId),
      configOptions: previousConfig,
      ...(model ? { currentModel: model } : {}),
    };
  }

  private freshState(agentId: AgentId): AgentPanelState {
    const definition = getAgentDefinition(agentId, this.options.settings);
    const state = createAgentPanelState({
      agentId,
      agentLabel: definition.label,
      now: this.options.now,
    });
    const model = this.selectedModels.get(agentId);
    const visible = this.visibleModels.get(agentId);
    return {
      ...state,
      ...(model ? { currentModel: model } : {}),
      ...(visible ? { visibleModels: [...visible] } : {}),
    };
  }

  private emit(): void {
    this.options.onSnapshot(this.snapshot());
  }

  private fail(error: unknown, addEntry = true): void {
    const message = messageOf(error);
    this.state = {
      ...setPhase(this.state, "failed", message),
      ...(addEntry
        ? { entries: [...this.state.entries, errorEntry(this.state, message)] }
        : {}),
    };
    this.emit();
  }

  private async ensureRuntime(): Promise<AgentRuntime> {
    if (this.runtime) return this.runtime;
    if (this.starting) return this.starting;

    this.state = setPhase(this.state, "starting");
    this.emit();
    const cwd =
      this.options.workspaceDirectory() ?? this.options.activeFileDirectory();
    if (!cwd) {
      throw new Error("Open a folder or file before running an agent.");
    }
    const definition = getAgentDefinition(this.agentId, this.options.settings);
    const preferredModel = this.selectedModels.get(this.agentId);
    this.starting = this.options
      .createRuntime({
        definition,
        cwd,
        ...(preferredModel ? { preferredModel } : {}),
        ...(this.threadSessionId
          ? { resumeSessionId: this.threadSessionId }
          : {}),
        ...(this.replayHistoryOnStart ? { replayHistory: true } : {}),
        onEvent: (event) => {
          this.state = reduceAgentEvent(this.state, event);
          this.emit();
        },
        requestPermission: (request) => this.requestPermission(request),
        authenticate: (request) => this.requestAuthentication(request),
      })
      .then(async (runtime) => {
        const started = await runtime.start();
        this.runtime = runtime;
        this.threadSessionId = started.sessionId;
        this.replayHistoryOnStart = false;
        if (started.configOptions.length > 0) {
          this.state = reduceAgentEvent(this.state, {
            type: "config",
            options: toUiConfigOptions(started.configOptions),
          });
        }
        this.state = {
          ...setPhase(this.state, "ready"),
          authMethods: started.authMethods,
        };
        const model = this.state.configOptions.find(
          (option) => option.id === "model" || option.category === "model",
        );
        const visible = this.visibleModels.get(this.agentId);
        if (model?.currentValue && visible && !visible.has(model.currentValue)) {
          const next = model.options.find((option) =>
            visible.has(option.value),
          )?.value;
          if (next) {
            const options = await runtime.setConfigOption(model.id, next);
            this.state = reduceAgentEvent(this.state, {
              type: "config",
              options,
            });
            this.selectedModels.set(this.agentId, next);
          }
        }
        const current = this.state.configOptions.find(
          (option) => option.id === "model" || option.category === "model",
        );
        if (current?.currentValue) {
          this.selectedModels.set(this.agentId, current.currentValue);
        }
        this.emit();
        if (this.state.entries.length > 0) void this.persistThread();
        void this.syncRemoteSessions(runtime);
        return runtime;
      })
      .finally(() => {
        this.starting = undefined;
      });
    return this.starting;
  }

  private requestPermission(
    request: AgentPermissionRequest,
  ): Promise<string | undefined> {
    if (this.pendingPermission) {
      throw new Error("The agent requested more than one permission at once.");
    }
    const permissionId = `permission-${++this.permissionSequence}`;
    this.state = addPermission(this.state, {
      permissionId,
      title: request.title,
      ...(request.toolCallId ? { toolCallId: request.toolCallId } : {}),
      ...(request.locations ? { locations: request.locations } : {}),
      options: request.options,
    });
    this.emit();
    return new Promise<string | undefined>((resolve) => {
      this.pendingPermission = { resolve };
    });
  }

  private requestAuthentication(
    request: AgentAuthRequest,
  ): Promise<AgentAuthDecision> {
    if (this.pendingAuthentication) {
      throw new Error("The agent requested authentication more than once.");
    }
    this.phaseBeforeAuthentication = this.state.phase;
    this.state = {
      ...setPhase(this.state, "authentication_required"),
      authMethods: request.methods,
    };
    this.emit();
    return new Promise<AgentAuthDecision>((resolve) => {
      this.pendingAuthentication = { resolve };
    });
  }

  private async stopRuntime(): Promise<void> {
    const starting = this.starting;
    await this.cancel();
    await starting?.catch(() => undefined);
    await this.disposeRuntime();
  }

  private async disposeRuntime(): Promise<void> {
    const runtime = this.runtime;
    this.runtime = undefined;
    await runtime?.dispose().catch(() => undefined);
  }
}
