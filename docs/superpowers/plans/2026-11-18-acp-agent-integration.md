# OpenCode and Codex ACP Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add a minimal ACP runtime to `latex-comfort-ai` that runs OpenCode 2 or Codex from the VS Code Command Palette, streams agent output, supports cancellation and basic permissions, and leaves the existing selection-edit flow unchanged.

**Architecture:** One generic ACP client owns a spawned agent process, initialization, one session, prompt/update routing, cancellation, and disposal. Two declarative agent definitions supply the OpenCode and Codex commands. A small command runner supplies VS Code UI and writes agent events to an OutputChannel.

**Tech Stack:** TypeScript, VS Code extension API, `@agentclientprotocol/sdk` 2.7.0, Node `child_process`, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-18-acp-agent-integration-design.md`

## Global Constraints

- Use stable ACP v1: import from `@agentclientprotocol/sdk` without `/unstable` or `/experimental/v2`.
- OpenCode command: `<opencodePath or "opencode"> acp`.
- Codex command: `<codexAcpPath or "codex-acp">`, with `CODEX_PATH=<codexPath or "codex">`.
- Spawn with `shell: false`.
- Do not auto-install `codex-acp`.
- Do not change `EditProvider`, `EditController`, review surfaces, or selection-edit behavior.
- Ignore unknown `session/update` variants.
- Advertise no client-side filesystem, terminal, or elicitation capabilities.
- Create one session per command invocation and dispose it after completion/cancel.
- Never log environment values or credentials.
- Existing tests and typecheck must continue to pass.

---

### Task 1: Agent definitions and ACP update mapping

**Files:**
- Create: `packages/latex-comfort-ai/src/agent/types.ts`
- Create: `packages/latex-comfort-ai/src/agent/definitions.ts`
- Create: `packages/latex-comfort-ai/src/agent/acp-events.ts`
- Test: `packages/latex-comfort-ai/src/agent/definitions.test.ts`
- Test: `packages/latex-comfort-ai/src/agent/acp-events.test.ts`

**Interfaces:**
- Produces: `AgentId`, `AgentDefinition`, `AgentEvent`, `agentDefinitions(settings)`.
- Produces: `mapSessionUpdate(update: unknown): AgentEvent[]`.

- [x] Write failing tests for OpenCode args, Codex args/env, custom paths, and text/thinking/tool/unknown update mapping.
- [x] Run `pnpm exec vitest run packages/latex-comfort-ai/src/agent/definitions.test.ts packages/latex-comfort-ai/src/agent/acp-events.test.ts`; confirm failure because modules do not exist.
- [x] Implement the three modules.
- [x] Re-run the focused tests; confirm pass.
- [x] Commit `feat: add ACP agent definitions and event mapping`.

### Task 2: Generic ACP session and runner

**Files:**
- Create: `packages/latex-comfort-ai/src/agent/acp-session.ts`
- Create: `packages/latex-comfort-ai/src/agent/runner.ts`
- Test: `packages/latex-comfort-ai/src/agent/acp-session.test.ts`

**Interfaces:**
- Consumes: `AgentDefinition`, `AgentEvent`, `mapSessionUpdate`.
- Produces: `runAcpAgent(options): Promise<void>`.
- `runAcpAgent` accepts definition, cwd, prompt, event sink, permission callback, and cancellation signal.

- [x] Write a failing test using the SDK's in-process `client()`/`agent()` pair: initialize, session/new, text prompt, stop, and permission response.
- [x] Run the focused test and confirm it fails.
- [x] Implement `AcpSession` using `ndJsonStream`, `client({ name })`, `connectWith`, `ctx.request(methods.agent.initialize, ...)`, and `ctx.buildSession(cwd).start()`.
- [x] Implement update draining through `ActiveSession.nextUpdate()` and cancellation through `session.prompt` options or `ctx.notify(methods.agent.session.cancel, ...)`.
- [x] Implement permission handling by returning `{ outcome: { outcome: "selected", optionId } }` or `{ outcome: { outcome: "cancelled" } }`.
- [x] Add `runner.ts` process spawning with `shell: false`, bounded stderr tail, cancellation cleanup, and process-tree termination.
- [x] Re-run focused tests; confirm pass.
- [x] Commit `feat: add generic ACP agent session`.

### Task 3: Minimal Command Palette UX and settings

**Files:**
- Modify: `packages/shared/src/commands.ts`
- Modify: `packages/latex-comfort-ai/src/commands.ts`
- Modify: `packages/latex-comfort-ai/src/activation.ts`
- Modify: `packages/latex-comfort-ai/package.json`
- Test: `packages/latex-comfort-ai/src/agent/command.test.ts`

**Interfaces:**
- Consumes: `runAcpAgent`.
- Produces: command ID `latexComfort.ai.runAgent` and command `runAgentCommand`.

- [x] Write failing tests for agent picker labels, missing workspace behavior, and cancellation wiring with injected VS Code dependencies.
- [x] Run the focused test and confirm failure.
- [x] Add the shared command constant and register the command.
- [x] Add an OutputChannel named `LaTeX Comfort Agent`, agent QuickPick, prompt InputBox, progress notification, permission notification, and cancellation.
- [x] Add `latexComfort.ai.agent.opencodePath`, `codexAcpPath`, and `codexPath` settings.
- [x] Re-run focused tests; confirm pass.
- [x] Commit `feat: add Run Agent command for OpenCode and Codex`.

### Task 4: Integration fixture and release verification

**Files:**
- Create: `packages/latex-comfort-ai/src/agent/test-fixtures/fake-acp-agent.mjs`
- Create: `packages/latex-comfort-ai/src/agent/acp-process.test.ts`
- Modify: `packages/latex-comfort-ai/esbuild.mjs` only if SDK bundling requires it.
- Modify: `packages/latex-comfort-ai/package.json` only for the SDK dependency.

**Interfaces:**
- Consumes: `runAcpAgent`.
- Produces: process-level proof that a real stdio child can initialize, prompt, stream, request permission, and exit.

- [x] Write a failing process test that launches the fake ACP agent through `runAcpAgent`.
- [x] Run it and confirm failure.
- [x] Implement the fake agent with the SDK's agent-side API and a minimal prompt/permission flow.
- [x] Re-run the process test; confirm pass.
- [x] Run `pnpm exec vitest run packages/latex-comfort-ai/src/agent`.
- [x] Run `pnpm --filter latex-comfort-ai typecheck`.
- [x] Run `pnpm --filter latex-comfort-ai build`.
- [x] Run the full `pnpm test`.
- [x] Manually smoke test `opencode acp` if available, without sending model requests where possible.
- [x] Commit `test: cover ACP process integration`.


### Task 5: ACP authentication and model selection

**Files:**
- Modify: `packages/latex-comfort-ai/src/agent/acp-session.ts`
- Modify: `packages/latex-comfort-ai/src/agent/command.ts`
- Modify: `packages/latex-comfort-ai/src/commands.ts`
- Modify: `packages/latex-comfort-ai/src/agent/types.ts`
- Test: `packages/latex-comfort-ai/src/agent/acp-session.test.ts`

**Interfaces:**
- Produces: `AgentModelSelection`, `AgentAuthMethod`, `AgentAuthRequest`, `AgentAuthDecision`.
- `runAcpSession` selects a model through `session/set_config_option` and retries one auth-required operation after authentication.

- [x] Write failing tests for model selection and auth-required prompt retry.
- [x] Run the focused tests and confirm failure.
- [x] Implement `auth.terminal` capability advertisement, auth method mapping, and auth retry.
- [x] Implement model config-option parsing, picker callback, and `session/set_config_option`.
- [x] Add optional `opencodeModel` and `codexModel` settings.
- [x] Run focused tests and typecheck; confirm pass.
- [x] Verify a real OpenCode ACP session can select `opencode/deepseek-v4.1-flash-free` and return a prompt response.
