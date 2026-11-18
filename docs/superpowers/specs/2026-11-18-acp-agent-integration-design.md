# LaTeX Comfort AI ACP Agent Integration — Design

**Status:** Approved for implementation

**Date:** 2026-11-18

## Goal

Add a minimal, reusable ACP runtime to `latex-comfort-ai` so a user can run
OpenCode or Codex against the open workspace from the VS Code Command Palette,
without replacing the existing selection-edit provider or implementing a new
agent harness.

The first release is intentionally transport-first: one command, one prompt,
streamed output, cancellation, and basic permission prompts. A richer agent
panel is a later layer over the same session events.

## Product Decisions

- Reuse the user's installed CLI agent and its own harness, authentication, and
  tools. Do not implement an agent loop in the extension.
- Use one generic ACP client for both agents.
- Keep the existing `EditProvider` and diff-review flow unchanged.
- Defer chat UI, conversation history, resumable sessions, checkpoints,
  multi-agent runs, model pickers, and agent edit review integration.
- Provide a minimal usable UI now: Command Palette entry, agent picker, prompt
  input, OutputChannel stream, progress notification, and cancellation.

## OpenCode 2 Finding

OpenCode `v2.3.2` still exposes ACP through `opencode acp`. Its ACP server uses
protocol version 1 and supports `session/new`, `session/load`,
`session/resume`, `session/fork`, `session/set_config_option`, `session/prompt`,
and `session/cancel`. The package also provides an `opencode2` bin, but both
bins resolve to the same v2.3.2 CLI.

Consequences:

- OpenCode 2 needs no native adapter.
- The client must tolerate unknown `session/update` variants and additional
  config-option/command updates.
- The default executable is `opencode`, overridable by setting.

## Codex Finding

Codex is connected through `@agentclientprotocol/codex-acp`, which is a stdio
ACP server and starts Codex App Server internally. It supports
`CODEX_PATH=/path/to/codex`, allowing the bridge to reuse the user's installed
Codex CLI and existing authentication.

The extension does not install the bridge automatically in this release. It
resolves the bridge from a setting or `PATH` and reports an actionable install
message when absent.

## Architecture

```text
latex-comfort-ai extension host
  AgentRunner
    -> generic AcpSession
       -> spawned ACP agent (OpenCode or codex-acp)
          -> OpenCode service / Codex App Server
    -> AgentEvent stream
       -> OutputChannel now
       -> future agent panel later
```

The ACP runtime is independent of LaTeX-specific editing. The core extension
and existing selection-edit controller are not modified.

## New Interfaces

```ts
type AgentId = "opencode" | "codex";

interface AgentRunRequest {
  agentId: AgentId;
  prompt: string;
  cwd: string;
  token?: vscode.CancellationToken;
}

type AgentEvent =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool"; title: string; status?: string }
  | { type: "notice"; message: string };

interface AgentDefinition {
  id: AgentId;
  label: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  missingCommandMessage: string;
}
```

`AcpSession` owns:

- process spawn and disposal;
- ACP initialize;
- `session/new`;
- one `session/prompt`;
- `session/cancel`;
- permission requests;
- mapping session updates into `AgentEvent`;
- preserving stderr for actionable failures.

The first release creates one session per command invocation and disposes it
after completion. Session reuse is a later feature.

## Command UX

Add:

```text
latexComfort.ai.runAgent
LaTeX Comfort AI: Run Agent
```

Flow:

1. User selects OpenCode or Codex.
2. User enters a prompt.
3. The active workspace folder is the working directory. If no folder is open,
   the active file's directory is used. If neither exists, show an error.
4. Start a VS Code progress notification and append output to a dedicated
   `LaTeX Comfort Agent` OutputChannel.
5. Stream text, thinking, and tool status to the OutputChannel.
6. Report the final result in the progress notification.
7. Cancellation sends ACP `session/cancel` and disposes the process.
8. Extension deactivation disposes every live session.

The command is registered only in `latex-comfort-ai`; no webview is added in
this release.

## Agent Definitions

### OpenCode

```ts
{
  id: "opencode",
  command: "<latexComfort.ai.agent.opencodePath or opencode>",
  args: ["acp"],
}
```

### Codex

```ts
{
  id: "codex",
  command: "<latexComfort.ai.agent.codexAcpPath or codex-acp>",
  args: [],
  env: {
    CODEX_PATH: "<latexComfort.ai.agent.codexPath or codex>",
  },
}
```

`codex-acp` is not bundled or downloaded automatically.

## Configuration

Add these settings under `latexComfort.ai.agent`:

- `opencodePath` — default `opencode`.
- `codexAcpPath` — default `codex-acp`.
- `codexPath` — default `codex`.

Paths are passed directly to `child_process.spawn` with `shell: false`.

## ACP Client Capabilities

The first release advertises only the capabilities required for the command:

- text prompts;
- basic permission requests;
- no client-side filesystem read/write callbacks;
- no client-side terminal callbacks;
- no elicitation UI.

Agents read and edit the workspace using their own tools. Permission requests
are surfaced through VS Code notifications. Every advertised permission option
is shown; a dismissal rejects the request.

Unknown ACP session updates are ignored rather than treated as errors.

## Security and Lifecycle

- Spawn with `shell: false`.
- Use the workspace folder as `cwd`.
- Do not log environment values or API keys.
- Keep stderr in an in-memory bounded tail for failure messages.
- Kill the process tree on cancellation or disposal where the platform allows.
- Dispose all sessions in `ExtensionContext.subscriptions`.
- Do not auto-install `codex-acp` or run package managers at runtime.

## Proposed File Structure

```text
packages/latex-comfort-ai/src/agent/
  definitions.ts
  acp-events.ts
  acp-session.ts
  runner.ts
```

Modify:

```text
packages/latex-comfort-ai/src/activation.ts
packages/latex-comfort-ai/src/commands.ts
packages/latex-comfort-ai/package.json
packages/latex-comfort-ai/esbuild.mjs (only if required by SDK bundling)
```

## Testing

Automated tests cover:

- OpenCode and Codex command/environment construction;
- mapping ACP text, thinking, tool, and unknown updates;
- permission option handling;
- cancellation and disposal behavior;
- missing executable errors with actionable messages.

Integration smoke tests:

- OpenCode `v2.3.2`: initialize, new session, prompt, cancel;
- Codex bridge: initialize, new session, cancel, using `CODEX_PATH` when
  available.

The test suite must not require real model calls in CI. A fake ACP agent
fixture covers process-level protocol behavior.

## Out of Scope

- Full chat panel or webview.
- Multi-turn conversation UI.
- Session persistence or resumption.
- Model, mode, and permission-profile pickers.
- Agent-generated diff review.
- Automatic bridge installation.
- Native Codex App Server or OpenCode SDK adapters.
- Additional agents beyond OpenCode and Codex.

## Acceptance Criteria

- The Command Palette exposes `LaTeX Comfort AI: Run Agent`.
- Selecting OpenCode runs its installed `opencode acp` server.
- Selecting Codex runs `codex-acp` with `CODEX_PATH` pointing at the configured
  Codex executable.
- Text and tool status stream to the OutputChannel.
- Cancellation stops the turn and disposes the process.
- Missing executables produce actionable messages without partially started
  sessions.
- Existing selection editing, provider configuration, and diff review tests
  continue to pass.
