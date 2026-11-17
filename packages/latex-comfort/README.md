# LaTeX Comfort

Core quality-of-life improvements for LaTeX writing in VS Code.

## Features

- Compile-problem status bar and Quick Pick navigation.
- Project-scoped Papers view backed by the project `.bib` file.
- Add one paper by DOI, arXiv id, title or BibTeX, then insert `\cite{key}`.
- Contextual bold and emphasis toggles for LaTeX selections.

## Formatting shortcuts

With a non-empty selection in a LaTeX source file:

- `Cmd+B` on macOS, `Ctrl+B` on Windows/Linux toggles `\textbf{...}`.
- `Cmd+I` on macOS, `Ctrl+I` on Windows/Linux toggles `\emph{...}`.
  Existing `\textit{...}` selections are removed too.
- Applying the same shortcut again removes the command. Surrounding
  whitespace stays outside the formatting.

Without a selection, both keys keep their normal VS Code behavior. The
shortcuts can be disabled independently:

- `latexComfort.keybindings.boldOnSelection`
- `latexComfort.keybindings.emphasisOnSelection`

The package also exports the stable selection-context API used by the optional
**LaTeX Comfort AI** companion.
