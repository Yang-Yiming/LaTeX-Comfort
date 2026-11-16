# Paper Management MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a project-scoped Papers view that reads a LaTeX project's bibliography, searches its entries, resolves one DOI/arXiv/title reference, appends it to the `.bib`, and inserts `\cite{key}`.

**Architecture:** The core extension owns a thin `PapersController` over pure parser, locator, index and resolver modules. The view uses native VS Code TreeView and Quick Pick APIs; bibliography writes use `WorkspaceEdit`. No webview, external database, full-text cache or AI dependency is introduced.

**Tech Stack:** TypeScript, VS Code Extension API, Node 20 `fetch`, esbuild, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-17-paper-management-mvp-design.md`

## Global Constraints

- Paper management must live in `packages/latex-comfort`, not `packages/latex-comfort-ai`.
- The project `.bib` remains authoritative; do not add an application-owned paper database.
- Existing bibliography text must not be reformatted.
- Network requests happen only during Add Paper, never during list/search.
- Support LF and CRLF bibliography files.
- All command ids use the `latexComfort.papers.` prefix.
- Preserve unrelated working-tree changes; do not revert compile-problem files.
- Use an adapted Lattice parser only with attribution in `THIRD_PARTY_NOTICES.md` and `scripts/check-notices.mjs`.
- Run `pnpm test`, `pnpm typecheck` and `pnpm build` before claiming completion.

---

### Task 1: Minimal BibTeX parser

**Files:**
- Create: `packages/latex-comfort/src/features/papers/bibtex.ts`
- Create: `packages/latex-comfort/src/features/papers/bibtex.test.ts`
- Modify: `THIRD_PARTY_NOTICES.md`
- Modify: `scripts/check-notices.mjs`

**Interfaces:**
- Produces: `parseBibliography(source: string): BibParse`.
- Produces: `entryField(source, entry, name, macros): string`.
- Produces: `BibEntry`, `BibDocument`, `BibParseError`.
- `BibEntry` exposes `type`, `key`, `from`, `to`, `line` and field spans.

- [ ] **Step 1: Write failing parser tests**

```ts
import { describe, expect, it } from "vitest";
import { entryField, parseBibliography } from "./bibtex";

describe("parseBibliography", () => {
  it("reads braced and quoted fields with source lines", () => {
    const source = "@article{a,\n  title = {A {Nested} Title},\n  author = \"Ada Lovelace\",\n  year = 2024\n}\n";
    const parsed = parseBibliography(source);
    expect(parsed.error).toBeNull();
    const entry = parsed.document!.entries[0]!;
    expect(entry.key).toBe("a");
    expect(entry.line).toBe(1);
    expect(entryField(source, entry, "title", parsed.document!.macros)).toBe("A {Nested} Title");
    expect(entryField(source, entry, "author", parsed.document!.macros)).toBe("Ada Lovelace");
  });

  it("expands @string values and skips comments and preambles", () => {
    const source = "@string{conf = \"ICML\"}\n@comment{ignored}\n@inproceedings{x, title={X}, booktitle=conf}\n";
    const parsed = parseBibliography(source);
    expect(parsed.document!.entries).toHaveLength(1);
    expect(entryField(source, parsed.document!.entries[0]!, "booktitle", parsed.document!.macros)).toBe("ICML");
  });
});
```

- [ ] **Step 2: Run the parser test and confirm it fails**

Run: `pnpm vitest run packages/latex-comfort/src/features/papers/bibtex.test.ts`  
Expected: FAIL because `./bibtex` does not exist.

- [ ] **Step 3: Adapt the minimal parser from Lattice**

Copy only the generic parsing logic from `third_party/lattice/src/papers/bib-document.ts`, removing Lingui and paper-specific imports. Keep the original copyright/adaptation header at the top of the file.

- [ ] **Step 4: Add malformed-entry and CRLF tests**

```ts
it("reports an unclosed entry without throwing", () => {
  const parsed = parseBibliography("@article{bad, title={Never closed}\r\n");
  expect(parsed.document).toBeNull();
  expect(parsed.error?.reason).toBe("unclosed");
});

it("keeps line numbers stable with CRLF", () => {
  const parsed = parseBibliography("@misc{a}\r\n\r\n@misc{b}\r\n");
  expect(parsed.document!.entries.map((entry) => entry.line)).toEqual([1, 3]);
});
```

- [ ] **Step 5: Run parser tests and typecheck**

Run: `pnpm vitest run packages/latex-comfort/src/features/papers/bibtex.test.ts`  
Expected: PASS.

Run: `pnpm --filter latex-comfort typecheck`  
Expected: PASS.

- [ ] **Step 6: Add attribution**

Add the new adapted file to `THIRD_PARTY_NOTICES.md` and `scripts/check-notices.mjs`, matching the existing compile-problems pattern.

- [ ] **Step 7: Commit**

```bash
git add packages/latex-comfort/src/features/papers/bibtex.ts \
  packages/latex-comfort/src/features/papers/bibtex.test.ts \
  THIRD_PARTY_NOTICES.md scripts/check-notices.mjs
git commit -m "feat: add bibliography parser"
```

### Task 2: Paper record index and duplicate identity

**Files:**
- Create: `packages/latex-comfort/src/features/papers/model.ts`
- Create: `packages/latex-comfort/src/features/papers/model.test.ts`

**Interfaces:**
- Produces: `PaperRecord`.
- Produces: `buildPaperRecords(path: string, source: string): PaperIndex`.
- Produces: `paperIdentity(paper): PaperIdentity`.
- Produces: `findDuplicate(papers, candidate): PaperRecord | undefined`.
- `PaperIndex` contains `papers`, `errors` and `byKey`.

- [ ] **Step 1: Write failing index tests**

```ts
import { describe, expect, it } from "vitest";
import { buildPaperRecords, findDuplicate, paperIdentity } from "./model";

describe("paper index", () => {
  it("normalizes display fields and preserves the source line", () => {
    const source = "@inproceedings{vaswani2017attention,\n  title={Attention Is All You Need},\n  author={Vaswani, Ashish and Shazeer, Noam},\n  year={2017},\n  booktitle={NeurIPS}\n}\n";
    const index = buildPaperRecords("references.bib", source);
    expect(index.papers[0]).toMatchObject({
      key: "vaswani2017attention",
      title: "Attention Is All You Need",
      firstAuthor: "Vaswani",
      year: "2017",
      venue: "NeurIPS",
      line: 1,
    });
  });

  it("matches duplicate DOI and versionless arXiv ids", () => {
    const existing = { key: "a", doi: "10.1/x", arxivId: "2401.00001", title: "A", year: "2024" } as const;
    expect(findDuplicate([existing as never], { doi: "https://doi.org/10.1/X" })).toBeDefined();
    expect(findDuplicate([existing as never], { arxivId: "2401.00001v3" })).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `pnpm vitest run packages/latex-comfort/src/features/papers/model.test.ts`  
Expected: FAIL because `./model` does not exist.

- [ ] **Step 3: Implement extraction and normalization**

Extract title, author, year, `journal`/`booktitle`/`publisher`, DOI, URL and arXiv identity. Strip outer braces for display, preserve author names for citation-key generation, and sort by first author then year then title.

- [ ] **Step 4: Implement identity matching**

Normalize DOI case and URL prefix, use versionless arXiv ids, compare citation keys case-insensitively, and use exact title normalization plus year only after stronger identifiers fail.

- [ ] **Step 5: Add tests for title fallback, malformed entries and duplicate keys**

```ts
it("does not fuzzy-match different titles", () => {
  const existing = { key: "a", title: "Attention Is All You Need", year: "2017" } as const;
  expect(findDuplicate([existing as never], { title: "Attention Is All You Need Now", year: "2017" })).toBeUndefined();
});
```

- [ ] **Step 6: Run tests and typecheck**

Run: `pnpm vitest run packages/latex-comfort/src/features/papers/model.test.ts`  
Expected: PASS.

Run: `pnpm --filter latex-comfort typecheck`  
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/latex-comfort/src/features/papers/model.ts \
  packages/latex-comfort/src/features/papers/model.test.ts
git commit -m "feat: index bibliography papers"
```

### Task 3: Locate the project bibliography

**Files:**
- Create: `packages/latex-comfort/src/features/papers/locator.ts`
- Create: `packages/latex-comfort/src/features/papers/locator.test.ts`
- Modify: `packages/latex-comfort/package.json`

**Interfaces:**
- Produces: `bibliographyReferences(source: string): string[]`.
- Produces: `chooseBibliography(input): string | undefined`.
- `chooseBibliography` takes configured path, active source, active path and discovered `.bib` paths.

- [ ] **Step 1: Write failing locator tests**

```ts
import { describe, expect, it } from "vitest";
import { bibliographyReferences, chooseBibliography } from "./locator";

describe("bibliography locator", () => {
  it("reads bibliography and biblatex resource commands", () => {
    expect(bibliographyReferences("\\bibliography{refs,extra}")).toEqual(["refs", "extra"]);
    expect(bibliographyReferences("\\addbibresource{references.bib}")).toEqual(["references.bib"]);
  });

  it("prefers configuration, then the active document, then a single bib file", () => {
    expect(chooseBibliography({ configured: "custom.bib", activeSource: "\\bibliography{paper}", activePath: "main.tex", discovered: ["paper.bib"] })).toBe("custom.bib");
    expect(chooseBibliography({ activeSource: "\\bibliography{paper}", activePath: "main.tex", discovered: ["paper.bib", "other.bib"] })).toBe("paper.bib");
    expect(chooseBibliography({ activeSource: "", activePath: "main.tex", discovered: ["only.bib"] })).toBe("only.bib");
  });
});
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `pnpm vitest run packages/latex-comfort/src/features/papers/locator.test.ts`  
Expected: FAIL because `./locator` does not exist.

- [ ] **Step 3: Implement pure path resolution**

Resolve directive paths relative to the active document, strip `%` comments when parsing directives, append `.bib` when omitted, and normalize to workspace-relative paths with `/`.

- [ ] **Step 4: Add the configuration setting**

Add `latexComfort.papers.bibliographyPath` to `packages/latex-comfort/package.json` with an empty default and a description that it is workspace-relative.

- [ ] **Step 5: Run tests and build the manifest**

Run: `pnpm vitest run packages/latex-comfort/src/features/papers/locator.test.ts`  
Expected: PASS.

Run: `pnpm --filter latex-comfort build`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/latex-comfort/src/features/papers/locator.ts \
  packages/latex-comfort/src/features/papers/locator.test.ts \
  packages/latex-comfort/package.json
git commit -m "feat: locate project bibliography"
```

### Task 4: Resolve DOI, arXiv and title inputs

**Files:**
- Create: `packages/latex-comfort/src/features/papers/resolver.ts`
- Create: `packages/latex-comfort/src/features/papers/resolver.test.ts`
- Create: `packages/latex-comfort/src/features/papers/citation-key.ts`
- Create: `packages/latex-comfort/src/features/papers/citation-key.test.ts`
- Modify: `packages/latex-comfort/package.json`

**Interfaces:**
- Produces: `detectReferenceInput(input): "doi" | "arxiv" | "title" | "bibtex"`.
- Produces: `resolveReference(input, deps): Promise<ResolvedReference>`.
- `deps` contains `fetch`, `contactEmail`, `now` and `signal`.
- `ResolvedReference` contains `bibtex`, `key`, `title`, `authors`, `year`, `doi?`, `arxivId?`, `url?`.

- [ ] **Step 1: Write failing input and citation-key tests**

```ts
import { describe, expect, it } from "vitest";
import { detectReferenceInput } from "./resolver";
import { citationKey, uniqueCitationKey } from "./citation-key";

it("detects DOI, arXiv and title inputs", () => {
  expect(detectReferenceInput("https://doi.org/10.1038/nature14539")).toBe("doi");
  expect(detectReferenceInput("arXiv:1706.03762v7")).toBe("arxiv");
  expect(detectReferenceInput("Attention Is All You Need")).toBe("title");
});

it("generates and disambiguates citation keys", () => {
  expect(citationKey({ authors: "Vaswani, Ashish and Shazeer, Noam", title: "Attention Is All You Need", year: "2017" })).toBe("vaswani2017attention");
  expect(uniqueCitationKey("vaswani2017attention", new Set(["vaswani2017attention"]))).toBe("vaswani2017attentionb");
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm vitest run packages/latex-comfort/src/features/papers/resolver.test.ts packages/latex-comfort/src/features/papers/citation-key.test.ts`  
Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Write failing resolver tests with injected fetch**

```ts
it("maps a DOI to one normalized BibTeX record", async () => {
  const fetch = async () => new Response("@article{vaswani2017attention,\n  title={Attention Is All You Need},\n  author={Vaswani, Ashish and Shazeer, Noam},\n  year={2017},\n  doi={10.48550/arXiv.1706.03762}\n}\n", { status: 200 });
  const result = await resolveReference("10.48550/arXiv.1706.03762", { fetch, now: () => 0, signal: new AbortController().signal });
  expect(result.key).toBe("vaswani2017attention");
  expect(result.arxivId).toBe("1706.03762");
});
```

- [ ] **Step 4: Implement DOI resolution**

Use Crossref's BibTeX transform endpoint, require exactly one parsed entry, normalize the key and preserve the returned fields. Add `latexComfort.papers.contactEmail` to the manifest.

- [ ] **Step 5: Implement arXiv resolution**

Fetch `https://export.arxiv.org/api/query?id_list=<id>`, parse the single Atom entry, and create:

```bibtex
@misc{key,
  title = {...},
  author = {...},
  year = {...},
  eprint = {...},
  archivePrefix = {arXiv},
  url = {https://arxiv.org/abs/...}
}
```

- [ ] **Step 6: Implement title resolution**

Query Crossref with `query.title` and `rows=5`; return candidates with title, authors, year, DOI and venue. The command layer selects one candidate before calling the DOI path.

- [ ] **Step 7: Add failure tests**

Cover HTTP 404, 429, malformed JSON/BibTeX, empty arXiv results and timeout using rejected fetches.

- [ ] **Step 8: Run tests and typecheck**

Run: `pnpm vitest run packages/latex-comfort/src/features/papers/resolver.test.ts packages/latex-comfort/src/features/papers/citation-key.test.ts`  
Expected: PASS.

Run: `pnpm --filter latex-comfort typecheck`  
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/latex-comfort/src/features/papers/resolver.ts \
  packages/latex-comfort/src/features/papers/resolver.test.ts \
  packages/latex-comfort/src/features/papers/citation-key.ts \
  packages/latex-comfort/src/features/papers/citation-key.test.ts \
  packages/latex-comfort/package.json
git commit -m "feat: resolve paper metadata"
```

### Task 5: Bibliography append and citation insertion helpers

**Files:**
- Create: `packages/latex-comfort/src/features/papers/edit.ts`
- Create: `packages/latex-comfort/src/features/papers/edit.test.ts`

**Interfaces:**
- Produces: `appendEntryText(existing: string, entry: string): string`.
- Produces: `citationText(key: string): string`.
- Produces: `insertCitationText(source: string, selection: TextRange, key: string): string`.

- [ ] **Step 1: Write failing text tests**

```ts
import { describe, expect, it } from "vitest";
import { appendEntryText, citationText, insertCitationText } from "./edit";

it("appends one entry and preserves CRLF", () => {
  expect(appendEntryText("@misc{a}\r\n", "@misc{b}\r\n")).toBe("@misc{a}\r\n\r\n@misc{b}\r\n");
});

it("inserts a citation at the caret", () => {
  expect(citationText("vaswani2017attention")).toBe("\\cite{vaswani2017attention}");
  expect(insertCitationText("Text here.", { start: { line: 0, character: 5 }, end: { line: 0, character: 5 } }, "a")).toBe("Text \\cite{a}here.");
});
```

- [ ] **Step 2: Run test and confirm failure**

Run: `pnpm vitest run packages/latex-comfort/src/features/papers/edit.test.ts`  
Expected: FAIL because `./edit` does not exist.

- [ ] **Step 3: Implement append and citation helpers**

Reject zero or multiple entries in the appended text, normalize only the final newline, preserve existing trailing whitespace and insert one blank line between entries.

- [ ] **Step 4: Add duplicate-key and trailing-whitespace tests**

```ts
it("rejects an entry whose key already exists", () => {
  expect(() => appendEntryText("@misc{a}\n", "@misc{A}\n")).toThrow(/already exists/i);
});
```

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm vitest run packages/latex-comfort/src/features/papers/edit.test.ts`  
Expected: PASS.

Run: `pnpm --filter latex-comfort typecheck`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/latex-comfort/src/features/papers/edit.ts \
  packages/latex-comfort/src/features/papers/edit.test.ts
git commit -m "feat: add bibliography edit helpers"
```

### Task 6: Papers view and controller

**Files:**
- Create: `packages/latex-comfort/src/features/papers/tree.ts`
- Create: `packages/latex-comfort/src/features/papers/tree.test.ts`
- Create: `packages/latex-comfort/src/features/papers/controller.ts`
- Modify: `packages/latex-comfort/src/extension.ts`
- Modify: `packages/shared/src/commands.ts`
- Modify: `packages/shared/src/commands.test.ts`
- Modify: `packages/latex-comfort/package.json`

**Interfaces:**
- Produces: `PapersTreeProvider` implementing `vscode.TreeDataProvider<PaperTreeItem>`.
- Produces: `paperTreeItem(record, index): PaperTreeItemData`.
- `PapersController.start()` registers commands, watchers and the tree view.
- Commands: `latexComfort.papers.refresh`, `search`, `add`, `insertCitation`, `openEntry`, `copyKey`, `selectBibliography`.

- [ ] **Step 1: Write failing tree-label tests**

```ts
import { describe, expect, it } from "vitest";
import { paperTreeItem } from "./tree";

it("uses the title and author/year as tree labels", () => {
  const item = paperTreeItem({ key: "a", title: "A Paper", firstAuthor: "Ada", year: "2024", entryType: "article", authors: "Ada", venue: "", path: "references.bib", line: 3 }, 0);
  expect(item.label).toBe("A Paper");
  expect(item.description).toBe("Ada · 2024");
  expect(item.contextValue).toBe("paper");
});
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `pnpm vitest run packages/latex-comfort/src/features/papers/tree.test.ts`  
Expected: FAIL because `./tree` does not exist.

- [ ] **Step 3: Implement the tree data adapter**

Use `TreeItem` with `command` set to Insert Citation, set a document icon, attach the full record to the item and expose `paper` context for item-menu commands.

- [ ] **Step 4: Implement `PapersController`**

The controller must:

- discover `.bib` files with `workspace.findFiles`;
- resolve and read the selected bibliography through `workspace.fs`;
- rebuild the index after activation and on `FileSystemWatcher` changes;
- set `TreeView.message` for missing/parse-error states;
- implement search with `showQuickPick`;
- implement open-entry with `showTextDocument` and reveal the entry line;
- implement copy-key with `env.clipboard`;
- implement open-DOI/arXiv/URL with `env.openExternal`;
- register all commands and watchers in `context.subscriptions`.

- [ ] **Step 5: Add command ids and manifest contributions**

Add stable ids to `packages/shared/src/commands.ts`. Add an Explorer view:

```json
{
  "id": "latexComfort.papers",
  "name": "Papers"
}
```

Add `onView:latexComfort.papers` activation and the command/menu contributions. Add these commands to `commandPalette` and item context menus.

- [ ] **Step 6: Wire activation**

Instantiate `PapersController` in `packages/latex-comfort/src/extension.ts` and call `start()` alongside the existing compile-problems controller. Do not replace or refactor the compile-problems feature.

- [ ] **Step 7: Run tests, typecheck and build**

Run: `pnpm vitest run packages/latex-comfort/src/features/papers`  
Expected: PASS.

Run: `pnpm --filter latex-comfort typecheck`  
Expected: PASS.

Run: `pnpm --filter latex-comfort build`  
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/latex-comfort/src/features/papers \
  packages/latex-comfort/src/extension.ts \
  packages/shared/src/commands.ts \
  packages/shared/src/commands.test.ts \
  packages/latex-comfort/package.json
git commit -m "feat: add papers explorer"
```

### Task 7: Add Paper command and write path

**Files:**
- Create: `packages/latex-comfort/src/features/papers/add-flow.ts`
- Create: `packages/latex-comfort/src/features/papers/add-flow.test.ts`
- Modify: `packages/latex-comfort/src/features/papers/controller.ts`
- Modify: `packages/latex-comfort/package.json`

**Interfaces:**
- Produces: `candidateQuickPick(candidates): QuickPickItemLike[]`.
- Produces: `confirmResolvedReference(input): Promise<boolean>`.
- Add flow consumes `resolveReference`, `findDuplicate`, `appendEntryText` and the selected bibliography document.
- Produces: `writeResolvedReference(document, record): Promise<boolean>` in the controller.

- [ ] **Step 1: Write failing candidate formatting tests**

```ts
import { describe, expect, it } from "vitest";
import { candidateQuickPick } from "./add-flow";

it("shows title, authors, year and DOI for a title candidate", () => {
  const [item] = candidateQuickPick([{ title: "A Paper", authors: "Ada Lovelace", year: "2024", doi: "10.1/x" }]);
  expect(item).toMatchObject({ label: "A Paper", description: "Ada Lovelace · 2024", detail: "https://doi.org/10.1/x" });
});
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `pnpm vitest run packages/latex-comfort/src/features/papers/add-flow.test.ts`  
Expected: FAIL because `./add-flow` does not exist.

- [ ] **Step 3: Implement the Add Paper flow**

Flow:

1. `showInputBox` accepts DOI/arXiv/title/BibTeX.
2. Detect input type.
3. Resolve; for title, show up to five candidate Quick Pick rows.
4. Check duplicates and offer Insert Citation or Open Existing Entry.
5. Show a confirmation modal with title, authors, year and key.
6. Open the bibliography document.
7. Insert `appendEntryText` at the end using `WorkspaceEdit`.
8. Save the bibliography document.
9. Offer to insert the citation into the active LaTeX editor.

- [ ] **Step 4: Add duplicate-flow tests**

- Existing DOI: return existing record, never resolve or write.
- Existing arXiv ID: return existing record.
- Existing exact title/year: return existing record.
- Existing key from resolver: call `uniqueCitationKey` before confirmation.

- [ ] **Step 5: Add cancellation tests**

- Cancelled input: no network request.
- Cancelled candidate picker: no write.
- Cancelled confirmation: no write.
- Failed resolution: no write and show the upstream error.

- [ ] **Step 6: Run tests, typecheck and build**

Run: `pnpm vitest run packages/latex-comfort/src/features/papers`  
Expected: PASS.

Run: `pnpm --filter latex-comfort typecheck`  
Expected: PASS.

Run: `pnpm --filter latex-comfort build`  
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/latex-comfort/src/features/papers/add-flow.ts \
  packages/latex-comfort/src/features/papers/add-flow.test.ts \
  packages/latex-comfort/src/features/papers/controller.ts \
  packages/latex-comfort/package.json
git commit -m "feat: add papers from doi arxiv and title"
```

### Task 8: Manual verification, documentation and release gate

**Files:**
- Modify: `packages/latex-comfort/README.md`
- Modify: `README.md`
- Create: `docs/paper-basics.md`

- [ ] **Step 1: Document the MVP**

Document:

- the Papers Explorer;
- supported add inputs;
- bibliography selection order;
- `latexComfort.papers.bibliographyPath`;
- `latexComfort.papers.contactEmail`;
- what remains future work.

- [ ] **Step 2: Create a temporary fixture workspace**

Create a temporary folder outside the repository with:

```text
main.tex
references.bib
```

`main.tex` contains `\bibliography{references}`. `references.bib` contains one entry. Confirm the view lists the entry.

- [ ] **Step 3: Manual smoke test**

Run the Extension Development Host and verify:

- Papers view lists one entry;
- Search Papers filters by key and author;
- Open Bibliography Entry reveals the correct line;
- Copy Citation Key copies the key;
- Insert Citation inserts `\cite{key}` at the caret;
- Add Paper rejects an existing DOI;
- Add Paper appends one new entry with a blank line and saves;
- external edits to `references.bib` refresh the tree.

- [ ] **Step 4: Run full verification**

Run each command from the repository root:

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected: all three commands exit 0.

- [ ] **Step 5: Check scope**

Confirm the implementation contains none of these MVP non-goals:

- `zotero.sqlite` access;
- full-text download;
- Markdown paper cache;
- paper notes;
- bibliography audit;
- linked `.bib` synchronization;
- AI package dependency.

- [ ] **Step 6: Commit**

```bash
git add README.md packages/latex-comfort/README.md docs/paper-basics.md
git commit -m "docs: describe paper basics"
```

## Execution Gate

Do not start implementation until the user approves:

1. the MVP scope in this plan;
2. native TreeView + Quick Pick instead of a webview;
3. project `.bib` as the sole source of truth;
4. deferring full text, Zotero and audit to later phases.
