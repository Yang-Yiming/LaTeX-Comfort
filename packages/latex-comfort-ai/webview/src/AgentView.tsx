/*
 * Agent panel composition adapted from Lattice's Agent panel shell
 * (Apache-2.0). Copyright 2026 Leonardo and the Lattice contributors.
 * Licensed under the Apache License, Version 2.0.
 * Modified for LaTeX Comfort: native VS Code webview and ACP session state.
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type {
  AgentUiAgentId,
  AgentUiConfigOption,
  AgentUiEntry,
  AgentUiSnapshot,
} from "@latex-comfort/shared";

export interface AgentViewProps {
  snapshot: AgentUiSnapshot;
  onSend(text: string): void;
  onCancel(): void;
  onNewThread(): void;
  onSelectAgent(agentId: AgentUiAgentId): void;
  onSelectConfig(configId: string, value: string): void;
  onSetVisibleModels(values: string[] | null): void;
  onResolvePermission(permissionId: string, optionId?: string): void;
  onAuthenticate(methodId?: string): void;
  onOpenLocation(path: string, line?: number): void;
  onOpenSettings(): void;
}

const SUGGESTIONS = [
  {
    title: "Fix compile errors",
    detail: "Inspect the build and repair the failing LaTeX.",
    icon: "build",
    prompt: "Inspect the current project, find the compile errors, and fix them.",
  },
  {
    title: "Review current section",
    detail: "Check structure, clarity, consistency, and notation.",
    icon: "review",
    prompt: "Review the current section for clarity, structure, and consistency.",
  },
  {
    title: "Check citations",
    detail: "Find missing, unused, or inconsistent references.",
    icon: "cite",
    prompt: "Check the project's citations and bibliography for missing or inconsistent entries.",
  },
  {
    title: "Tighten the prose",
    detail: "Polish the active paragraph without changing its meaning.",
    icon: "edit",
    prompt: "Tighten the current paragraph while preserving its meaning and citations.",
  },
] as const;

const PHASE_LABEL: Record<AgentUiSnapshot["phase"], string> = {
  idle: "Ready",
  starting: "Starting agent",
  ready: "Ready",
  running: "Working",
  waiting_permission: "Waiting for permission",
  authentication_required: "Sign in required",
  failed: "Agent unavailable",
};

function Icon({
  name,
  size = 16,
}: {
  name:
    | "plus"
    | "settings"
    | "chevron"
    | "send"
    | "stop"
    | "check"
    | "error"
    | "spinner"
    | "file"
    | "build"
    | "review"
    | "cite"
    | "edit"
    | "tool"
    | "branch"
    | "search"
    | "close";
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.35,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "plus":
      return <svg {...common}><path d="M8 3v10M3 8h10" /></svg>;
    case "settings":
      return <svg {...common}><circle cx="8" cy="8" r="2.2" /><path d="M8 2.2v1.2M8 12.6v1.2M2.2 8h1.2M12.6 8h1.2M3.9 3.9l.9.9M11.2 11.2l.9.9M12.1 3.9l-.9.9M4.8 11.2l-.9.9" /></svg>;
    case "chevron":
      return <svg {...common}><path d="m5 6 3 3 3-3" /></svg>;
    case "send":
      return <svg {...common}><path d="M3 8h9M8.5 3.5 13 8l-4.5 4.5" /></svg>;
    case "stop":
      return <svg {...common}><rect x="4.5" y="4.5" width="7" height="7" rx="1.2" fill="currentColor" stroke="none" /></svg>;
    case "check":
      return <svg {...common}><path d="m3.5 8 2.7 2.7L12.5 4.5" /></svg>;
    case "error":
      return <svg {...common}><path d="M8 3.2v5.4M8 11.8v.6" /><circle cx="8" cy="8" r="6" /></svg>;
    case "spinner":
      return <svg {...common} className="agent-spin"><path d="M13 8a5 5 0 1 1-1.5-3.6" /></svg>;
    case "file":
      return <svg {...common}><path d="M4.2 2.5h4.5l3 3v8H4.2z" /><path d="M8.7 2.7v3h3" /></svg>;
    case "build":
      return <svg {...common}><path d="M3 12.5h10M4.2 10V6.4l3.8-2 3.8 2V10M5.7 10V7.5h4.6V10" /></svg>;
    case "review":
      return <svg {...common}><path d="M2.5 3.5h11v7h-6l-3 2v-2h-2z" /><path d="M5 6h6M5 8.2h4" /></svg>;
    case "cite":
      return <svg {...common}><path d="M4 3h8v10H4zM6 5.5h4M6 8h4M6 10.5h2.5" /></svg>;
    case "edit":
      return <svg {...common}><path d="m4 11.8.7-2.8 6.1-6.1 2.3 2.3-6.1 6.1zM9.8 3.9l2.3 2.3" /></svg>;
    case "branch":
      return <svg {...common}><circle cx="4.5" cy="3.5" r="1.3" /><circle cx="11.5" cy="4" r="1.3" /><circle cx="11.5" cy="12" r="1.3" /><path d="M4.5 4.8v1.5c0 2 2.4 2.3 4.3 2.7 1.2.3 2.7.8 2.7 2.3V10.7" /></svg>;
    case "search":
      return <svg {...common}><circle cx="7" cy="7" r="4" /><path d="m10 10 3 3" /></svg>;
    case "close":
      return <svg {...common}><path d="m4.5 4.5 7 7M11.5 4.5l-7 7" /></svg>;
    default:
      return <svg {...common}><circle cx="8" cy="8" r="5.2" /><path d="M8 5.5v3.2" /></svg>;
  }
}

function formatLines(location: { path: string; line?: number }): string {
  const file = location.path.split(/[\\/]/).pop() || location.path;
  return location.line ? `${file}:${location.line}` : file;
}

function statusIcon(status?: string) {
  if (status === "completed") return <Icon name="check" size={14} />;
  if (status === "failed") return <Icon name="error" size={14} />;
  if (status === "in_progress" || status === "pending") {
    return <Icon name="spinner" size={14} />;
  }
  return <Icon name="tool" size={14} />;
}

function EntryView({
  entry,
  onResolvePermission,
  onOpenLocation,
}: {
  entry: AgentUiEntry;
  onResolvePermission(permissionId: string, optionId?: string): void;
  onOpenLocation(path: string, line?: number): void;
}) {
  switch (entry.type) {
    case "user":
      return (
        <article className="agent-user-message">
          {entry.contextLabel ? (
            <div className="agent-context-label">
              <Icon name="file" size={12} />
              {entry.contextLabel}
            </div>
          ) : null}
          <p>{entry.text}</p>
        </article>
      );
    case "assistant":
      return (
        <article
          className="agent-assistant-message"
          data-streaming={entry.streaming || undefined}
        >
          <p>{entry.text}</p>
        </article>
      );
    case "thinking":
      return (
        <details className="agent-thinking">
          <summary>Thinking</summary>
          <p>{entry.text}</p>
        </details>
      );
    case "tool": {
      const title = entry.title || entry.name || "Tool call";
      const failed = entry.status === "failed";
      return (
        <details
          className="agent-tool"
          data-status={entry.status}
          open={failed || entry.status === "pending" || entry.status === "in_progress" || undefined}
        >
          <summary>
            <span className={`agent-tool-status${failed ? " is-error" : ""}`}>
              {statusIcon(entry.status)}
            </span>
            <span className="agent-tool-title">{title}</span>
            {entry.kind ? <span className="agent-tool-kind">{entry.kind}</span> : null}
            <span className="agent-tool-chevron"><Icon name="chevron" size={13} /></span>
          </summary>
          {entry.locations?.length ? (
            <div className="agent-tool-locations">
              {entry.locations.map((location, index) => (
                <button
                  type="button"
                  className="agent-location"
                  key={`${location.path}:${location.line ?? 0}:${index}`}
                  onClick={() => onOpenLocation(location.path, location.line)}
                >
                  <Icon name="file" size={12} />
                  {formatLines(location)}
                </button>
              ))}
            </div>
          ) : (
            <p className="agent-tool-empty">No file changes reported for this step.</p>
          )}
        </details>
      );
    }
    case "permission":
      return (
        <section className="agent-permission" aria-label={entry.title}>
          <div className="agent-permission-header">
            <span className="agent-permission-icon">!</span>
            <div>
              <strong>{entry.title}</strong>
              <p>The agent needs permission to continue.</p>
            </div>
          </div>
          {entry.locations?.length ? (
            <div className="agent-tool-locations">
              {entry.locations.map((location, index) => (
                <button
                  type="button"
                  className="agent-location"
                  key={`${location.path}:${location.line ?? 0}:${index}`}
                  onClick={() => onOpenLocation(location.path, location.line)}
                >
                  <Icon name="file" size={12} />
                  {formatLines(location)}
                </button>
              ))}
            </div>
          ) : null}
          {entry.resolvedOptionId ? (
            <p className="agent-permission-resolved">
              {entry.options.find((option) => option.id === entry.resolvedOptionId)?.label ||
                "Decision sent"}
            </p>
          ) : (
            <div className="agent-permission-actions">
              {entry.options.map((option) => {
                const reject = option.kind?.startsWith("reject");
                return (
                  <button
                    type="button"
                    className={reject ? "agent-button quiet" : "agent-button"}
                    key={option.id}
                    onClick={() => onResolvePermission(entry.id, option.id)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      );
    case "notice":
      return (
        <div className="agent-notice" data-severity={entry.severity}>
          <span>{entry.severity === "error" ? <Icon name="error" size={13} /> : "i"}</span>
          {entry.text}
        </div>
      );
    case "error":
      return (
        <div className="agent-error">
          <Icon name="error" size={14} />
          <p>{entry.text}</p>
        </div>
      );
  }
}

function EmptyState({
  onSend,
  agentId,
  onSelectAgent,
}: {
  onSend(text: string): void;
  agentId: AgentUiAgentId;
  onSelectAgent(agentId: AgentUiAgentId): void;
}) {
  return (
    <section className="agent-empty" aria-label="Start a new agent thread">
      <div className="agent-empty-agent-switch" role="group" aria-label="Agent">
        <button
          type="button"
          data-active={agentId === "opencode" || undefined}
          onClick={() => onSelectAgent("opencode")}
        >
          OpenCode
        </button>
        <button
          type="button"
          data-active={agentId === "codex" || undefined}
          onClick={() => onSelectAgent("codex")}
        >
          Codex
        </button>
      </div>
      <h2>Work on this paper</h2>
      <p className="agent-empty-copy">
        Ask the agent to inspect the project, repair the build, or revise a section.
      </p>
      <div className="agent-suggestions">
        {SUGGESTIONS.map((suggestion) => (
          <button
            type="button"
            className="agent-suggestion"
            key={suggestion.title}
            onClick={() => onSend(suggestion.prompt)}
          >
            <span className="agent-suggestion-icon">
              <Icon name={suggestion.icon} size={16} />
            </span>
            <span>
              <strong>{suggestion.title}</strong>
              <small>{suggestion.detail}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function providerOf(value: string): string {
  const index = value.indexOf("/");
  return index > 0 ? value.slice(0, index) : "Other";
}

function groupModels(
  options: Array<{ value: string; label: string }>,
): Array<{ provider: string; models: Array<{ value: string; label: string }> }> {
  const groups = new Map<string, Array<{ value: string; label: string }>>();
  for (const option of options) {
    const provider = providerOf(option.value);
    const models = groups.get(provider) ?? [];
    models.push(option);
    groups.set(provider, models);
  }
  return [...groups.entries()].map(([provider, models]) => ({
    provider: provider === "Other" ? "Models" : provider,
    models,
  }));
}

function ModelPicker({
  options,
  visibleModels,
  phase,
  onChange,
  onSetVisibleModels,
}: {
  options: AgentUiConfigOption[];
  visibleModels?: string[];
  phase: AgentUiSnapshot["phase"];
  onChange(configId: string, value: string): void;
  onSetVisibleModels(values: string[] | null): void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [managing, setManaging] = useState(false);
  const [managerQuery, setManagerQuery] = useState("");
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const model = options.find(
    (option) => option.id === "model" || option.category === "model",
  );
  const allOptions = model?.options ?? [];
  const visibleSet = visibleModels ? new Set(visibleModels) : undefined;
  const visibleOptions = visibleSet
    ? allOptions.filter((option) => visibleSet.has(option.value))
    : allOptions;
  const current =
    allOptions.find((option) => option.value === model?.currentValue)?.label ||
    model?.currentValue ||
    "Default model";
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? visibleOptions.filter(
          (option) =>
            option.label.toLowerCase().includes(needle) ||
            option.value.toLowerCase().includes(needle),
        )
      : visibleOptions;
  }, [query, visibleOptions]);
  const groups = useMemo(() => groupModels(filtered), [filtered]);
  const managerGroups = useMemo(() => {
    const needle = managerQuery.trim().toLowerCase();
    const filteredOptions = needle
      ? allOptions.filter(
          (option) =>
            option.label.toLowerCase().includes(needle) ||
            option.value.toLowerCase().includes(needle),
        )
      : allOptions;
    return groupModels(filteredOptions);
  }, [allOptions, managerQuery]);

  const unavailableLabel =
    phase === "starting"
      ? "Loading models…"
      : phase === "authentication_required"
        ? "Sign in to load models"
        : phase === "failed"
          ? "Models unavailable"
          : "Default model";

  const openManager = () => {
    setManagerQuery("");
    setSelection(new Set(visibleModels ?? allOptions.map((option) => option.value)));
    setOpen(false);
    setManaging(true);
  };

  const toggleSelection = (value: string) => {
    setSelection((previous) => {
      const next = new Set(previous);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const saveManager = () => {
    if (selection.size === 0) return;
    const allSelected = selection.size === allOptions.length;
    onSetVisibleModels(allSelected ? null : [...selection]);
    setManaging(false);
  };

  if (!model) {
    return (
      <span className="agent-model-label" data-state={phase}>
        {phase === "starting" ? <Icon name="spinner" size={12} /> : null}
        {unavailableLabel}
      </span>
    );
  }

  return (
    <div className="agent-model-picker">
      <button
        type="button"
        className="agent-model-trigger"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{current}</span>
        <Icon name="chevron" size={12} />
      </button>
      {open ? (
        <div className="agent-model-menu" role="menu" aria-label="Model">
          <div className="agent-model-search">
            <Icon name="search" size={13} />
            <input
              value={query}
              aria-label="Search models"
              placeholder="Search models…"
              onChange={(event) => setQuery(event.target.value)}
              autoFocus
            />
          </div>
          <div className="agent-model-options">
            {groups.length > 0 ? (
              groups.map((group) => (
                <div className="agent-model-group" key={group.provider}>
                  <div className="agent-menu-label">{group.provider}</div>
                  {group.models.map((option) => (
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={option.value === model.currentValue}
                      data-active={option.value === model.currentValue || undefined}
                      key={option.value}
                      onClick={() => {
                        setOpen(false);
                        setQuery("");
                        onChange(model.id, option.value);
                      }}
                    >
                      <span>{option.label}</span>
                      {option.value === model.currentValue ? <Icon name="check" size={13} /> : null}
                    </button>
                  ))}
                </div>
              ))
            ) : (
              <p className="agent-model-empty">No models match “{query}”.</p>
            )}
          </div>
          <button
            type="button"
            className="agent-manage-models"
            onClick={openManager}
          >
            <Icon name="settings" size={13} />
            <span>
              Manage visible models
              <small>
                {visibleModels ? `${visibleOptions.length} of ${allOptions.length}` : "All models"}
              </small>
            </span>
            <Icon name="chevron" size={12} />
          </button>
        </div>
      ) : null}

      {managing ? (
        <div
          className="agent-model-overlay"
          role="presentation"
          onMouseDown={() => setManaging(false)}
        >
          <section
            className="agent-model-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Visible models"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="agent-model-dialog-header">
              <div>
                <strong>Visible models</strong>
                <span>Choose what appears in the model selector.</span>
              </div>
              <button
                type="button"
                className="agent-icon-button"
                aria-label="Close model settings"
                onClick={() => setManaging(false)}
              >
                <Icon name="close" size={14} />
              </button>
            </header>
            <div className="agent-model-dialog-tools">
              <label className="agent-model-search is-dialog">
                <Icon name="search" size={13} />
                <input
                  value={managerQuery}
                  aria-label="Search all models"
                  placeholder="Search all models…"
                  onChange={(event) => setManagerQuery(event.target.value)}
                  autoFocus
                />
              </label>
              <button
                type="button"
                className="agent-text-button"
                onClick={() =>
                  setSelection(new Set(allOptions.map((option) => option.value)))
                }
              >
                All
              </button>
              <button
                type="button"
                className="agent-text-button"
                onClick={() => setSelection(new Set())}
              >
                None
              </button>
            </div>
            <div className="agent-model-dialog-list">
              {managerGroups.length > 0 ? (
                managerGroups.map((group) => (
                  <div className="agent-model-group" key={group.provider}>
                    <div className="agent-menu-label">{group.provider}</div>
                    {group.models.map((option) => {
                      const checked = selection.has(option.value);
                      return (
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={checked}
                          className="agent-model-check"
                          data-checked={checked || undefined}
                          key={option.value}
                          onClick={() => toggleSelection(option.value)}
                        >
                          <span className="agent-checkbox">
                            {checked ? <Icon name="check" size={11} /> : null}
                          </span>
                          <span>{option.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ))
              ) : (
                <p className="agent-model-empty">No models match “{managerQuery}”.</p>
              )}
            </div>
            <footer className="agent-model-dialog-footer">
              <span>
                {selection.size} of {allOptions.length} selected
              </span>
              <div>
                <button
                  type="button"
                  className="agent-button quiet"
                  onClick={() => setManaging(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="agent-button"
                  disabled={selection.size === 0}
                  onClick={saveManager}
                >
                  Save
                </button>
              </div>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function AgentErrorBanner({
  snapshot,
  onOpenSettings,
}: {
  snapshot: AgentUiSnapshot;
  onOpenSettings(): void;
}) {
  if (snapshot.phase !== "failed" || !snapshot.error) return null;
  return (
    <section className="agent-auth is-error" aria-label="Agent unavailable">
      <div>
        <strong>Agent unavailable</strong>
        <p>{snapshot.error}</p>
      </div>
      <div className="agent-auth-actions">
        <button type="button" className="agent-button" onClick={onOpenSettings}>
          Open settings
        </button>
      </div>
    </section>
  );
}

function AuthBanner({
  snapshot,
  onAuthenticate,
}: {
  snapshot: AgentUiSnapshot;
  onAuthenticate(methodId?: string): void;
}) {
  if (snapshot.phase !== "authentication_required") return null;
  return (
    <section className="agent-auth" aria-label="Agent sign in required">
      <div>
        <strong>Sign in required</strong>
        <p>{snapshot.agentLabel} needs to sign in before it can continue.</p>
      </div>
      <div className="agent-auth-actions">
        {snapshot.authMethods.length > 0 ? (
          snapshot.authMethods.map((method) => (
            <button
              type="button"
              className="agent-button"
              key={method.id}
              onClick={() => onAuthenticate(method.id)}
            >
              {method.label}
            </button>
          ))
        ) : (
          <button type="button" className="agent-button" onClick={() => onAuthenticate()}>
            Sign in
          </button>
        )}
      </div>
    </section>
  );
}

export function AgentView(props: AgentViewProps) {
  const { snapshot } = props;
  const [draft, setDraft] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const busy =
    snapshot.phase === "running" ||
    snapshot.phase === "waiting_permission" ||
    snapshot.phase === "authentication_required";

  useEffect(() => {
    const node = textarea.current;
    if (!node) return;
    node.style.height = "0px";
    node.style.height = `${Math.min(node.scrollHeight, 160)}px`;
  }, [draft]);

  useEffect(() => {
    const node = list.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [snapshot.revision]);

  const send = () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    props.onSend(text);
    textarea.current?.focus();
  };

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }
    event.preventDefault();
    send();
  };

  return (
    <main className="agent-shell" aria-label="LaTeX Comfort Agent">
      <header className="agent-header">
        <div className="agent-header-title">
          <span className="agent-thread-title">{snapshot.title}</span>
          <span className="agent-agent-pill">{snapshot.agentLabel}</span>
        </div>
        <div className="agent-header-actions">
          <button
            type="button"
            className="agent-icon-button"
            aria-label="New thread"
            title="New thread"
            onClick={() => props.onNewThread()}
          >
            <Icon name="plus" size={15} />
          </button>
          <button
            type="button"
            className="agent-icon-button"
            aria-label="Agent settings"
            title="Agent settings"
            onClick={() => props.onOpenSettings()}
          >
            <Icon name="settings" size={15} />
          </button>
        </div>
      </header>

      <div className="agent-scroll" ref={list}>
        {snapshot.entries.length === 0 ? (
          <EmptyState
            onSend={(text) => {
              if (busy) return;
              props.onSend(text);
            }}
            agentId={snapshot.agentId}
            onSelectAgent={props.onSelectAgent}
          />
        ) : (
          <div className="agent-timeline">
            {snapshot.entries.map((entry) => (
              <EntryView
                entry={entry}
                key={entry.id}
                onResolvePermission={props.onResolvePermission}
                onOpenLocation={props.onOpenLocation}
              />
            ))}
            {snapshot.phase === "running" ? (
              <div className="agent-running" role="status">
                <span className="agent-running-dots"><i /><i /><i /></span>
                {snapshot.agentLabel} is working
              </div>
            ) : null}
          </div>
        )}
      </div>

      <footer className="agent-composer-wrap">
        <AgentErrorBanner
          snapshot={snapshot}
          onOpenSettings={props.onOpenSettings}
        />
        <AuthBanner snapshot={snapshot} onAuthenticate={props.onAuthenticate} />
        {snapshot.context ? (
          <div className="agent-context-chip" title={snapshot.context.selectedText}>
            <Icon name="file" size={12} />
            <span>{snapshot.context.label}</span>
          </div>
        ) : null}
        <div className="agent-composer" data-busy={busy || undefined}>
          <textarea
            ref={textarea}
            rows={1}
            aria-label="Prompt"
            placeholder="Ask the agent to work on this paper..."
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onComposerKeyDown}
          />
          {snapshot.phase === "running" ||
          snapshot.phase === "waiting_permission" ? (
            <button
              type="button"
              className="agent-send-button is-stop"
              aria-label="Stop agent"
              title="Stop agent"
              onClick={() => props.onCancel()}
            >
              <Icon name="stop" size={15} />
            </button>
          ) : (
            <button
              type="button"
              className="agent-send-button"
              aria-label="Send prompt"
              title="Send prompt"
              disabled={!draft.trim() || busy}
              onClick={send}
            >
              <Icon name="send" size={16} />
            </button>
          )}
        </div>
        <div className="agent-composer-footer">
          <ModelPicker
            options={snapshot.configOptions}
            visibleModels={snapshot.visibleModels}
            phase={snapshot.phase}
            onChange={props.onSelectConfig}
            onSetVisibleModels={props.onSetVisibleModels}
          />
          <span className="agent-phase" data-phase={snapshot.phase}>
            {snapshot.phase === "running" || snapshot.phase === "starting" ? (
              <Icon name="spinner" size={12} />
            ) : snapshot.phase === "failed" ? (
              <Icon name="error" size={12} />
            ) : snapshot.phase === "waiting_permission" ? (
              <span className="agent-phase-dot" />
            ) : null}
            {PHASE_LABEL[snapshot.phase]}
          </span>
        </div>
      </footer>
    </main>
  );
}
