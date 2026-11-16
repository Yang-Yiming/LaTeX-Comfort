import type {
  EditMode,
  ReviewReadyState,
  SelectionContext,
} from "@latex-comfort/shared";
import { applyHunks } from "../diff/apply";
import { diffHunks } from "../diff/diff";
import { buildEditPrompt } from "../model/prompt";
import type { EditProvider } from "../model/provider";
import {
  allHunkIds,
  toggleSelectedHunk,
  type ReviewContext,
  type ReviewViewState,
} from "../review/state";
import {
  createEditSession,
  isSessionStale,
  selectedHunks,
  type CurrentSelectionSnapshot,
  type EditSession,
} from "./session";

export interface ReviewSurface {
  render(state: ReviewViewState): void;
  dispose(): void;
}

export interface EditControllerDeps {
  provider(): Promise<{ provider: EditProvider; label: string }>;
  surface: ReviewSurface;
  currentSnapshot(session: EditSession): Promise<CurrentSelectionSnapshot>;
  applyEdit(session: EditSession, replacement: string): Promise<boolean>;
}

type ActiveEdit = {
  session: EditSession;
  abort: AbortController;
  hunks: ReviewReadyState["hunks"];
  proposed: string;
  selectedHunkIds: Set<number>;
  providerLabel: string;
  modelLabel?: string;
  loading: boolean;
};

/** Owns the one active selection-edit session and its review lifecycle. */
export class EditController {
  private active: ActiveEdit | null = null;
  private currentState: ReviewViewState = { status: "idle" };

  constructor(private readonly deps: EditControllerDeps) {}

  get state(): ReviewViewState {
    return this.currentState;
  }

  async start(
    selection: SelectionContext,
    mode: EditMode,
    instruction: string,
    context: { before: string; after: string },
  ): Promise<void> {
    if (this.active) {
      this.render({
        status: "error",
        context: contextFromSelection(selection),
        message:
          "An AI edit is already open. Accept or discard it before starting another.",
        canConfigure: false,
      });
      return;
    }

    const session = createEditSession(selection, mode, instruction);
    const abort = new AbortController();
    this.active = {
      session,
      abort,
      hunks: [],
      proposed: "",
      selectedHunkIds: new Set(),
      providerLabel: "",
      loading: true,
    };
    this.render({
      status: "loading",
      context: contextFromSession(session),
      mode,
      ...(session.instruction ? { instruction: session.instruction } : {}),
    });

    try {
      const { provider, label } = await this.deps.provider();
      const prompt = buildEditPrompt({
        mode,
        instruction: session.instruction,
        text: session.text,
        path: fileName(session.uri),
        languageId: session.languageId,
        contextBefore: context.before,
        contextAfter: context.after,
      });
      const result = await provider.complete({
        system: prompt.system,
        user: prompt.user,
        signal: abort.signal,
        sessionId: session.id,
      });
      if (abort.signal.aborted || !this.active || this.active.session.id !== session.id) {
        return;
      }

      const hunks = diffHunks(session.text, result.text);
      if (!hunks.length) {
        this.active.hunks = [];
        this.active.selectedHunkIds = new Set();
        this.active.loading = false;
        this.render({
          status: "error",
          context: contextFromSession(session),
          message: "The AI did not suggest any changes.",
          canConfigure: false,
        });
        return;
      }

      this.active = {
        ...this.active,
        hunks,
        proposed: result.text,
        selectedHunkIds: allHunkIds(hunks),
        providerLabel: label,
        modelLabel: result.label,
        loading: false,
      };
      this.renderReady();
    } catch (error) {
      if (abort.signal.aborted) return;
      this.render({
        status: "error",
        context: contextFromSession(session),
        message: error instanceof Error ? error.message : String(error),
        canConfigure: true,
      });
    }
  }

  toggleHunk(id: number, accepted: boolean): void {
    const active = this.active;
    if (!active || active.loading || !active.hunks.some((hunk) => hunk.id === id)) {
      return;
    }
    active.selectedHunkIds = toggleSelectedHunk(
      active.selectedHunkIds,
      id,
      accepted,
    );
    this.renderReady();
  }

  async accept(): Promise<void> {
    const active = this.active;
    if (!active || active.loading) {
      this.render({
        status: "error",
        ...(active ? { context: contextFromSession(active.session) } : {}),
        message: "The AI edit is still loading.",
        canConfigure: false,
      });
      return;
    }

    if (!active.selectedHunkIds.size) {
      return;
    }

    const snapshot = await this.deps.currentSnapshot(active.session);
    if (isSessionStale(active.session, snapshot)) {
      this.render({
        status: "error",
        context: contextFromSession(active.session),
        message:
          "The selected text changed while the AI was working. Generate a new suggestion.",
        canConfigure: false,
      });
      return;
    }

    const hunks = selectedHunks(active.hunks, [...active.selectedHunkIds]);
    const replacement = applyHunks(active.session.text, hunks);
    const applied = await this.deps.applyEdit(active.session, replacement);
    if (!applied) {
      this.render({
        status: "error",
        context: contextFromSession(active.session),
        message: "The editor refused the edit.",
        canConfigure: false,
      });
      return;
    }
    this.active = null;
    this.render({ status: "idle" });
  }

  reject(): void {
    this.active?.abort.abort();
    this.active = null;
    this.render({ status: "idle" });
  }

  dispose(): void {
    this.active?.abort.abort();
    this.active = null;
    this.deps.surface.dispose();
  }

  private renderReady(): void {
    const active = this.active;
    if (!active || active.loading) return;
    this.render({
      status: "ready",
      context: contextFromSession(active.session),
      review: {
        original: active.session.text,
        proposed: active.proposed,
        hunks: active.hunks,
        mode: active.session.mode,
        ...(active.session.instruction
          ? { instruction: active.session.instruction }
          : {}),
        providerLabel: active.providerLabel,
        ...(active.modelLabel ? { modelLabel: active.modelLabel } : {}),
      },
      selectedHunkIds: [...active.selectedHunkIds].sort(
        (left, right) => left - right,
      ),
    });
  }

  private render(state: ReviewViewState): void {
    this.currentState = state;
    this.deps.surface.render(state);
  }
}

export function contextFromSelection(
  selection: SelectionContext,
): ReviewContext {
  return {
    uri: selection.uri,
    range: selection.range,
    textLength: selection.text.length,
  };
}

function contextFromSession(session: EditSession): ReviewContext {
  return contextFromSelection(session);
}

function fileName(uri: string): string {
  try {
    const parsed = new URL(uri);
    return decodeURIComponent(parsed.pathname.split("/").pop() || uri);
  } catch {
    return uri;
  }
}
