# LaTeX Comfort AI Experimental

Experimental build of LaTeX Comfort AI for trying the Proposed `editorInsets` review card.

This build uses `enabledApiProposals: ["editorInsets"]` and cannot be published to the Visual Studio Marketplace. It is intended for local installation with a different extension id from the stable build.

Use `latexComfort.ai.review.presentation` to choose between `auto`, `sidePanel`, `inline`, and `editorInset`. The experimental build falls back to native inline review when the Proposed API is unavailable.

Run **LaTeX Comfort AI: Open Agent** to try the ACP Agent panel with OpenCode
or Codex. The panel uses whichever local CLI agent you have installed and
authenticated, and keeps one ACP session alive across multiple turns. Models
load before the first prompt; choose one from the compact model menu in the
composer. Images and files can be pasted, dropped, or picked with the **+**
button; the panel only offers content types the connected agent advertises.
Type `@` in the composer to search workspace files with VS Code's
`workspace.findFiles`.

The history button keeps saved threads and records the files changed by each
turn. Open a changed file from **History → Changes** to review it in VS Code's
native diff editor. Threads resume through ACP when the CLI supports session
resume or load, and ACP-only sessions appear in history as remote threads.

A turn can open all changed file diffs or restore its files. Files edited after
the agent turn are skipped instead of overwritten.

Agent replies render as Markdown, including headings, lists, tables, links and
fenced code blocks. A completed turn with file changes opens inline review
automatically, with per-hunk **Approve change** / **Reject change** actions and
an **Approve all** status-bar action. Review advances through every changed file
in order; closing it stops the queue. If a file changed after the turn, its
automatic review is skipped so later user edits are never treated as agent
changes.
