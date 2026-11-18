# LaTeX Comfort AI

AI selection editing for LaTeX Comfort.

Select text, run **LaTeX Comfort AI: Edit Selection…**, choose Proofread,
Polish or Rewrite, and review the local word-level diff before applying it.
The document is not modified until you accept.

Configure a provider with **LaTeX Comfort AI: Configure Provider**. API keys are
stored in VS Code SecretStorage.

This extension requires the **LaTeX Comfort** core extension.

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
the agent-side conversation.

The panel uses your locally installed and authenticated CLI agents. OpenCode is
started with `opencode acp`; Codex uses `codex-acp` and the configured Codex
CLI. Paths and default models are available under `latexComfort.ai.agent`.
