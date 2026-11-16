# Paper Management MVP Design

**Goal:** Add the smallest useful project-scoped paper library to LaTeX Comfort inside VS Code: list the entries in a project bibliography, search them, resolve and add a paper by DOI/arXiv ID/title, and insert its citation into the active LaTeX document.

**Status:** Proposed. This document defines the first release only. Full-text caching, PDF reading, Zotero database reading, linked libraries, bibliography auditing and AI/agent tools are deliberately later phases.

## Product Position

The feature is a **Bibliography Explorer**, not a port of Lattice's entire Papers workspace.

The project `.bib` remains authoritative. LaTeX Comfort does not introduce a second paper database in the MVP. It reads bibliography files directly, builds an in-memory paper index, and writes additions back to the selected `.bib` with a normal VS Code `WorkspaceEdit`.

This keeps the feature:

- local-first and usable offline for reading/searching;
- compatible with existing LaTeX projects and reference managers;
- easy to remove without leaving application-owned data behind;
- independent of the AI companion extension.

## MVP User Journeys

### Browse and open

1. The user opens a workspace containing a `.bib` file.
2. The **Papers** view lists bibliography entries with title and author/year.
3. Selecting an entry offers **Insert Citation**, **Open Bibliography Entry**, **Copy Citation Key** and, when available, **Open DOI/arXiv**.
4. `LaTeX Comfort: Search Papers` opens a Quick Pick filtered by title, author, key, DOI and arXiv ID.

### Add one paper

1. The user runs **LaTeX Comfort: Add Paper**.
2. The input box accepts a DOI, DOI URL, arXiv ID/URL, or title.
3. The resolver queries Crossref or arXiv and returns one normalized BibTeX record.
4. LaTeX Comfort checks for an existing DOI, arXiv ID, citation key or exact normalized title/year.
5. The user reviews title, authors, year and key, then confirms.
6. The entry is appended to the configured project bibliography through `WorkspaceEdit`.
7. The extension offers to insert `\cite{key}` into the active LaTeX editor.

### Refresh

- The view refreshes when a workspace `.bib` changes.
- A manual **Refresh Papers** command is available.
- If no bibliography can be identified, the view explains how to choose one.

## Scope

### In scope

- Discovery of one primary bibliography for the workspace.
- Read-only parsing of all entries in that bibliography.
- Search through the VS Code Quick Pick.
- Add one reference from DOI, arXiv ID or title.
- Duplicate detection.
- Append-only bibliography writes.
- Citation insertion in `.tex` editors.
- Open bibliography entry at its line.
- Open DOI, arXiv or URL in the browser.
- Copy citation key.
- Configuration for bibliography path and Crossref contact email.

### Out of scope

- Full-text download or Markdown conversion.
- PDF reader or webview paper reader.
- Paper notes.
- Direct `zotero.sqlite` access.
- Batch import or whole-`.bib` paste.
- Linked external `.bib` synchronization.
- Bibliography audit or citation-health checks.
- Citation usage counts across the project.
- Visual BibTeX editor.
- AI provider/agent integration.
- Global cross-workspace library.

## Architecture

```text
VS Code TreeView / Quick Pick / commands
                 │
                 ▼
          PapersController
           ├─ BibliographyLocator
           ├─ BibliographyIndex
           ├─ ReferenceResolver
           └─ CitationInserter
                 │
                 ├─ workspace.fs / TextDocument
                 ├─ WorkspaceEdit
                 └─ Crossref / arXiv HTTP
```

### Core extension ownership

Paper management belongs in `packages/latex-comfort`, not `packages/latex-comfort-ai`. It must work when the AI extension is not installed.

### Bibliography location

`BibliographyLocator` resolves the primary bibliography in this order:

1. `latexComfort.papers.bibliographyPath` when set.
2. The active LaTeX document's `\bibliography{...}` or `\addbibresource{...}` directive.
3. The only `.bib` file in the workspace.
4. Otherwise return an actionable error and let the user run **Select Bibliography**.

Only the primary bibliography is listed in the MVP. Multi-bibliography grouping and linked files are later work.

### Indexing

`BibliographyIndex` parses the current file text into `PaperRecord` values:

```ts
type PaperRecord = {
  key: string;
  entryType: string;
  title: string;
  authors: string;
  firstAuthor: string;
  year: string;
  venue: string;
  doi?: string;
  arxivId?: string;
  url?: string;
  path: string;
  line: number;
};
```

Indexing is in memory and requires no disk cache. A bounded test corpus should confirm acceptable behavior for a 2,000-entry bibliography before adding persistent indexing.

### Parsing

The MVP uses a small pure BibTeX parser derived from Lattice's Apache-2.0 `bib-document.ts`, reduced to:

- entry type and key;
- field spans and raw values;
- `@string` expansion;
- line numbers;
- malformed-entry reporting.

It does not reformat the file. Appending writes one new entry at the end. Existing formatting is preserved.

### Resolution

`ReferenceResolver` detects input type and returns a normalized BibTeX entry plus identity fields.

- DOI: Crossref work metadata/BibTeX endpoint.
- arXiv ID: arXiv API Atom response converted to a `@misc` entry with `eprint`, `archivePrefix` and `url`.
- Title: Crossref title query, followed by a user choice when multiple candidates exist.
- Direct BibTeX paste is accepted as a fallback if it contains exactly one valid entry.

Network behavior:

- 8-second timeout per request.
- Clear errors for offline, 404, rate limit and malformed responses.
- No request during initial listing or search.
- Optional `latexComfort.papers.contactEmail` is sent to Crossref's polite pool.

### Duplicate detection

A candidate is considered existing, in order:

1. same normalized DOI;
2. same versionless arXiv ID;
3. same case-insensitive citation key;
4. exact normalized title plus same year.

Fuzzy title matching is not used in the MVP.

### Writing

The add flow uses `WorkspaceEdit.insert` at the end of the bibliography document. It never serializes or rewrites existing entries.

Command behavior:

- Reject duplicate key.
- Preserve CRLF/LF.
- Insert one blank line before the new entry when needed.
- Keep the editor undoable.
- Refresh only after the edit is applied.

### Citation insertion

`CitationInserter` replaces the active selection, or inserts at the caret, with `\cite{key}`. It only runs for a `.tex` editor whose language id is `latex`.

If the active editor is not LaTeX, the command copies the citation command and shows an informational message instead of editing an unrelated file.

## Error Handling

- Missing bibliography: show a view welcome state and offer **Select Bibliography**.
- Parse failure: keep successfully parsed entries; list file and line in the view message.
- Resolution failure: keep the Add Paper input available; do not write anything.
- Duplicate: offer **Insert Citation** or **Open Existing Entry**.
- Write conflict: use `WorkspaceEdit` against the open document; if the document changed, VS Code rejects the edit and the controller reports it.
- Network failure: no partial bibliography write.

## Testing

Pure tests cover:

- parser fields, braces, quotes, comments, `@string`, malformed entries and line numbers;
- bibliography discovery precedence;
- record extraction, sorting and duplicate detection;
- input-type detection and resolver payload mapping with an injected `fetch`;
- citation insertion text;
- append formatting for LF/CRLF and duplicate keys.

Manual Extension Host smoke tests cover:

- Papers view with zero, one and many `.bib` files;
- add by DOI, arXiv ID and title;
- tree context actions;
- citation insertion;
- refresh after an external `.bib` edit.

No automated Extension Host harness is added in the MVP. The feature controller remains thin and delegates logic to pure modules.

## Success Criteria

- A normal LaTeX workspace with one `.bib` file shows its entries without configuration.
- A user can add a DOI or arXiv paper and cite it in under one minute.
- Existing bibliography formatting is unchanged after adding a paper.
- The feature works with the AI extension disabled.
- No application-owned persistent database is introduced.
- `pnpm test`, `pnpm typecheck` and `pnpm build` pass.

## Later Phases

1. **Import breadth:** batch input, whole `.bib` paste, Better BibTeX export import.
2. **Reading:** full-text fetch, local cache, Markdown/PDF view, notes.
3. **Reference quality:** metadata audit, citation health and broken-citation checks.
4. **Library integration:** Zotero browsing, direct database snapshot support and linked `.bib` review.
5. **AI integration:** selected paper context, citation context and read-only paper tools for the AI companion.
