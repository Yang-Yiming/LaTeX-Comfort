# LaTeX Comfort AI Experimental

Experimental build of LaTeX Comfort AI for trying the Proposed `editorInsets` review card.

This build uses `enabledApiProposals: ["editorInsets"]` and cannot be published to the Visual Studio Marketplace. It is intended for local installation with a different extension id from the stable build.

Use `latexComfort.ai.review.presentation` to choose between `auto`, `sidePanel`, `inline`, and `editorInset`. The experimental build falls back to native inline review when the Proposed API is unavailable.

Run **LaTeX Comfort AI: Open Agent** to try the ACP Agent panel with OpenCode
or Codex. The panel uses whichever local CLI agent you have installed and
authenticated, and keeps one ACP session alive across multiple turns.
