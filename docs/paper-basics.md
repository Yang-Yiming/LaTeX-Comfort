# Paper Basics

LaTeX Comfort's Papers view is a project-scoped bibliography explorer. It reads the project's BibTeX file and keeps that file as the source of truth; it does not create a separate paper database.

## What it does

- Lists the entries in the project's primary `.bib` file.
- Searches by title, author, citation key, DOI, arXiv id or URL.
- Inserts `\cite{key}` at the caret or over the active selection.
- Opens a citation's bibliography entry at its source line.
- Copies citation keys.
- Opens DOI, arXiv and URL targets in the browser.
- Adds one paper by DOI, DOI URL, arXiv id/URL, title or BibTeX.
- Detects duplicate DOI, arXiv id, citation key and exact title/year matches.
- Preserves the existing bibliography and appends through VS Code's undoable edit API.

## Finding the bibliography

Papers chooses the primary bibliography in this order:

1. `latexComfort.papers.bibliographyPath`.
2. `\bibliography{...}` or `\addbibresource{...}` in the active LaTeX document.
3. The previously selected bibliography while the workspace stays open.
4. The only `.bib` file in the workspace.

If more than one `.bib` file exists and none is named, run **LaTeX Comfort: Select Bibliography**.

## Commands

- **LaTeX Comfort: Add Paper…**
- **LaTeX Comfort: Search Papers**
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

`bibliographyPath` is workspace-relative. `contactEmail` is optional and is sent to Crossref and arXiv for polite API usage.

## Current limits

This first release deliberately does not include:

- full-text downloads or a PDF/Markdown reader;
- paper notes;
- Zotero database browsing;
- linked-library synchronization;
- bibliography auditing or citation-health checks;
- visual BibTeX editing;
- cross-workspace/global libraries.
