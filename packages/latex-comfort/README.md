# LaTeX Comfort

Core quality-of-life improvements for LaTeX writing in VS Code.

> Works alongside **LaTeX Workshop**. LaTeX Comfort adds editing, navigation,
> status and workflow refinements while leaving build, PDF preview, SyncTeX and
> LaTeX Workshop's existing providers in place. It can also be used without it.

## Features

- Contextual bold and emphasis toggles for LaTeX selections.
- Math, environment, comment and `\iffalse` toggles through the command palette
  and the editor's **LaTeX Comfort** context menu.
- Searchable math-symbol palette.
- `/<name>` snippets for common sections, environments, figures, tables,
  citations and formatting commands.
- Live word count for the active file or selection.
- Compile-problem status bar and Quick Pick navigation for errors and warnings,
  including next/previous problem commands.
- Project-scoped Papers view backed by the project `.bib` file.
- Add one paper by DOI, arXiv id, title or BibTeX, then insert `\cite{key}`.

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
- `latexComfort.status.wordCount.enabled`

The package also exports the stable selection-context API used by the optional
**LaTeX Comfort AI** companion.
