# LaTeX Comfort

Quality-of-life improvements for LaTeX writing in VS Code.

LaTeX Comfort is designed to work alongside **LaTeX Workshop**: build, PDF preview, SyncTeX and LaTeX Workshop's existing providers stay in place. LaTeX Comfort remains usable without LaTeX Workshop.

This repository contains two extensions and one installation bundle:

- **LaTeX Comfort** (`latex-comfort`) — core LaTeX utilities.
- **LaTeX Comfort AI** (`latex-comfort-ai`) — optional AI selection editing.
- **LaTeX Comfort Bundle** (`latex-comfort-bundle`) — installs both.

The core extension also includes a project-scoped Papers view: browse the project bibliography, search it, add papers by DOI/arXiv/title/BibTeX, and insert citations. See `docs/paper-basics.md`.

## AI features

The AI extension currently includes:

- **Selection editing** — select text and run **LaTeX Comfort AI: Edit Selection…** (`Cmd+Alt+K` on macOS, `Ctrl+Alt+K` elsewhere), choose Proofread, Polish or Rewrite, then review a word-level diff and accept or discard individual changes. The document is not modified until you accept.
- **Review surfaces** — **LaTeX Comfort AI: Configure Review Surface** switches the selection diff between the native inline editor, an experimental editor inset, and a side panel. The default (`auto`) picks a surface based on the size of the selection.
- **Providers** — **LaTeX Comfort AI: Configure Provider** connects either VS Code's language models or an OpenAI-compatible endpoint (OpenAI, Ollama, LM Studio, …). API keys are stored in VS Code SecretStorage.
- **Agent panel** — **LaTeX Comfort AI: Open Agent** talks to a locally installed OpenCode or Codex agent over ACP: model selection, inline tool activity and permission requests, saved thread history, remote sessions, per-turn file diffs, and fail-closed restore of the files a turn changed.
- **Run Agent** — **LaTeX Comfort AI: Run Agent** sends a one-off prompt to a local CLI agent and streams progress to an output channel without opening the panel.

The AI extension was developed with VS Code's built-in AI features (Copilot, chat, and inline suggestions) turned off. It may therefore overlap or conflict with them in places, such as how editor decorations, inline review widgets, or chat-style panels are presented.

The core **LaTeX Comfort** extension does not register any AI or chat integration, so it neither depends on nor conflicts with VS Code's built-in AI features whether they are enabled or disabled.

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
