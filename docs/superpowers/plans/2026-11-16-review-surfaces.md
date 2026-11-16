# Review Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared review model with three interchangeable presentation adapters: the existing side panel, a stable decoration + CodeLens inline surface, and an experimental Editor Inset Webview surface.

**Architecture:** `EditController` owns the active session, hunk selection, staleness checks and edited text application. A `ReviewSurfaceHost` owns one active presentation adapter and rerenders it from immutable `ReviewViewState`. Stable builds include side panel and native inline; the separate experimental extension includes the Proposed `editorInsets` adapter.

**Tech Stack:** TypeScript, VS Code Extension API, esbuild, React/Vite webview, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-15-latex-comfort-ai-inline-edit-design.md`

## Global Constraints

- The document must not change before the user accepts selected hunks.
- Stable VSIX must not declare `enabledApiProposals` or package the Editor Inset adapter.
- Experimental VSIX uses a different extension id and `enabledApiProposals: ["editorInsets"]`.
- One active review session at a time.
- One active review surface at a time; switching surfaces preserves selected hunks.
- Source selection/diff offsets remain relative to the original selected text.

---

### Task 1: Central review state and actions

**Files:**
- Create: `packages/latex-comfort-ai/src/review/state.ts`
- Create: `packages/latex-comfort-ai/src/review/state.test.ts`
- Modify: `packages/latex-comfort-ai/src/session/controller.ts`
- Modify: `packages/latex-comfort-ai/src/session/controller.test.ts`

**Interfaces:**
- Produces: `ReviewContext`, `ReviewViewState`, `ReviewAction`.
- Produces: `toggleSelectedHunk(selected: ReadonlySet<number>, id: number): Set<number>`.
- `EditController` produces `toggleHunk(id, accepted)`, accepts no explicit hunk list and renders through `ReviewSurface.render(state)`.

- [ ] **Step 1: Write failing state tests** for default-all-selected behavior and immutable toggles.
- [ ] **Step 2: Run tests and confirm missing module failure.**
- [ ] **Step 3: Implement state types and selection helper.**
- [ ] **Step 4: Refactor controller and tests to hold selected hunk ids centrally.**
- [ ] **Step 5: Run tests and typecheck.**

### Task 2: Surface host and selection policy

**Files:**
- Create: `packages/latex-comfort-ai/src/review/surface.ts`
- Create: `packages/latex-comfort-ai/src/review/surface.test.ts`
- Create: `packages/latex-comfort-ai/src/review/presentation.ts`
- Create: `packages/latex-comfort-ai/src/review/presentation.test.ts`

**Interfaces:**
- `ReviewSurface.render(state)`, `ReviewSurface.dispose()`.
- `ReviewSurfaceHost` owns factory callbacks and one active surface.
- `chooseReviewSurface(setting, context, editorInsetAvailable)` returns `sidePanel | nativeInline | editorInset`.

- [ ] **Step 1: Write failing tests for initial surface selection, switching to sidebar without disposing the session, and surface disposal.**
- [ ] **Step 2: Run tests and confirm failure.**
- [ ] **Step 3: Implement surface host and policy.**
- [ ] **Step 4: Run tests.**

### Task 3: Adapt the existing panel

**Files:**
- Create: `packages/latex-comfort-ai/src/review/webview-html.ts`
- Create: `packages/latex-comfort-ai/src/review/panel-surface.ts`
- Delete: `packages/latex-comfort-ai/src/review/panel.ts`
- Modify: `packages/latex-comfort-ai/src/review/protocol.ts`
- Modify: `packages/latex-comfort-ai/src/review/protocol.test.ts`
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/latex-comfort-ai/webview/src/App.tsx`

**Interfaces:**
- Host-to-webview ready state includes selected hunk ids.
- Webview accept no longer supplies the authoritative selection; controller owns it.
- Panel surface emits `ReviewAction` and does not dispose the controller.

- [ ] **Step 1: Write failing protocol/webview conversion tests.**
- [ ] **Step 2: Run tests and confirm failure.**
- [ ] **Step 3: Implement protocol and panel surface.**
- [ ] **Step 4: Update webview to render selected ids and dispatch actions.**
- [ ] **Step 5: Build webview and typecheck.**

### Task 4: Native decoration + CodeLens surface

**Files:**
- Create: `packages/latex-comfort-ai/src/review/native-inline-surface.ts`
- Create: `packages/latex-comfort-ai/src/review/native-inline-layout.ts`
- Create: `packages/latex-comfort-ai/src/review/native-inline-layout.test.ts`
- Modify: `packages/latex-comfort-ai/src/extension.ts`
- Modify: `packages/shared/src/commands.ts`

**Interfaces:**
- Convert hunk offsets into document ranges using the session selection start.
- Register hunk commands that dispatch `toggleHunk` and `accept`.
- Render removed ranges, short insertion previews, and hunk CodeLenses.

- [ ] **Step 1: Write failing offset/range and preview tests.**
- [ ] **Step 2: Run tests and confirm failure.**
- [ ] **Step 3: Implement pure layout helpers.**
- [ ] **Step 4: Implement the VS Code surface and wire commands.**
- [ ] **Step 5: Run tests, typecheck and extension bundle build.**

### Task 5: Experimental Editor Inset surface

**Files:**
- Create: `packages/latex-comfort-ai/src/experimental/extension.ts`
- Create: `packages/latex-comfort-ai/src/experimental/editor-inset-surface.ts`
- Create: `packages/latex-comfort-ai/src/experimental/vscode.proposed.editorInsets.d.ts`
- Create: `packages/latex-comfort-ai-experimental/package.json`
- Create: `packages/latex-comfort-ai-experimental/esbuild.mjs`
- Create: `packages/latex-comfort-ai-experimental/copy-webview.mjs`
- Create: `packages/latex-comfort-ai-experimental/tsconfig.json`
- Create: `packages/latex-comfort-ai-experimental/.vscodeignore`
- Modify: `packages/latex-comfort-ai/src/extension.ts`
- Modify: `packages/latex-comfort-ai/package.json`

**Interfaces:**
- `activateLatexComfort(context, { editorInset: boolean })` wires the shared controller.
- Editor Inset surface creates one Webview inset under the selection and reuses the existing React review.
- Experimental manifest declares `editorInsets`; stable manifest does not.

- [ ] **Step 1: Write failing inset height/fallback tests.**
- [ ] **Step 2: Run tests and confirm failure.**
- [ ] **Step 3: Implement inset layout helper and surface.**
- [ ] **Step 4: Add experimental entry point and package.**
- [ ] **Step 5: Build stable and experimental bundles.**

### Task 6: Final verification and documentation

**Files:**
- Create: `docs/review-surfaces.md`
- Modify: `packages/latex-comfort-ai/package.json`

- [ ] **Step 1: Add the stable review presentation setting.**
- [ ] **Step 2: Document build, enable-proposed-api and fallback behavior.**
- [ ] **Step 3: Run `pnpm test`, `pnpm typecheck`, `pnpm build`.**
- [ ] **Step 4: Package stable and experimental VSIX artifacts.**
- [ ] **Step 5: Commit.**
