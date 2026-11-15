# LaTeX Comfort AI Inline Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first working AI selection-edit feature with local diff review and configurable providers.

**Architecture:** A pnpm monorepo contains a thin core extension exporting selection context, an AI companion extension, and an extension pack. The AI extension uses a WebviewPanel for Lattice-inspired review, with provider adapters and pure diff/session modules.

**Tech Stack:** TypeScript, VS Code Extension API, esbuild, React, Vite, Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-15-latex-comfort-ai-inline-edit-design.md`

## Global Constraints

- Extension display names: `LaTeX Comfort`, `LaTeX Comfort AI`, `LaTeX Comfort Bundle`.
- Package names: `latex-comfort`, `latex-comfort-ai`, `latex-comfort-bundle`.
- Publisher placeholder: `latex-comfort-dev`; replace before publishing.
- Core must not depend on AI.
- AI declares `extensionDependencies: ["latex-comfort-dev.latex-comfort"]`.
- Selectors: `editorHasSelection && !editorReadonly && editorTextFocus`.
- Keybinding: `Cmd+Alt+K` on macOS, `Ctrl+Alt+K` elsewhere.
- API keys never appear in settings JSON.
- No document mutation before acceptance.
- One active session only.
- v0.1 does not stream tokens.

---

### Task 1: Workspace and shared contracts

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `vitest.config.ts`
- Create: `packages/shared/package.json`
- Create: `packages/shared/src/commands.ts`
- Create: `packages/shared/src/types.ts`
- Create: `packages/shared/src/index.ts`
- Test: `packages/shared/src/commands.test.ts`

**Interfaces:**
- Produces: `COMMANDS.editSelection`, `COMMANDS.configureProvider`
- Produces: `SelectionContext`, `EditMode`, `Hunk`, `ReviewMessage`, `ReviewReadyState`
- Produces: `PROVIDERS`, `DEFAULT_PROVIDER_SETTINGS`

- [ ] Write tests for stable command IDs, provider enum and default settings.
- [ ] Run tests and verify they fail because modules do not exist.
- [ ] Add shared package and workspace configuration.
- [ ] Run tests and verify they pass.
- [ ] Commit.

### Task 2: Core extension API

**Files:**
- Create: `packages/latex-comfort/package.json`
- Create: `packages/latex-comfort/esbuild.mjs`
- Create: `packages/latex-comfort/tsconfig.json`
- Create: `packages/latex-comfort/src/api.ts`
- Create: `packages/latex-comfort/src/extension.ts`
- Test: `packages/latex-comfort/src/api.test.ts`

**Interfaces:**
- Produces: `LatexComfortApi { apiVersion: 1; getSelectionContext(editor): SelectionContext }`
- Consumes: `SelectionContext` from `@latex-comfort/shared`

- [ ] Write a failing test for a non-empty selection context containing URI, range, text, language id and document version.
- [ ] Run test and verify failure.
- [ ] Implement the API and activation export.
- [ ] Run tests and verify pass.
- [ ] Commit.

### Task 3: Diff engine

**Files:**
- Create: `packages/latex-comfort-ai/src/diff/tokenize.ts`
- Create: `packages/latex-comfort-ai/src/diff/tokenize.test.ts`
- Create: `packages/latex-comfort-ai/src/diff/diff.ts`
- Create: `packages/latex-comfort-ai/src/diff/diff.test.ts`
- Create: `packages/latex-comfort-ai/src/diff/apply.ts`
- Create: `packages/latex-comfort-ai/src/diff/apply.test.ts`

**Interfaces:**
- Produces: `tokenize(text): Token[]`
- Produces: `diffHunks(original, proposed): Hunk[]`
- Produces: `applyHunks(original, selected): string`

- [ ] Write failing tests for LaTeX command atomicity, CJK segmentation and plain word changes.
- [ ] Implement tokenization minimally.
- [ ] Write failing tests for ordered non-overlapping hunks and unchanged text producing no hunks.
- [ ] Implement token-level LCS diff and hunk grouping.
- [ ] Write failing tests for accepting all, none and selected hunks.
- [ ] Implement hunk application.
- [ ] Run tests and verify pass.
- [ ] Commit.

### Task 4: Provider configuration and prompt cleanup

**Files:**
- Create: `packages/latex-comfort-ai/package.json`
- Create: `packages/latex-comfort-ai/tsconfig.json`
- Create: `packages/latex-comfort-ai/esbuild.mjs`
- Create: `packages/latex-comfort-ai/src/model/provider.ts`
- Create: `packages/latex-comfort-ai/src/model/config.ts`
- Create: `packages/latex-comfort-ai/src/model/config.test.ts`
- Create: `packages/latex-comfort-ai/src/model/prompt.ts`
- Create: `packages/latex-comfort-ai/src/model/prompt.test.ts`

**Interfaces:**
- Produces: `resolveProviderConfig(settings, secretKey): ProviderConfig`
- Produces: `buildEditPrompt(request): { system, user }`
- Produces: `cleanModelReply(reply): string`

- [ ] Write failing tests for vscode-lm and OpenAI-compatible configuration.
- [ ] Implement config validation.
- [ ] Write failing tests for replacement-only prompt and fenced reply cleanup.
- [ ] Implement prompt and cleanup.
- [ ] Run tests and verify pass.
- [ ] Commit.

### Task 5: Provider adapters

**Files:**
- Create: `packages/latex-comfort-ai/src/model/vscode-lm-provider.ts`
- Create: `packages/latex-comfort-ai/src/model/openai-provider.ts`
- Test: `packages/latex-comfort-ai/src/model/openai-provider.test.ts`
- Test: `packages/latex-comfort-ai/src/model/vscode-lm-provider.test.ts`

**Interfaces:**
- Produces: `EditProvider.complete(request, token): Promise<{ text, label }>`
- Consumes: `ProviderConfig`, `buildEditPrompt`, `cleanModelReply`

- [ ] Write failing adapter tests with injected dependencies.
- [ ] Implement OpenAI-compatible request and response parsing.
- [ ] Implement VS Code language model adapter.
- [ ] Run tests and verify pass.
- [ ] Commit.

### Task 6: Session controller and commands

**Files:**
- Create: `packages/latex-comfort-ai/src/session/session.ts`
- Create: `packages/latex-comfort-ai/src/session/controller.ts`
- Create: `packages/latex-comfort-ai/src/commands.ts`
- Create: `packages/latex-comfort-ai/src/extension.ts`
- Test: `packages/latex-comfort-ai/src/session/session.test.ts`

**Interfaces:**
- Produces: `createEditSession(...)`
- Produces: `isSessionStale(session, document): boolean`
- Produces: command handlers and activation.

- [ ] Write failing tests for session creation, stale detection and accepted-hunk text.
- [ ] Implement session model.
- [ ] Wire command registration, QuickPick and InputBox.
- [ ] Run tests and typecheck.
- [ ] Commit.

### Task 7: Lattice-inspired Webview review

**Files:**
- Create: `packages/latex-comfort-ai/src/review/panel.ts`
- Create: `packages/latex-comfort-ai/src/review/protocol.ts`
- Create: `packages/latex-comfort-ai/webview/index.html`
- Create: `packages/latex-comfort-ai/webview/vite.config.ts`
- Create: `packages/latex-comfort-ai/webview/src/main.tsx`
- Create: `packages/latex-comfort-ai/webview/src/App.tsx`
- Create: `packages/latex-comfort-ai/webview/src/InlineDiff.tsx`
- Create: `packages/latex-comfort-ai/webview/src/theme.css`

**Interfaces:**
- Produces: singleton review panel with `showLoading`, `showReady`, `showError`, `close`
- Webview messages: `toggleHunk`, `accept`, `reject`

- [ ] Write failing tests for message protocol guards.
- [ ] Implement protocol guards.
- [ ] Build the panel and React UI.
- [ ] Run webview build.
- [ ] Commit.

### Task 8: Bundle, documentation and verification

**Files:**
- Create: `packages/latex-comfort-bundle/package.json`
- Create: `README.md`
- Create: `THIRD_PARTY_NOTICES.md`
- Create: `.gitignore`

- [ ] Add extension pack and root documentation.
- [ ] Run install, tests, typecheck and both builds.
- [ ] Fix all failures.
- [ ] Commit.
