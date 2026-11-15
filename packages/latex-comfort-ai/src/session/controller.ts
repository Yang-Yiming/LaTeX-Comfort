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
  createEditSession,
  isSessionStale,
  selectedHunks,
  type CurrentSelectionSnapshot,
  type EditSession,
} from "./session";

export interface ReviewSurface {
  showLoading(mode: EditMode, instruction?: string): void;
  showReady(state: ReviewReadyState): void;
  showError(message: string, canConfigure?: boolean): void;
  close(): void;
}

export interface EditControllerDeps {
  provider(): Promise<{ provider: EditProvider; label: string }>;
  panel: ReviewSurface;
  currentSnapshot(session: EditSession): Promise<CurrentSelectionSnapshot>;
  applyEdit(session: EditSession, replacement: string): Promise<boolean>;
}

type ActiveEdit = {
  session: EditSession;
  abort: AbortController;
  hunks: ReviewReadyState["hunks"];
  providerLabel: string;
  modelLabel?: string;
  loading: boolean;
};

/** Owns the one active selection-edit session and its review lifecycle. */
export class EditController {
  private active: ActiveEdit | null = null;

  constructor(private readonly deps: EditControllerDeps) {}

  async start(
    selection: SelectionContext,
    mode: EditMode,
    instruction: string,
    context: { before: string; after: string },
  ): Promise<void> {
    if (this.active) {
      this.deps.panel.showError(
        "An AI edit is already open. Accept or discard it before starting another.",
      );
      return;
    }

    const session = createEditSession(selection, mode, instruction);
    const abort = new AbortController();
    this.active = {
      session,
      abort,
      hunks: [],
      providerLabel: "",
      loading: true,
    };
    this.deps.panel.showLoading(mode, session.instruction || undefined);

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
      });
      if (abort.signal.aborted || !this.active || this.active.session.id !== session.id) {
        return;
      }

      const hunks = diffHunks(session.text, result.text);
      if (!hunks.length) {
        this.active.hunks = [];
        this.active.loading = false;
        this.deps.panel.showError("The AI did not suggest any changes.");
        return;
      }

      this.active = {
        ...this.active,
        hunks,
        providerLabel: label,
        modelLabel: result.label,
        loading: false,
      };
      this.deps.panel.showReady({
        original: session.text,
        proposed: result.text,
        hunks,
        mode,
        ...(session.instruction ? { instruction: session.instruction } : {}),
        providerLabel: label,
        modelLabel: result.label,
      });
    } catch (error) {
      if (abort.signal.aborted) return;
      this.deps.panel.showError(
        error instanceof Error ? error.message : String(error),
        true,
      );
    }
  }

  async accept(acceptedIds: readonly number[]): Promise<void> {
    const active = this.active;
    if (!active || active.loading) {
      this.deps.panel.showError("The AI edit is still loading.");
      return;
    }

    const snapshot = await this.deps.currentSnapshot(active.session);
    if (isSessionStale(active.session, snapshot)) {
      this.deps.panel.showError(
        "The selected text changed while the AI was working. Generate a new suggestion.",
      );
      return;
    }

    const hunks = selectedHunks(active.hunks, acceptedIds);
    if (!hunks.length) {
      this.deps.panel.showError("Choose at least one change to accept.");
      return;
    }

    const replacement = applyHunks(active.session.text, hunks);
    const applied = await this.deps.applyEdit(active.session, replacement);
    if (!applied) {
      this.deps.panel.showError("The editor refused the edit.");
      return;
    }
    this.active = null;
    this.deps.panel.close();
  }

  reject(): void {
    this.active?.abort.abort();
    this.active = null;
    this.deps.panel.close();
  }

  dispose(): void {
    this.active?.abort.abort();
    this.active = null;
  }
}

function fileName(uri: string): string {
  try {
    const parsed = new URL(uri);
    return decodeURIComponent(parsed.pathname.split("/").pop() || uri);
  } catch {
    return uri;
  }
}
