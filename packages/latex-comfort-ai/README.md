# LaTeX Comfort AI

AI selection editing for LaTeX Comfort.

Select text, run **LaTeX Comfort AI: Edit Selection…**, choose Proofread,
Polish or Rewrite, and review the local word-level diff before applying it.
The document is not modified until you accept.

Configure a provider with **LaTeX Comfort AI: Configure Provider**. API keys are
stored in VS Code SecretStorage.

**LaTeX Comfort AI: Configure Review Surface** switches the selection diff
between the native inline editor, the experimental editor inset, and a side
panel. **LaTeX Comfort AI: Run Agent** sends a one-off prompt to a local CLI
agent and streams progress to an output channel without opening the panel.

This extension requires the **LaTeX Comfort** core extension.

The AI extension was developed with VS Code's built-in AI features (Copilot,
chat, and inline suggestions) turned off, so it may overlap or conflict with
them in places. The core LaTeX Comfort extension does not register any AI or
chat integration and is unaffected either way.

## Agent panel

Run **LaTeX Comfort AI: Open Agent** to open the Agent beside the editor.
Choose OpenCode or Codex, pick the model exposed by the agent, and keep the
same ACP session across multiple turns. Models are loaded as soon as the panel
opens; use **Manage visible models** in the model menu to curate the selector.
Tool activity and permission requests appear inline; stopping or starting a new
thread closes the current ACP session.

Saved threads are stored locally and can be reopened from the history button.
Each completed turn records the text files it changed. Open **History → Changes**
and choose a file to inspect it in VS Code's native diff editor. When the agent
supports ACP `session/resume` or `session/load`, reopening a thread also restores
the agent-side conversation. Agent sessions listed by ACP but not saved locally
appear as remote threads and are loaded on demand.

Each turn can open all of its file diffs or restore the files it changed. Restore
is fail-closed: a file modified after the agent turn is skipped rather than
overwritten.

When a turn changes files, review opens automatically. Added lines are decorated
in place, removed text is shown beside its anchor line, and each hunk gets
**Approve** / **Reject** CodeLens actions. Approve keeps the agent's text;
Reject restores that hunk to its pre-turn content. After every hunk is resolved,
the next changed file opens automatically. Closing the review stops the queue.

The panel uses your locally installed and authenticated CLI agents. OpenCode is
started with `opencode acp`; Codex uses `codex-acp` and the configured Codex
CLI. Paths and default models are available under `latexComfort.ai.agent`.
