# LaTeX Comfort

Quality-of-life improvements for LaTeX writing in VS Code.

LaTeX Comfort is designed to work alongside **LaTeX Workshop**: build, PDF preview, SyncTeX and LaTeX Workshop's existing providers stay in place. LaTeX Comfort remains usable without LaTeX Workshop.

This repository contains two extensions and one installation bundle:

- **LaTeX Comfort** (`latex-comfort`) — core LaTeX utilities.
- **LaTeX Comfort AI** (`latex-comfort-ai`) — optional AI selection editing.
- **LaTeX Comfort Bundle** (`latex-comfort-bundle`) — installs both.

The first AI feature is an inline selection editor: select text, choose Proofread, Polish or Rewrite, review a word-level diff, then accept chosen changes or discard them.

The core extension also includes a project-scoped Papers view: browse the project bibliography, search it, add papers by DOI/arXiv/title/BibTeX, and insert citations. See `docs/paper-basics.md`.

## Development

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

Build outputs:

- `packages/latex-comfort/dist/extension.js`
- `packages/latex-comfort-ai/dist/extension.js`
- `packages/latex-comfort-ai/dist/webview/`

To run locally, install both `latex-comfort` and `latex-comfort-ai` as development extensions. The AI extension declares a dependency on the core extension.

## AI provider

Open the command palette and run **LaTeX Comfort AI: Configure Provider**.

Supported providers:

- **VS Code Language Model** — uses models exposed by VS Code chat providers.
- **OpenAI-compatible API** — OpenAI, Ollama, LM Studio, or another compatible endpoint.

API keys are stored in VS Code SecretStorage and are never written to settings or project files.

## Keyboard shortcut

- macOS: `Cmd+Alt+K`
- Windows/Linux: `Ctrl+Alt+K`

The command is also available from the editor context menu and command palette.
