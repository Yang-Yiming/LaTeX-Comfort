# Paper Basics

LaTeX Comfort's Papers view is a project-scoped bibliography explorer. It reads the project's BibTeX file and keeps that file as the source of truth; it does not create a separate paper database.

## What it does

- Lists the entries in the project's primary `.bib` file.
- Searches by title, author, citation key, DOI, arXiv id or URL.
- Completes citation keys while typing common `\cite`-family commands.
- Shows paper metadata when hovering a citation key.
- Jumps from a citation key to its `.bib` entry with Go to Definition.
- Inserts `\cite{key}` at the caret or over the active selection.
- Opens a citation's bibliography entry at its source line.
- Copies citation keys.
- Opens DOI, arXiv and URL targets in the browser.
- Adds one paper by DOI, DOI URL, arXiv id/URL, title or BibTeX.
- Detects duplicate DOI, arXiv id, citation key and exact title/year matches.
- Counts citation use across the workspace folder's `.tex` and `.ltx` files.
- Filters Papers to all, cited or uncited entries.
- Preserves the existing bibliography and appends through VS Code's undoable edit API.

## Finding the bibliography

Papers chooses the primary bibliography in this order:

1. `latexComfort.papers.bibliographyPath`.
2. `\bibliography{...}` or `\addbibresource{...}` in the active LaTeX document.
3. The previously selected bibliography while the workspace stays open.
4. The only `.bib` file in the workspace.

If more than one `.bib` file exists and none is named, run **LaTeX Comfort: Select Bibliography**.

In a multi-root workspace, Papers follows the workspace folder of the active editor. **Select Bibliography** lists `.bib` files from every root and stores the choice in the selected folder's workspace settings.

## Commands

- **LaTeX Comfort: Add Paper…**
- **LaTeX Comfort: Search Papers**
- **LaTeX Comfort: Filter Papers**
- **LaTeX Comfort: Insert Citation**
- **LaTeX Comfort: Open Bibliography Entry**
- **LaTeX Comfort: Copy Citation Key**
- **LaTeX Comfort: Open Paper Link**
- **LaTeX Comfort: Refresh Papers**
- **LaTeX Comfort: Select Bibliography**

## Settings

```json
"latexComfort.papers.bibliographyPath": "",
"latexComfort.papers.contactEmail": ""
```

`bibliographyPath` is workspace-folder-relative. `contactEmail` is optional and is sent to Crossref and arXiv for polite API usage.

## Current limits

Current limits:

- full-text downloads or a PDF/Markdown reader;
- citation-key rename across source files;
- paper notes;
- Zotero database browsing;
- linked-library synchronization;
- bibliography auditing or citation-health checks;
- visual BibTeX editing;
- cross-workspace/global libraries.
