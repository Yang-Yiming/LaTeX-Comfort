# LaTeX Comfort AI Inline Edit — Design

**Date:** 2026-11-15  
**Status:** Approved for implementation  
**Plugin split:** `latex-comfort` (core) and `latex-comfort-ai` (AI companion)

## Goal

Add the first AI feature to LaTeX Comfort: select text, choose Proofread, Polish or a custom Rewrite instruction, review a Lattice-inspired word-level diff in a VS Code webview, then accept chosen edits or discard the suggestion.

## Product behavior

1. User selects text in a LaTeX, Markdown or plain-text editor.
2. User runs `latexComfort.ai.editSelection` from the editor context menu or `Cmd+Alt+K` / `Ctrl+Alt+K`.
3. A QuickPick offers Proofread, Polish and Rewrite.
4. Rewrite asks for a custom instruction with an InputBox.
5. A reusable WebviewPanel opens beside the editor and shows a loading card.
6. The selected AI provider returns a complete replacement string.
7. The extension computes a local token-level diff and groups changed tokens into non-overlapping hunks.
8. The panel renders the original passage with deleted and inserted words, optional mode/instruction metadata, and a list of clickable hunks.
9. The user can toggle individual hunks, accept the kept hunks, accept all, or discard.
10. Accept applies only the kept hunks as one `WorkspaceEdit`; the document is unchanged before acceptance.

## Scope for v0.1

Included:

- One active AI edit session at a time.
- Selection edit only; empty selections are rejected with a clear message.
- Proofread, Polish and Rewrite modes.
- Local word/token diff and per-hunk review.
- `vscode-lm` and OpenAI-compatible providers.
- Provider configuration command using QuickPick, InputBox and SecretStorage.
- Version guard: reject application when the document changed after the request started.
- Lattice-inspired visual language adapted to VS Code theme variables.

Excluded from v0.1:

- Token streaming.
- In-editor decoration diff.
- Multi-file edits.
- Range rebasing.
- Multiple concurrent sessions.
- Custom editors.
- Project-wide context retrieval.
- Protected LaTeX-span validation (planned next).

## Architecture

```text
LaTeX Comfort (core, no AI dependency)
  └── exports versioned core API: getSelectionContext()
          ↑
LaTeX Comfort AI
  ├── command controller
  ├── provider adapters
  ├── local diff engine
  ├── session state
  └── WebviewPanel review UI
          ↑
LaTeX Comfort Bundle (extension pack only)
```

The core extension owns LaTeX-specific knowledge and exports a small versioned API. The AI extension owns all prompting, model access, diff review and preference UI. The AI extension declares a hard `extensionDependencies` relationship on the core extension. The bundle is installation convenience only.

## Provider configuration

Settings:

- `latexComfort.ai.provider`: `vscode-lm` or `openai-compatible`
- `latexComfort.ai.baseUrl`: default `https://api.openai.com/v1`
- `latexComfort.ai.model`: string
- `latexComfort.ai.maxChars`: default `12000`
- `latexComfort.ai.temperature`: default `0.2`

Secrets:

- `latexComfort.ai.apiKey` stored with `context.secrets`, never in settings or project files.

The command `latexComfort.ai.configureProvider` guides the user through provider, base URL, model and optional API key. `vscode-lm` requires a user gesture for the first model request and uses the first available model unless `model` selects a family/id.

## Prompt contract

The model receives:

- file path and language id
- instruction
- selected text
- a bounded amount of surrounding context

The model must return only the complete replacement text, with no Markdown fence, commentary or diff. Replies are defensively stripped of fences and reasoning tags. If the reply is empty, the UI reports that no replacement was returned.

## Diff contract

A hunk is `{ id, from, to, insert }` in original-text offsets. Hunks:

- are ordered and non-overlapping;
- include unchanged leading/trailing context only where needed to widen a word;
- treat LaTeX commands and CJK characters as meaningful tokens;
- can be accepted independently;
- are applied using `applyHunks(original, selectedHunks)`.

## UI contract

The webview receives a typed message protocol:

- Extension → webview: `loading`, `ready`, `error`
- Webview → extension: `toggleHunk`, `accept`, `reject`

Ready state includes:

- original text
- proposed text
- hunks
- mode and instruction
- a human-readable model/provider label

The card keeps the Lattice visual vocabulary:

- rounded elevated surface using VS Code widget colors;
- reading-friendly typography;
- red strikethrough deletions;
- green insertion wash;
- small reason/mode label;
- subdued action bar;
- keyboard-accessible toggle controls.

## Error behavior

- Missing selection: explain that text must be selected.
- Missing provider/model: offer the configuration command.
- Document changed: show a stale/error card and refuse to apply.
- Read-only document: refuse to start.
- Provider/network/API failure: show a readable error in the card with a configure/retry path.
- Empty model reply: show an empty-result error without applying anything.

## Testing strategy

TDD for pure logic:

- tokenization for prose, LaTeX commands and CJK text;
- token diff and hunk grouping;
- applying any subset of hunks;
- prompt response cleanup;
- provider setting validation;
- session staleness checks.

Build verification:

- TypeScript typecheck for all packages;
- extension host bundles;
- webview production build.

Integration verification is manual in VS Code with both development extensions installed. Automated VS Code integration tests are deferred until the extension skeleton stabilizes.

## Licensing

The visual treatment is inspired by Lattice (Apache-2.0). Any adapted CSS or component structure must be attributed in `THIRD_PARTY_NOTICES.md`.
