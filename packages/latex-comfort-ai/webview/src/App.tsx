import { useEffect, useMemo, useState } from "react";
import type {
  EditMode,
  HostToWebviewMessage,
  ReviewReadyState,
} from "@latex-comfort/shared";
import { InlineDiff } from "./InlineDiff";
import { vscode } from "./vscode";

type UiState =
  | { status: "idle" }
  | { status: "loading"; mode: EditMode; instruction?: string }
  | { status: "ready"; state: ReviewReadyState }
  | { status: "error"; message: string; canConfigure: boolean };

const MODE_LABEL: Record<EditMode, string> = {
  proofread: "Proofread",
  polish: "Polish",
  rewrite: "Rewrite",
};

export function App() {
  const [state, setState] = useState<UiState>({ status: "idle" });
  const [rejected, setRejected] = useState<Set<number>>(new Set());

  useEffect(() => {
    const onMessage = (event: MessageEvent<HostToWebviewMessage>) => {
      const message = event.data;
      if (message.type === "loading") {
        setState({
          status: "loading",
          mode: message.mode,
          ...(message.instruction ? { instruction: message.instruction } : {}),
        });
        setRejected(new Set());
      } else if (message.type === "ready") {
        setState({ status: "ready", state: message.state });
        setRejected(new Set());
      } else if (message.type === "error") {
        setState({
          status: "error",
          message: message.message,
          canConfigure: message.canConfigure,
        });
      }
    };
    window.addEventListener("message", onMessage);
    vscode.postMessage({ type: "webviewReady" });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const ready = state.status === "ready" ? state.state : null;
  const kept = useMemo(
    () => (ready ? ready.hunks.filter((hunk) => !rejected.has(hunk.id)).length : 0),
    [ready, rejected],
  );

  const accept = () => {
    if (!ready) return;
    vscode.postMessage({
      type: "accept",
      acceptedIds: ready.hunks
        .filter((hunk) => !rejected.has(hunk.id))
        .map((hunk) => hunk.id),
    });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!ready) return;
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        accept();
      } else if (event.key === "Escape") {
        event.preventDefault();
        vscode.postMessage({ type: "reject" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ready, rejected]);

  const toggle = (id: number, accepted: boolean) => {
    setRejected((current) => {
      const next = new Set(current);
      if (accepted) next.delete(id);
      else next.add(id);
      return next;
    });
    vscode.postMessage({ type: "toggleHunk", id, accepted });
  };

  return (
    <main className="review-shell">
      {state.status === "loading" ? (
        <LoadingCard mode={state.mode} instruction={state.instruction} />
      ) : null}
      {state.status === "error" ? (
        <ErrorCard
          message={state.message}
          canConfigure={state.canConfigure}
        />
      ) : null}
      {ready ? (
        <section className="review-card" aria-label="LaTeX Comfort AI suggestion">
          <header className="review-header">
            <div className="review-heading">
              <span className="mode-pill">{MODE_LABEL[ready.mode]}</span>
              {ready.instruction ? (
                <span className="instruction" title={ready.instruction}>
                  {ready.instruction}
                </span>
              ) : null}
            </div>
            <div className="review-meta">
              <span>
                {ready.hunks.length} change{ready.hunks.length === 1 ? "" : "s"}
              </span>
              {ready.modelLabel ? <span>{ready.modelLabel}</span> : null}
            </div>
          </header>
          <InlineDiff
            original={ready.original}
            hunks={ready.hunks}
            rejected={rejected}
            onToggle={toggle}
          />
          <footer className="review-actions">
            <button
              type="button"
              className="primary-action"
              disabled={kept === 0}
              onClick={accept}
            >
              {kept === ready.hunks.length ? "Accept all" : `Accept ${kept} of ${ready.hunks.length}`}
              <kbd>{navigator.platform.includes("Mac") ? "⌘↩" : "Ctrl+Enter"}</kbd>
            </button>
            <button
              type="button"
              className="quiet-action"
              onClick={() => vscode.postMessage({ type: "reject" })}
            >
              Discard <kbd>Esc</kbd>
            </button>
          </footer>
        </section>
      ) : null}
    </main>
  );
}

function LoadingCard({
  mode,
  instruction,
}: {
  mode: EditMode;
  instruction?: string;
}) {
  return (
    <section className="review-card" aria-busy="true" aria-label="AI is editing">
      <header className="review-header">
        <span className="mode-pill">{MODE_LABEL[mode]}</span>
        {instruction ? <span className="instruction">{instruction}</span> : null}
        <span className="review-meta">Editing…</span>
      </header>
      <div className="skeleton" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <footer className="review-actions">
        <button
          type="button"
          className="quiet-action"
          onClick={() => vscode.postMessage({ type: "reject" })}
        >
          Cancel
        </button>
      </footer>
    </section>
  );
}

function ErrorCard({
  message,
  canConfigure,
}: {
  message: string;
  canConfigure: boolean;
}) {
  return (
    <section className="review-card error-card" role="alert">
      <header className="review-header">
        <span className="mode-pill error-pill">AI edit failed</span>
      </header>
      <p>{message}</p>
      <footer className="review-actions">
        {canConfigure ? (
          <button
            type="button"
            className="primary-action"
            onClick={() => vscode.postMessage({ type: "configureProvider" })}
          >
            Configure provider
          </button>
        ) : null}
        <button
          type="button"
          className="quiet-action"
          onClick={() => vscode.postMessage({ type: "reject" })}
        >
          Dismiss
        </button>
      </footer>
    </section>
  );
}
