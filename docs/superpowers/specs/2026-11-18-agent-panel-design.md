# LaTeX Comfort Agent Panel — Design

**Status:** Approved for implementation

**Date:** 2026-11-18

## Goal

Turn the ACP transport introduced by the OpenCode/Codex integration into a
usable, Lattice-inspired Agent panel without embedding Synara or replacing
either CLI agent's harness.

The first panel release supports one active thread, multiple prompt turns in one
ACP session, streamed messages, tool activity, inline permission requests,
authentication, model selection, cancellation, and editor-selection context.

## Surface Decision

The Agent opens in a `WebviewPanel` beside the active editor.

A WebviewPanel is chosen over a fixed sidebar WebviewView because it:

- preserves Lattice's wide, full-height panel composition;
- can be dragged between editor groups, split, resized, and moved to another
  window more freely than a sidebar view;
- leaves room for the composer footer and readable suggestion rows;
- can later be supplemented by a sidebar view without changing the session
  architecture.

The shared Agent UI state lives in the extension host. The panel can close and
reopen during one extension lifetime without losing the active session.

## Interaction Model

```text
┌────────────────────────────────────┐
│ Thread title ▾       [OpenCode] [+] │
├────────────────────────────────────┤
│                                    │
│  Work on this paper                │
│  [Fix compile errors]              │
│  [Review current section]          │
│                                    │
│  ── conversation ──                │
│  You: ...                          │
│  Agent: ...                        │
│  [Tool] Read main.tex        ✓     │
│  [Permission] Edit main.tex        │
│  [Allow once] [Always] [Reject]    │
│                                    │
├────────────────────────────────────┤
│ [main.tex · selection ×]           │
│ Ask the agent...              [■]   │
│ [Model ▾]                 [status] │
└────────────────────────────────────┘
```

- Header: thread title, agent identity, new-thread action.
- Empty state: project-oriented suggestions, not generic chat copy.
- Timeline: user and assistant messages, collapsed thinking, tool cards,
  notices, permission cards, and errors.
- Composer: multiline, Enter sends, Shift+Enter inserts a newline.
- Composer footer: ACP model/config-option picker and live session status.
- Current editor selection is sent as an optional context block.

## Visual Direction

The layout, density, type scale, state hierarchy, and composer placement follow
Lattice's Agent panel. Colour is mapped to VS Code theme tokens so light, dark,
and high-contrast themes remain usable. Lattice's fixed colour values are not
copied into the component CSS.

Reusable rules:

- compact panel chrome around a comfortable reading surface;
- one accent, one primary ink, one secondary ink;
- status colours only for meaningful state;
- suggestions use compact rows with a leading icon/tile;
- tool activity is part of the timeline rather than a separate log;
- permission is resolved inline, not with a blocking modal;
- composer grows with content and remains anchored at the bottom.

## Architecture

```text
AgentPanel WebviewPanel
    ↕ typed snapshots and actions
AgentPanelController
    ↕
InteractiveAcpSession
    ↕
ACP process (OpenCode or codex-acp)
```

The controller owns the canonical UI snapshot and active ACP session. ACP
processes stay in the extension host, not in the webview.

## ACP Session Requirements

The existing one-shot `runAcpSession` is retained for compatibility. A new
interactive session abstraction provides:

- initialize and protocol validation;
- one `session/new` request;
- repeated `session/prompt` turns;
- streamed `session/update` handling;
- permission responses;
- authentication retry;
- session config option reads and writes;
- `session/cancel`;
- `session/close` on disposal.

The mapping layer retains ACP identifiers and detail that the one-shot output
channel did not need:

- message IDs;
- tool-call IDs;
- tool kinds, statuses, locations, content, and outputs;
- config options;
- session titles;
- notice severity.

Unknown update variants remain non-fatal.

## UI State

The extension host exposes one `AgentUiSnapshot` containing:

- agent id and label;
- phase: idle, starting, ready, running, waiting-for-permission,
  authentication-required, failed;
- ordered timeline entries;
- model/config options and current values;
- pending authentication methods;
- active editor context;
- an optional actionable error.

Timeline entries are typed as user, assistant, thinking, tool, notice,
permission, and error entries. Tool and permission updates replace the existing
entry by stable IDs.

## Actions

The webview can send:

- webview ready;
- submit prompt;
- cancel;
- new thread;
- select agent before a thread starts;
- select model/config option;
- resolve permission;
- authenticate;
- open a file location;
- open Agent settings.

## Error and Security Boundaries

- Agent messages are rendered as text, not injected HTML.
- File locations are validated as workspace-relative or workspace-contained
  before opening.
- Permission cards show the agent-provided tool title and relevant locations.
- CLI installation, authentication, and process-start failures are actionable.
- A closed panel does not terminate a running session.
- Extension deactivation disposes the ACP session and child process.

## Scope

Included:

- one active thread;
- persistent multi-turn ACP session;
- local saved thread history with ACP resume/load when available;
- per-turn workspace checkpoints and native VS Code file diffs;
- Agent panel with empty state and conversation timeline;
- streaming text and thinking;
- tool cards;
- inline permission;
- authentication;
- model/config selection;
- editor selection context;
- cancel and new thread.

Deferred:

- multiple concurrent threads;
- ACP session list;
- thread restore/undo;
- multi-file native diff orchestration;
- multi-agent parallel execution;
- sidebar-specific composition.

## Testing

- Unit-test ACP update mapping and interactive multi-turn prompts.
- Unit-test snapshot reduction for streamed text, tool updates, permissions,
  model changes, and failure states.
- Unit-test webview message validation.
- Render-test important Agent UI states.
- Run typecheck, extension build, webview build, and full test suite.
- Smoke-test OpenCode and Codex through the panel when their CLIs are available.
