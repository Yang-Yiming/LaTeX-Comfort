/*
 * Agent panel composition copied from Lattice's embedded Agent surface
 * (Apache-2.0). Copyright 2026 Leonardo and the Lattice contributors.
 * Licensed under the Apache License, Version 2.0.
 *
 * The DOM structure, starter cards, transcript rows, floating composer,
 * detached permission card and history popover follow Lattice's Synara
 * ChatView/LatticeEmptyThread components. The data adapter is ACP.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type SVGProps,
} from "react";
import type {
  AgentUiAgentId,
  AgentUiConfigOption,
  AgentUiContext,
  AgentUiEntry,
  AgentUiSnapshot,
} from "@latex-comfort/shared";

export interface AgentViewProps {
  snapshot: AgentUiSnapshot;
  onSend(text: string): void;
  onCancel(): void;
  onNewThread(): void;
  onOpenThread(threadId: string): void;
  onDeleteThread(threadId: string): void;
  onSelectAgent(agentId: AgentUiAgentId): void;
  onSelectConfig(configId: string, value: string): void;
  onResolvePermission(permissionId: string, optionId?: string): void;
  onAuthenticate(methodId?: string): void;
  onOpenDiff(turnId: string, path: string): void;
  onOpenTurnDiffs(turnId: string): void;
  onRestoreTurn(turnId: string): void;
  onOpenLocation(path: string, line?: number): void;
  onOpenSettings(): void;
}

const PHASE_LABEL: Record<AgentUiSnapshot["phase"], string> = {
  idle: "Ready",
  starting: "Starting agent",
  ready: "Ready",
  running: "Working",
  waiting_permission: "Waiting for permission",
  authentication_required: "Sign in required",
  failed: "Agent unavailable",
};

const AGENT_LABEL: Record<AgentUiAgentId, string> = {
  opencode: "OpenCode",
  codex: "Codex",
};

type StarterKind = "polish" | "revise" | "proofread" | "references";

const STARTERS: ReadonlyArray<{
  kind: StarterKind;
  title: string;
  example: string;
  prompt: string;
  selectedPrompt: string;
}> = [
  {
    kind: "polish",
    title: "Polish",
    example: "Polish this paragraph",
    prompt:
      "Polish the paragraph at my cursor for clarity and flow. Keep its meaning, citations and LaTeX commands unchanged.",
    selectedPrompt:
      "Polish the selected text for clarity and flow. Keep its meaning, citations and LaTeX commands unchanged.",
  },
  {
    kind: "revise",
    title: "Revise",
    example: "Revise to address a review comment",
    prompt: "Revise the paper to address this review comment: ",
    selectedPrompt: "Revise the selected text to address this review comment: ",
  },
  {
    kind: "proofread",
    title: "Proofread",
    example: "Proofread grammar and spelling",
    prompt:
      "Proofread the section at my cursor and fix grammar, spelling and punctuation. Leave the wording otherwise unchanged.",
    selectedPrompt:
      "Proofread the selected text and fix grammar, spelling and punctuation. Leave the wording otherwise unchanged.",
  },
  {
    kind: "references",
    title: "Check references",
    example: "Check my references",
    prompt:
      "Check the citations in this paper: every \\cite key should exist in the bibliography with accurate details, and each cited work should support its claim. Fix what is wrong.",
    selectedPrompt:
      "Check the citations in the selected text: every \\cite key should exist in the bibliography with accurate details, and each cited work should support its claim. Fix what is wrong.",
  },
];

function Icon({
  name,
  size = 14,
  className,
}: {
  name:
    | "plus"
    | "settings"
    | "history"
    | "chevron"
    | "send"
    | "stop"
    | "check"
    | "error"
    | "spinner"
    | "file"
    | "tool"
    | "search"
    | "close"
    | "trash"
    | "diff"
    | "selection"
    | "agent";
  size?: number;
  className?: string;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className,
  };
  switch (name) {
    case "plus":
      return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
    case "settings":
      return <svg {...common}><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="8" cy="6" r="1.6" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="10" cy="18" r="1.6" fill="currentColor" stroke="none" /></svg>;
    case "history":
      return <svg {...common}><path d="M4.5 8.5A8 8 0 1 1 4 12" /><path d="M4.5 4.5v4h4" /><path d="M12 8v4l2.6 1.6" /></svg>;
    case "chevron":
      return <svg {...common}><path d="m7 9 5 5 5-5" /></svg>;
    case "send":
      return <svg {...common}><path d="M12 19V5M5 12l7-7 7 7" /></svg>;
    case "stop":
      return <svg {...common}><rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none" /></svg>;
    case "check":
      return <svg {...common}><path d="m5 12 4.2 4.2L19 6.5" /></svg>;
    case "error":
      return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v5.3M12 16.2v.4" /></svg>;
    case "spinner":
      return <svg {...common}><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" /></svg>;
    case "file":
      return <svg {...common}><path d="M6 3.5h7l4.5 4.5v12.5H6z" /><path d="M13 3.8V8h4.2" /></svg>;
    case "tool":
      return <svg {...common}><path d="M14.7 6.3a4 4 0 0 0-5.2 5.2L4 17v3h3l5.5-5.5a4 4 0 0 0 5.2-5.2l-2.4 2.4-2.8-2.8z" /></svg>;
    case "search":
      return <svg {...common}><circle cx="10.5" cy="10.5" r="6.2" /><path d="m15.2 15.2 4.3 4.3" /></svg>;
    case "close":
      return <svg {...common}><path d="m6 6 12 12M18 6 6 18" /></svg>;
    case "trash":
      return <svg {...common}><path d="M5 7h14M9 7V4.5h6V7M7.2 7l.8 13h8l.8-13M10 10.5v6M14 10.5v6" /></svg>;
    case "diff":
      return <svg {...common}><path d="M5 6h6M8 3v6M13 18h6M13 12h6M13 9h6" /></svg>;
    case "selection":
      return <svg {...common}><path d="M8 4H5a1 1 0 0 0-1 1v3M16 4h3a1 1 0 0 1 1 1v3M8 20H5a1 1 0 0 1-1-1v-3M16 20h3a1 1 0 0 0 1-1v-3M8 12h8M8 16h5M8 8h6" /></svg>;
    case "agent":
      return <svg {...common}><rect x="5" y="7" width="14" height="11" rx="3" /><path d="M12 3v4M9 12h.1M15 12h.1M9 16h6" /></svg>;
  }
}

function StarterIcon({
  kind,
  ...props
}: { kind: StarterKind } & SVGProps<SVGSVGElement>) {
  const paths: Record<StarterKind, readonly string[]> = {
    polish: [
      "m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72",
      "m14 7 3 3",
      "M5 6v4",
      "M19 14v4",
      "M10 2v2",
      "M7 8H3",
      "M21 16h-4",
      "M11 3H9",
    ],
    revise: [
      "M13 21h8",
      "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
    ],
    proofread: ["m6 16 6-12 6 12", "M8 12h8", "m16 20 2 2 4-4"],
    references: [
      "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20",
      "m9 9.5 2 2 4-4",
    ],
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[kind].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatHistoryTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortPath(path: string): string {
  const parts = path.replaceAll("\\", "/").split("/");
  return parts[parts.length - 1] || path;
}

function contextName(context: AgentUiContext): string {
  return context.label.replace(/\s*·\s*selection$/i, "").trim() || "Current selection";
}

function contextDetail(context: AgentUiContext): string | null {
  return context.line ? `line ${context.line}` : null;
}

function permissionDescription(kind?: string): string | null {
  switch (kind) {
    case "allow_once":
      return "Allow this request once";
    case "allow_always":
    case "allow_session":
      return "Allow this kind of request for this session";
    case "reject_once":
      return "Decline this request";
    case "reject_always":
      return "Always decline this kind of request";
    default:
      return null;
  }
}

function statusIcon(status?: string) {
  if (status === "completed") return <Icon name="check" size={13} />;
  if (status === "failed") return <Icon name="error" size={13} />;
  if (status === "in_progress" || status === "pending") {
    return <Icon name="spinner" size={13} className="lattice-spin" />;
  }
  return <Icon name="tool" size={13} />;
}

function ContextChip({ context, align = "start" }: { context: AgentUiContext; align?: "start" | "end" }) {
  const detail = contextDetail(context);
  return (
    <div className="lattice-context-chip" data-align={align} title={context.selectedText ?? context.label}>
      <Icon name="selection" size={13} />
      <span className="lattice-context-label">Selection</span>
      <span aria-hidden="true" className="lattice-context-dot">·</span>
      <span className="lattice-context-name" title={contextName(context)}>{contextName(context)}</span>
      {detail ? <span className="lattice-context-detail">{detail}</span> : null}
    </div>
  );
}

const EMPTY_DENSITIES = ["full", "compact", "chips", "bare", "icons", "hidden"] as const;
type EmptyDensity = (typeof EMPTY_DENSITIES)[number];

function AgentEmptyThread({
  context,
  bottomInsetPx,
  onStarter,
}: {
  context?: AgentUiContext;
  bottomInsetPx: number;
  onStarter(prompt: string): void;
}) {
  const [fit, setFit] = useState({ step: 0, generation: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const density: EmptyDensity = EMPTY_DENSITIES[fit.step] ?? "full";
  const hasSelection = Boolean(context?.selectedText || context?.label);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || fit.step >= EMPTY_DENSITIES.length - 1) return;
    if (viewport.scrollHeight > viewport.clientHeight + 1 || viewport.scrollWidth > viewport.clientWidth + 1) {
      setFit((current) => ({ ...current, step: current.step + 1 }));
    }
  }, [fit]);

  const refit = useCallback(() => {
    setFit((current) => ({ step: 0, generation: current.generation + 1 }));
  }, []);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    let disposed = false;
    void document.fonts?.ready.then(() => {
      if (!disposed) refit();
    });
    if (typeof ResizeObserver === "undefined") return () => { disposed = true; };
    const observer = new ResizeObserver(refit);
    observer.observe(viewport, { box: "border-box" });
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [refit]);

  const showTitle = density === "full" || density === "compact" || density === "chips";
  const showHint = density === "full" || density === "compact";
  const showChip = showTitle && hasSelection && context;

  const renderStarter = (starter: (typeof STARTERS)[number]) => {
    const prompt = hasSelection ? starter.selectedPrompt : starter.prompt;
    if (density === "icons") {
      return (
        <li key={starter.kind} className="lattice-starter-item is-icon">
          <button
            type="button"
            data-starter={starter.kind}
            aria-label={starter.title}
            title={`${starter.title} · ${starter.example}`}
            className="lattice-starter is-icon"
            onClick={() => onStarter(prompt)}
          >
            <StarterIcon kind={starter.kind} className="lattice-starter-glyph" />
          </button>
        </li>
      );
    }
    if (density === "chips" || density === "bare") {
      return (
        <li key={starter.kind} className="lattice-starter-item is-chip">
          <button
            type="button"
            data-starter={starter.kind}
            title={starter.example}
            className="lattice-starter is-chip"
            onClick={() => onStarter(prompt)}
          >
            <StarterIcon kind={starter.kind} className="lattice-starter-glyph" />
            <span>{starter.title}</span>
          </button>
        </li>
      );
    }
    const compact = density === "compact";
    return (
      <li key={starter.kind} className="lattice-starter-item">
        <button
          type="button"
          data-starter={starter.kind}
          title={compact ? starter.example : undefined}
          className="lattice-starter"
          data-compact={compact || undefined}
          onClick={() => onStarter(prompt)}
        >
          <span className="lattice-starter-icon" aria-hidden="true">
            <StarterIcon kind={starter.kind} />
          </span>
          {compact ? (
            <span className="lattice-starter-title">{starter.title}</span>
          ) : (
            <span className="lattice-starter-copy">
              <span className="lattice-starter-title">{starter.title}</span>
              <span className="lattice-starter-example">{starter.example}</span>
            </span>
          )}
        </button>
      </li>
    );
  };

  return (
    <div className="lattice-empty-thread" data-density={density} data-selection={hasSelection || undefined}>
      <div
        ref={viewportRef}
        className="lattice-empty-viewport"
        style={{ bottom: `${bottomInsetPx + 8}px` }}
      >
        <div className="lattice-empty-center">
          {showTitle ? <h2 className="lattice-empty-title">Work on this paper</h2> : null}
          {showHint ? (
            <p className="lattice-empty-hint">
              {hasSelection
                ? "These act on the selected text only"
                : "To work on a single passage, select it in the editor"}
            </p>
          ) : null}
          {showChip ? <ContextChip context={context} /> : null}
          <ul className="lattice-starters">
            {STARTERS.map(renderStarter)}
          </ul>
        </div>
      </div>
    </div>
  );
}

function AgentLoadingSkeleton() {
  return (
    <div className="lattice-agent-skeleton" aria-hidden="true">
      <div className="lattice-skeleton-header">
        <span className="lattice-skeleton-thread" />
        <span className="lattice-skeleton-chip" data-end />
        <span className="lattice-skeleton-square" />
      </div>
      <div className="lattice-skeleton-body">
        <span className="lattice-skeleton-heading" />
        <span className="lattice-skeleton-description"><span /><span /></span>
        {[24, 26, 38, 66].map((width) => (
          <div className="lattice-skeleton-suggestion" key={width}>
            <span className="lattice-skeleton-tile" />
            <span className="lattice-skeleton-lines"><span style={{ width: `${width}%` }} /><span /></span>
          </div>
        ))}
      </div>
      <div className="lattice-skeleton-composer">
        <span className="lattice-skeleton-placeholder" />
        <span className="lattice-skeleton-round" />
      </div>
    </div>
  );
}

function AgentEntry({
  entry,
  onOpenLocation,
}: {
  entry: AgentUiEntry;
  onOpenLocation(path: string, line?: number): void;
}) {
  switch (entry.type) {
    case "user":
      return (
        <article className="lattice-message-row is-user">
          {entry.contextLabel ? (
            <div className="lattice-user-context" title={entry.contextLabel}>
              <Icon name="file" size={12} />
              <span>{entry.contextLabel}</span>
            </div>
          ) : null}
          <div className="lattice-user-bubble">
            <p>{entry.text}</p>
          </div>
          <div className="lattice-message-meta is-user">{formatTime(entry.at)}</div>
        </article>
      );
    case "assistant":
      return (
        <article className="lattice-message-row is-assistant">
          <div className="lattice-assistant-body" data-streaming={entry.streaming || undefined}>
            {entry.text}
          </div>
          <div className="lattice-message-meta">
            <span>{formatTime(entry.at)}</span>
            {entry.streaming ? <span className="lattice-working-label">Working</span> : null}
          </div>
        </article>
      );
    case "thinking":
      return (
        <details className="lattice-work-row" open={entry.streaming || undefined}>
          <summary>
            <span className="lattice-work-status">
              {entry.streaming ? <Icon name="spinner" size={13} className="lattice-spin" /> : <Icon name="check" size={13} />}
            </span>
            <span className="lattice-work-title">Thinking</span>
            <span className="lattice-work-chevron"><Icon name="chevron" size={12} /></span>
          </summary>
          <div className="lattice-work-detail">
            <p>{entry.text}</p>
          </div>
        </details>
      );
    case "tool": {
      const failed = entry.status === "failed";
      return (
        <details className="lattice-work-row" data-status={entry.status} open={failed || entry.status === "pending" || entry.status === "in_progress" || undefined}>
          <summary>
            <span className="lattice-work-status">{statusIcon(entry.status)}</span>
            <span className="lattice-work-title">{entry.title || entry.name || "Tool call"}</span>
            {entry.kind ? <span className="lattice-work-kind">{entry.kind}</span> : null}
            <span className="lattice-work-chevron"><Icon name="chevron" size={12} /></span>
          </summary>
          {entry.locations?.length ? (
            <div className="lattice-work-locations">
              {entry.locations.map((location, index) => (
                <button
                  type="button"
                  className="lattice-location"
                  key={`${location.path}:${location.line ?? 0}:${index}`}
                  onClick={() => onOpenLocation(location.path, location.line)}
                >
                  <Icon name="file" size={12} />
                  <span>{shortPath(location.path)}</span>
                  {location.line ? <span className="lattice-location-line">{location.line}</span> : null}
                </button>
              ))}
            </div>
          ) : null}
        </details>
      );
    }
    case "permission": {
      if (!entry.resolvedOptionId) return null;
      const label = entry.options.find((option) => option.id === entry.resolvedOptionId)?.label ?? "Decision sent";
      return (
        <div className="lattice-work-row is-static">
          <span className="lattice-work-status"><Icon name="check" size={13} /></span>
          <span className="lattice-work-title">{entry.title}</span>
          <span className="lattice-work-kind">{label}</span>
        </div>
      );
    }
    case "notice":
      return (
        <div className="lattice-inline-notice" data-severity={entry.severity}>
          <Icon name={entry.severity === "error" ? "error" : "agent"} size={13} />
          <span>{entry.text}</span>
        </div>
      );
    case "error":
      return (
        <div className="lattice-inline-notice" data-severity="error">
          <Icon name="error" size={13} />
          <span>{entry.text}</span>
        </div>
      );
  }
}

function AgentErrorBanner({ snapshot, onOpenSettings }: { snapshot: AgentUiSnapshot; onOpenSettings(): void }) {
  if (snapshot.phase !== "failed" || !snapshot.error) return null;
  return (
    <section className="lattice-composer-panel" aria-label="Agent unavailable">
      <div className="lattice-panel-heading">
        <span className="lattice-panel-icon is-error"><Icon name="error" size={14} /></span>
        <div>
          <strong>Agent unavailable</strong>
          <p>{snapshot.error}</p>
        </div>
      </div>
      <button type="button" className="lattice-button" onClick={onOpenSettings}>Open settings</button>
    </section>
  );
}

function AuthBanner({ snapshot, onAuthenticate }: { snapshot: AgentUiSnapshot; onAuthenticate(methodId?: string): void }) {
  if (snapshot.phase !== "authentication_required") return null;
  return (
    <section className="lattice-composer-panel" aria-label="Agent sign in required">
      <div className="lattice-panel-heading">
        <span className="lattice-panel-icon"><Icon name="agent" size={14} /></span>
        <div>
          <strong>Sign in required</strong>
          <p>{snapshot.agentLabel} needs to sign in before it can continue.</p>
        </div>
      </div>
      <div className="lattice-panel-actions">
        {snapshot.authMethods.length > 0 ? snapshot.authMethods.map((method) => (
          <button type="button" className="lattice-button" key={method.id} onClick={() => onAuthenticate(method.id)}>
            {method.label}
          </button>
        )) : (
          <button type="button" className="lattice-button" onClick={() => onAuthenticate()}>Sign in</button>
        )}
      </div>
    </section>
  );
}

function AgentPermissionPanel({
  entry,
  onResolve,
}: {
  entry: Extract<AgentUiEntry, { type: "permission" }>;
  onResolve(permissionId: string, optionId?: string): void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panelRef.current?.focus();
  }, [entry.id]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const index = Number.parseInt(event.key, 10) - 1;
    const option = entry.options[index];
    if (!option) return;
    event.preventDefault();
    onResolve(entry.id, option.id);
  };

  return (
    <div
      ref={panelRef}
      className="lattice-permission-panel"
      role="dialog"
      aria-label={entry.title}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <div className="lattice-panel-heading">
        <span className="lattice-panel-icon"><Icon name="tool" size={14} /></span>
        <div>
          <strong>Approve this tool call?</strong>
          <p>{entry.title}</p>
        </div>
      </div>
      {entry.locations?.length ? (
        <div className="lattice-work-locations">
          {entry.locations.map((location, index) => (
            <span className="lattice-location is-static" key={`${location.path}:${location.line ?? 0}:${index}`}>
              <Icon name="file" size={12} />
              <span>{shortPath(location.path)}</span>
              {location.line ? <span className="lattice-location-line">{location.line}</span> : null}
            </span>
          ))}
        </div>
      ) : null}
      <div className="lattice-choice-list">
        {entry.options.map((option, index) => {
          const reject = option.kind?.startsWith("reject");
          return (
            <button
              type="button"
              className="lattice-choice"
              data-tone={reject ? "destructive" : index === 0 ? "primary" : "neutral"}
              key={option.id}
              onClick={() => onResolve(entry.id, option.id)}
            >
              <span className="lattice-choice-index">{index + 1}</span>
              <span className="lattice-choice-copy">
                <strong>{option.label}</strong>
                {permissionDescription(option.kind) ? <small>{permissionDescription(option.kind)}</small> : null}
              </span>
              <Icon name="chevron" size={12} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AgentPicker({
  agentId,
  agentLabel,
  onSelectAgent,
}: {
  agentId: AgentUiAgentId;
  agentLabel: string;
  onSelectAgent(agentId: AgentUiAgentId): void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div className="lattice-picker" ref={rootRef}>
      <button type="button" className="lattice-picker-trigger" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <Icon name="agent" size={13} />
        <span>{agentLabel}</span>
        <Icon name="chevron" size={11} />
      </button>
      {open ? (
        <div className="lattice-picker-menu is-agent" role="menu" aria-label="Agent">
          {(Object.keys(AGENT_LABEL) as AgentUiAgentId[]).map((id) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={id === agentId}
              data-active={id === agentId || undefined}
              className="lattice-picker-option"
              key={id}
              onClick={() => {
                setOpen(false);
                onSelectAgent(id);
              }}
            >
              <span>{AGENT_LABEL[id]}</span>
              {id === agentId ? <Icon name="check" size={13} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function providerOf(value: string): string {
  const index = value.indexOf("/");
  return index > 0 ? value.slice(0, index) : "Models";
}

function groupOptions(options: AgentUiConfigOption["options"]) {
  const groups = new Map<string, Array<{ value: string; label: string }>>();
  for (const option of options) {
    const provider = providerOf(option.value);
    const group = groups.get(provider) ?? [];
    group.push(option);
    groups.set(provider, group);
  }
  return [...groups.entries()].map(([provider, entries]) => ({ provider, entries }));
}

function ConfigPicker({
  option,
  onChange,
}: {
  option: AgentUiConfigOption;
  onChange(configId: string, value: string): void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const current = option.options.find((entry) => entry.value === option.currentValue);
  const model = option.id === "model" || option.category === "model";
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? option.options.filter((entry) => entry.label.toLowerCase().includes(needle) || entry.value.toLowerCase().includes(needle))
      : option.options;
  }, [option.options, query]);
  const groups = useMemo(() => groupOptions(filtered), [filtered]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  const label = current?.label || option.currentValue || "Default";

  return (
    <div className="lattice-picker" ref={rootRef}>
      <button
        type="button"
        className="lattice-picker-trigger"
        aria-expanded={open}
        aria-label={option.name}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{label}</span>
        <Icon name="chevron" size={11} />
      </button>
      {open ? (
        <div className="lattice-picker-menu" role="menu" aria-label={option.name}>
          {model ? (
            <label className="lattice-picker-search">
              <Icon name="search" size={13} />
              <input
                value={query}
                aria-label={`Search ${option.name.toLowerCase()}`}
                placeholder="Search models…"
                onChange={(event) => setQuery(event.target.value)}
                autoFocus
              />
            </label>
          ) : null}
          <div className="lattice-picker-options">
            {groups.length > 0 ? groups.map((group) => (
              <div className="lattice-picker-group" key={group.provider}>
                {model ? <div className="lattice-picker-group-label">{group.provider}</div> : null}
                {group.entries.map((entry) => (
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={entry.value === option.currentValue}
                    data-active={entry.value === option.currentValue || undefined}
                    className="lattice-picker-option"
                    key={entry.value}
                    onClick={() => {
                      setOpen(false);
                      setQuery("");
                      onChange(option.id, entry.value);
                    }}
                  >
                    <span>{entry.label}</span>
                    {entry.value === option.currentValue ? <Icon name="check" size={13} /> : null}
                  </button>
                ))}
              </div>
            )) : <p className="lattice-picker-empty">No models match “{query}”.</p>}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AgentComposer({
  snapshot,
  draft,
  setDraft,
  send,
  stackRef,
  textareaRef,
  pendingPermission,
  onCancel,
  onResolvePermission,
  onSelectAgent,
  onSelectConfig,
  onAuthenticate,
  onOpenSettings,
}: {
  snapshot: AgentUiSnapshot;
  draft: string;
  setDraft(value: string): void;
  send(): void;
  stackRef: { current: HTMLDivElement | null };
  textareaRef: { current: HTMLTextAreaElement | null };
  pendingPermission: Extract<AgentUiEntry, { type: "permission" }> | null;
  onCancel(): void;
  onResolvePermission(permissionId: string, optionId?: string): void;
  onSelectAgent(agentId: AgentUiAgentId): void;
  onSelectConfig(configId: string, value: string): void;
  onAuthenticate(methodId?: string): void;
  onOpenSettings(): void;
}) {
  const busy = snapshot.phase === "running" || snapshot.phase === "waiting_permission" || snapshot.phase === "authentication_required";
  const stop = snapshot.phase === "running" || snapshot.phase === "waiting_permission";

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    send();
  };

  return (
    <div className="lattice-composer-slot">
      <div className="lattice-composer-stack" ref={stackRef}>
        <AgentErrorBanner snapshot={snapshot} onOpenSettings={onOpenSettings} />
        <AuthBanner snapshot={snapshot} onAuthenticate={onAuthenticate} />
        {pendingPermission ? (
          <AgentPermissionPanel entry={pendingPermission} onResolve={onResolvePermission} />
        ) : null}
        {snapshot.context ? <ContextChip context={snapshot.context} /> : null}
        <div className="lattice-composer-surface">
          <div className="lattice-composer-editor">
            <textarea
              ref={textareaRef}
              rows={1}
              aria-label="Prompt"
              placeholder="Do anything in Lattice"
              value={draft}
              disabled={snapshot.phase === "authentication_required"}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
            />
          </div>
          <div className="lattice-composer-footer">
            <div className="lattice-composer-pickers">
              <AgentPicker
                agentId={snapshot.agentId}
                agentLabel={snapshot.agentLabel}
                onSelectAgent={onSelectAgent}
              />
              {snapshot.configOptions.map((option) => (
                <ConfigPicker key={option.id} option={option} onChange={onSelectConfig} />
              ))}
            </div>
            <div className="lattice-composer-actions">
              <span className="lattice-phase" data-phase={snapshot.phase}>
                {snapshot.phase === "running" || snapshot.phase === "starting" ? (
                  <Icon name="spinner" size={12} className="lattice-spin" />
                ) : snapshot.phase === "failed" ? (
                  <Icon name="error" size={12} />
                ) : snapshot.phase === "waiting_permission" ? (
                  <span className="lattice-phase-dot" />
                ) : null}
                {PHASE_LABEL[snapshot.phase]}
              </span>
              {stop ? (
                <button type="button" className="lattice-send-button is-stop" aria-label="Stop agent" title="Stop agent" onClick={onCancel}>
                  <Icon name="stop" size={14} />
                </button>
              ) : (
                <button
                  type="button"
                  className="lattice-send-button"
                  aria-label="Send prompt"
                  title="Send prompt"
                  disabled={!draft.trim() || busy}
                  onClick={send}
                >
                  <Icon name="send" size={15} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentHistoryPopover({
  snapshot,
  onClose,
  onOpenThread,
  onDeleteThread,
  onOpenDiff,
  onOpenTurnDiffs,
  onRestoreTurn,
}: {
  snapshot: AgentUiSnapshot;
  onClose(): void;
  onOpenThread(threadId: string): void;
  onDeleteThread(threadId: string): void;
  onOpenDiff(turnId: string, path: string): void;
  onOpenTurnDiffs(turnId: string): void;
  onRestoreTurn(turnId: string): void;
}) {
  const [tab, setTab] = useState<"threads" | "changes">("threads");
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const threads = snapshot.threads.filter((thread) => !needle || thread.title.toLowerCase().includes(needle));
  const turns = snapshot.turns.filter((turn) => !needle || turn.prompt.toLowerCase().includes(needle) || turn.threadTitle.toLowerCase().includes(needle));

  return (
    <div className="lattice-history-layer" onMouseDown={onClose}>
      <section className="lattice-history-popover" aria-label="Agent history" onMouseDown={(event) => event.stopPropagation()}>
        <header className="lattice-history-header">
          <div>
            <strong>History</strong>
            <span>{snapshot.threads.length} threads</span>
          </div>
          <button type="button" className="lattice-icon-button" aria-label="Close history" onClick={onClose}>
            <Icon name="close" size={14} />
          </button>
        </header>
        <div className="lattice-history-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "threads"} data-active={tab === "threads" || undefined} onClick={() => setTab("threads")}>
            Threads <span>{snapshot.threads.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === "changes"} data-active={tab === "changes" || undefined} onClick={() => setTab("changes")}>
            Changes <span>{snapshot.turns.length}</span>
          </button>
        </div>
        <label className="lattice-picker-search is-history">
          <Icon name="search" size={13} />
          <input
            value={query}
            aria-label="Search history"
            placeholder={tab === "threads" ? "Search threads…" : "Search changes…"}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="lattice-history-list">
          {tab === "threads" ? (
            threads.length > 0 ? threads.map((thread) => (
              <div className="lattice-history-row" data-current={thread.id === snapshot.threadId || undefined} key={thread.id}>
                <button type="button" className="lattice-history-row-main" onClick={() => onOpenThread(thread.id)}>
                  <span className="lattice-history-title">{thread.title}</span>
                  <span className="lattice-history-meta">
                    <span>{AGENT_LABEL[thread.agentId]}</span>
                    <span>{formatHistoryTime(thread.updatedAt)}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="lattice-history-delete"
                  aria-label={`Delete ${thread.title}`}
                  title="Delete thread"
                  onClick={() => onDeleteThread(thread.id)}
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>
            )) : <p className="lattice-history-empty">No saved threads yet.</p>
          ) : turns.length > 0 ? turns.map((turn) => (
            <article className="lattice-history-turn" key={turn.id}>
              <button type="button" className="lattice-history-turn-head" onClick={() => onOpenThread(turn.threadId)}>
                <span className="lattice-history-title">{turn.prompt}</span>
                <span className="lattice-history-meta">
                  <span>{turn.threadTitle}</span>
                  <span>{formatHistoryTime(turn.createdAt)}</span>
                </span>
              </button>
              {turn.changes.length > 0 ? (
                <>
                  <div className="lattice-history-turn-actions">
                    <button type="button" onClick={() => onOpenTurnDiffs(turn.id)}>Open all diffs</button>
                    <button type="button" onClick={() => onRestoreTurn(turn.id)}>Restore</button>
                  </div>
                  <div className="lattice-history-files">
                    {turn.changes.map((change) => (
                      <button type="button" className="lattice-history-file" key={`${turn.id}:${change.path}`} onClick={() => onOpenDiff(turn.id, change.path)}>
                        <span>{shortPath(change.path)}</span>
                        <span className="lattice-history-stats"><span>+{change.additions}</span><span>−{change.deletions}</span></span>
                      </button>
                    ))}
                  </div>
                </>
              ) : <p className="lattice-history-no-files">No text-file changes recorded.</p>}
            </article>
          )) : <p className="lattice-history-empty">No changes yet.</p>}
        </div>
      </section>
    </div>
  );
}

export function AgentView(props: AgentViewProps) {
  const { snapshot } = props;
  const [draft, setDraft] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [composerHeight, setComposerHeight] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const busy = snapshot.phase === "running" || snapshot.phase === "waiting_permission" || snapshot.phase === "authentication_required";
  const pendingPermission = useMemo(() => {
    for (let index = snapshot.entries.length - 1; index >= 0; index -= 1) {
      const entry = snapshot.entries[index];
      if (entry?.type === "permission" && !entry.resolvedOptionId) return entry;
    }
    return null;
  }, [snapshot.entries]);
  const visibleEntries = useMemo(
    () => snapshot.entries.filter((entry) => !(entry.type === "permission" && !entry.resolvedOptionId)),
    [snapshot.entries],
  );

  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "0px";
    node.style.height = `${Math.min(node.scrollHeight, 200)}px`;
  }, [draft]);

  useLayoutEffect(() => {
    const node = stackRef.current;
    if (!node) return;
    const measure = () => setComposerHeight(Math.ceil(node.getBoundingClientRect().height));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    if (nearBottomRef.current) node.scrollTop = node.scrollHeight;
  }, [snapshot.revision]);

  const send = useCallback(() => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    props.onSend(text);
    textareaRef.current?.focus();
  }, [busy, draft, props]);

  const onScroll = () => {
    const node = scrollRef.current;
    if (!node) return;
    nearBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
  };

  const onStarter = (prompt: string) => {
    setDraft(prompt);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  return (
    <main
      className="lattice-agent-shell"
      aria-label="LaTeX Comfort Agent"
      style={{ "--agent-composer-height": `${composerHeight}px` } as CSSProperties}
    >
      <header className="lattice-agent-header">
        <div className="lattice-agent-heading">
          <span className="lattice-agent-title">{snapshot.title}</span>
          <span className="lattice-agent-badge">{snapshot.agentLabel}</span>
        </div>
        <div className="lattice-agent-header-actions">
          <button type="button" className="lattice-icon-button" aria-label="Session history" title="Session history" onClick={() => setHistoryOpen((value) => !value)}>
            <Icon name="history" size={15} />
          </button>
          <button type="button" className="lattice-icon-button" aria-label="New thread" title="New thread" onClick={props.onNewThread}>
            <Icon name="plus" size={15} />
          </button>
          <button type="button" className="lattice-icon-button" aria-label="Agent settings" title="Agent settings" onClick={props.onOpenSettings}>
            <Icon name="settings" size={15} />
          </button>
        </div>
      </header>

      <div className="lattice-agent-body">
        <div className="lattice-transcript-scroll" ref={scrollRef} onScroll={onScroll}>
          {snapshot.entries.length === 0 ? (
            snapshot.phase === "starting" ? (
              <AgentLoadingSkeleton />
            ) : (
              <AgentEmptyThread context={snapshot.context} bottomInsetPx={composerHeight} onStarter={onStarter} />
            )
          ) : (
            <div className="lattice-timeline">
              {visibleEntries.map((entry) => (
                <AgentEntry key={entry.id} entry={entry} onOpenLocation={props.onOpenLocation} />
              ))}
              {snapshot.phase === "running" ? (
                <div className="lattice-running-row" role="status">
                  <Icon name="spinner" size={13} className="lattice-spin" />
                  <span>{snapshot.agentLabel} is working</span>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <AgentComposer
          snapshot={snapshot}
          draft={draft}
          setDraft={setDraft}
          send={send}
          stackRef={stackRef}
          textareaRef={textareaRef}
          pendingPermission={pendingPermission}
          onCancel={props.onCancel}
          onResolvePermission={props.onResolvePermission}
          onSelectAgent={props.onSelectAgent}
          onSelectConfig={props.onSelectConfig}
          onAuthenticate={props.onAuthenticate}
          onOpenSettings={props.onOpenSettings}
        />
      </div>

      {historyOpen ? (
        <AgentHistoryPopover
          snapshot={snapshot}
          onClose={() => setHistoryOpen(false)}
          onOpenThread={(threadId) => {
            setHistoryOpen(false);
            props.onOpenThread(threadId);
          }}
          onDeleteThread={props.onDeleteThread}
          onOpenDiff={(turnId, path) => {
            setHistoryOpen(false);
            props.onOpenDiff(turnId, path);
          }}
          onOpenTurnDiffs={(turnId) => {
            setHistoryOpen(false);
            props.onOpenTurnDiffs(turnId);
          }}
          onRestoreTurn={props.onRestoreTurn}
        />
      ) : null}
    </main>
  );
}
