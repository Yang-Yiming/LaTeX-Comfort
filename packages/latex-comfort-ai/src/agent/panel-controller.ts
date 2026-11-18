import type {
  AgentUiAuthMethod,
  AgentUiConfigOption,
  AgentUiContext,
  AgentUiEntry,
  AgentUiSnapshot,
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
    configOptions: AgentConfigOption[];
    authMethods: AgentUiAuthMethod[];
  }>;
  prompt(prompt: string): Promise<void>;
  cancel(): Promise<void>;
  setConfigOption(
    configId: string,
    value: string,
  ): Promise<AgentConfigOption[]>;
  dispose(): Promise<void>;
}

export interface AgentRuntimeDependencies {
  definition: AgentDefinition;
  cwd: string;
  preferredModel?: string;
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
    return snapshot;
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
    this.agentId = agentId;
    this.state = this.freshState(agentId);
    this.emit();
    void this.prepare();
  }

  async prepare(): Promise<void> {
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
    this.state = appendUserMessage(
      this.state,
      prompt,
      context?.label,
    );
    this.state = setPhase(this.state, "running");
    this.emit();

    try {
      const runtime = await this.ensureRuntime();
      this.state = setPhase(this.state, "running");
      this.emit();
      await runtime.prompt(`${contextPrompt(context)}${prompt}`);
      this.state = finishTurn(this.state);
      this.emit();
    } catch (error) {
      if (this.state.phase === "failed") return;
      if (isAbortError(error)) {
        this.state = reduceAgentEvent(this.state, {
          type: "notice",
          message: "Stopped.",
        });
        this.state = finishTurn(this.state);
        this.emit();
        return;
      }
      this.fail(error);
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
    const model = this.selectedModels.get(this.agentId);
    const previousConfig = this.state.configOptions;
    this.state = {
      ...this.freshState(this.agentId),
      configOptions: previousConfig,
      ...(model ? { currentModel: model } : {}),
    };
    this.emit();
    void this.prepare();
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
