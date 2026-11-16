import * as vscode from "vscode";
import { PAPER_COMMANDS } from "@latex-comfort/shared";
import { addConfirmationText, candidateQuickPick } from "./add-flow";
import { uniqueCitationKey } from "./citation-key";
import { citationCompletionContext, citationKeyAtPosition, citationUseCounts } from "./citations";
import { appendEntryText, citationText, renameBibtexKey } from "./edit";
import { chooseBibliography } from "./locator";
import { buildPaperRecords, findDuplicate, type PaperRecord } from "./model";
import {
  detectReferenceInput,
  resolveDoi,
  resolveReference,
  searchTitleCandidates,
  type ResolvedReference,
  type ResolverDeps,
} from "./resolver";
import { paperLinkTarget, paperTreeItem, searchPaperItem } from "./tree";

const VIEW_ID = "latexComfort.papers";
const CONFIG_SECTION = "latexComfort.papers";
const EXCLUDE = "**/{node_modules,.git}/**";

type PaperFilter = "all" | "cited" | "uncited";

class PaperTreeItem extends vscode.TreeItem {
  constructor(
    readonly paper: PaperRecord,
    index: number,
  ) {
    const row = paperTreeItem(paper, index);
    super(row.label, vscode.TreeItemCollapsibleState.None);
    this.description = row.description;
    this.tooltip = row.tooltip;
    this.contextValue = row.contextValue;
    this.iconPath = new vscode.ThemeIcon("book");
    this.command = {
      command: row.command.command,
      title: row.command.title,
      arguments: row.command.arguments,
    };
  }
}

export class PapersController implements vscode.TreeDataProvider<PaperTreeItem>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<PaperTreeItem | undefined>();
  readonly onDidChangeTreeData = this.changed.event;

  private treeView: vscode.TreeView<PaperTreeItem> | undefined;
  private bibliographyUri: vscode.Uri | undefined;
  private currentFolder: vscode.WorkspaceFolder | undefined;
  private papers: PaperRecord[] = [];
  private filter: PaperFilter = "all";
  private generation = 0;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;

  start(): vscode.Disposable[] {
    this.treeView = vscode.window.createTreeView(VIEW_ID, {
      treeDataProvider: this,
      showCollapseAll: false,
    });

    const bibWatcher = vscode.workspace.createFileSystemWatcher("**/*.bib");
    const texWatcher = vscode.workspace.createFileSystemWatcher("**/*.{tex,ltx}");
    const disposables: vscode.Disposable[] = [
      this,
      this.treeView,
      bibWatcher,
      texWatcher,
      bibWatcher.onDidCreate(() => this.scheduleRefresh()),
      bibWatcher.onDidChange(() => this.scheduleRefresh()),
      bibWatcher.onDidDelete(() => this.scheduleRefresh()),
      texWatcher.onDidCreate(() => this.scheduleRefresh()),
      texWatcher.onDidChange(() => this.scheduleRefresh()),
      texWatcher.onDidDelete(() => this.scheduleRefresh()),
      vscode.workspace.onDidSaveTextDocument((document) => {
        if (document.languageId === "latex" || document.fileName.toLowerCase().endsWith(".tex")) {
          this.scheduleRefresh();
        }
      }),
      vscode.window.onDidChangeActiveTextEditor(() => this.scheduleRefresh()),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.scheduleRefresh()),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration(`${CONFIG_SECTION}.bibliographyPath`)) this.scheduleRefresh();
      }),
      vscode.languages.registerCompletionItemProvider(
        { language: "latex" },
        {
          provideCompletionItems: (document, position) => this.provideCompletionItems(document, position),
        },
        "{",
        ",",
        " ",
      ),
      vscode.languages.registerHoverProvider(
        { language: "latex" },
        { provideHover: (document, position) => this.provideHover(document, position) },
      ),
      vscode.languages.registerDefinitionProvider(
        { language: "latex" },
        { provideDefinition: (document, position) => this.provideDefinition(document, position) },
      ),
      vscode.commands.registerCommand(PAPER_COMMANDS.refresh, () => this.refresh()),
      vscode.commands.registerCommand(PAPER_COMMANDS.add, () => this.addPaper()),
      vscode.commands.registerCommand(PAPER_COMMANDS.search, () => this.search()),
      vscode.commands.registerCommand(PAPER_COMMANDS.filter, () => this.chooseFilter()),
      vscode.commands.registerCommand(PAPER_COMMANDS.insertCitation, (paper?: PaperRecord) => this.insertCitation(paper)),
      vscode.commands.registerCommand(PAPER_COMMANDS.openEntry, (paper?: PaperRecord) => this.openEntry(paper)),
      vscode.commands.registerCommand(PAPER_COMMANDS.copyKey, (paper?: PaperRecord) => this.copyKey(paper)),
      vscode.commands.registerCommand(PAPER_COMMANDS.openLink, (paper?: PaperRecord) => this.openLink(paper)),
      vscode.commands.registerCommand(PAPER_COMMANDS.selectBibliography, () => this.selectBibliography()),
    ];

    this.scheduleRefresh();
    return disposables;
  }

  getTreeItem(element: PaperTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): PaperTreeItem[] {
    return this.visiblePapers().map((paper, index) => new PaperTreeItem(paper, index));
  }

  dispose(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.changed.dispose();
  }

  private visiblePapers(): PaperRecord[] {
    if (this.filter === "cited") return this.papers.filter((paper) => (paper.uses ?? 0) > 0);
    if (this.filter === "uncited") return this.papers.filter((paper) => (paper.uses ?? 0) === 0);
    return this.papers;
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      void this.refresh();
    }, 150);
  }

  private async refresh(folderOverride?: vscode.WorkspaceFolder): Promise<void> {
    const generation = ++this.generation;
    const active = this.activeLatexEditor();
    const activeFolder = active ? vscode.workspace.getWorkspaceFolder(active.document.uri) : undefined;
    const folder = folderOverride
      ?? activeFolder
      ?? this.currentFolder
      ?? vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      this.currentFolder = undefined;
      this.setPapers([], undefined, undefined, "Open a workspace folder to use Papers.");
      return;
    }
    this.currentFolder = folder;

    try {
      const discoveredUris = await vscode.workspace.findFiles(
        new vscode.RelativePattern(folder, "**/*.bib"),
        EXCLUDE,
        2000,
      );
      const discovered = discoveredUris.map((uri) => this.relativeToFolder(uri));
      if (generation !== this.generation) return;

      const activeInFolder = active && vscode.workspace.getWorkspaceFolder(active.document.uri)?.uri.toString() === folder.uri.toString()
        ? active
        : undefined;
      const configured = vscode.workspace
        .getConfiguration(CONFIG_SECTION, folder.uri)
        .get<string>("bibliographyPath") ?? "";
      const remembered = this.bibliographyUri
        && vscode.workspace.getWorkspaceFolder(this.bibliographyUri)?.uri.toString() === folder.uri.toString()
        ? this.relativeToFolder(this.bibliographyUri)
        : undefined;
      const selected = chooseBibliography({
        configured,
        activeSource: activeInFolder?.document.getText(),
        activePath: activeInFolder
          ? vscode.workspace.asRelativePath(activeInFolder.document.uri, false).replace(/\\/g, "/")
          : undefined,
        discovered,
        remembered,
      });
      if (!selected) {
        this.setPapers([], undefined, folder, "No project bibliography found. Run LaTeX Comfort: Select Bibliography.");
        return;
      }

      const uri = vscode.Uri.joinPath(folder.uri, ...selected.split("/"));
      const source = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
      const index = buildPaperRecords(selected, source);
      const uses = await this.scanCitationUses(folder);
      if (generation !== this.generation) return;

      const papers = index.papers.map((paper) => ({
        ...paper,
        uses: uses.get(paper.key.toLowerCase()) ?? 0,
      }));
      const message = index.errors.length
        ? `Could not read ${selected} at line ${index.errors[0]!.line}.`
        : papers.length
          ? undefined
          : `No entries in ${selected}.`;
      this.setPapers(papers, uri, folder, message);
    } catch (error) {
      if (generation !== this.generation) return;
      const message = error instanceof Error ? error.message : String(error);
      this.setPapers([], undefined, folder, `Could not read the bibliography: ${message}`);
    }
  }

  private relativeToFolder(uri: vscode.Uri): string {
    return vscode.workspace.asRelativePath(uri, false).replace(/\\/g, "/");
  }

  private async scanCitationUses(folder: vscode.WorkspaceFolder): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    const files = await vscode.workspace.findFiles(
      new vscode.RelativePattern(folder, "**/*.{tex,ltx}"),
      EXCLUDE,
      5000,
    );
    for (let start = 0; start < files.length; start += 32) {
      const texts = await Promise.all(files.slice(start, start + 32).map(async (uri) => {
        try {
          return new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
        } catch {
          return "";
        }
      }));
      for (const text of texts) {
        for (const [key, count] of citationUseCounts(text)) {
          counts.set(key, (counts.get(key) ?? 0) + count);
        }
      }
    }
    return counts;
  }

  private activeLatexEditor(): vscode.TextEditor | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return undefined;
    return editor.document.languageId === "latex" || editor.document.fileName.toLowerCase().endsWith(".tex")
      ? editor
      : undefined;
  }

  private setPapers(
    papers: PaperRecord[],
    uri: vscode.Uri | undefined,
    folder: vscode.WorkspaceFolder | undefined,
    message: string | undefined,
  ): void {
    this.papers = papers;
    this.bibliographyUri = uri;
    this.currentFolder = folder;
    if (this.treeView) {
      this.treeView.message = message;
      this.updateViewDescription();
    }
    this.changed.fire(undefined);
  }

  private updateViewDescription(): void {
    if (!this.treeView) return;
    const folder = this.currentFolder;
    const bibliography = this.bibliographyUri ? this.relativeToFolder(this.bibliographyUri) : "";
    const filter = this.filter === "all" ? "" : this.filter === "cited" ? "Cited" : "Uncited";
    const folderLabel = (vscode.workspace.workspaceFolders?.length ?? 0) > 1 && folder ? folder.name : "";
    this.treeView.description = [folderLabel, bibliography, filter].filter(Boolean).join(" · ") || undefined;
  }

  private paperByKey(key: string): PaperRecord | undefined {
    const normalized = key.toLowerCase();
    return this.papers.find((paper) => paper.key.toLowerCase() === normalized);
  }

  private async ensureLibraryFor(document: vscode.TextDocument): Promise<boolean> {
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!folder) return false;
    if (
      this.currentFolder?.uri.toString() !== folder.uri.toString()
      || !this.bibliographyUri
    ) {
      await this.refresh(folder);
    }
    return Boolean(this.bibliographyUri);
  }

  private async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionItem[]> {
    if (!await this.ensureLibraryFor(document)) return [];
    const prefix = document.lineAt(position.line).text.slice(0, position.character);
    const context = citationCompletionContext(prefix);
    if (!context) return [];
    const query = context.query.toLowerCase();
    const existing = new Set([...context.existingKeys].map((key) => key.toLowerCase()));

    return this.papers
      .filter((paper) => !existing.has(paper.key.toLowerCase()))
      .filter((paper) => !query || paper.haystack.includes(query))
      .sort((left, right) => {
        const leftPrefix = left.key.toLowerCase().startsWith(query) ? 0 : 1;
        const rightPrefix = right.key.toLowerCase().startsWith(query) ? 0 : 1;
        return leftPrefix - rightPrefix
          || left.firstAuthor.localeCompare(right.firstAuthor)
          || right.year.localeCompare(left.year, undefined, { numeric: true })
          || left.title.localeCompare(right.title);
      })
      .map((paper) => {
        const item = new vscode.CompletionItem(paper.key, vscode.CompletionItemKind.Reference);
        item.insertText = paper.key;
        item.filterText = [paper.key, paper.title, paper.authors, paper.year, paper.venue].filter(Boolean).join(" ");
        item.sortText = `${paper.key.toLowerCase().startsWith(query) ? "0" : "1"}${paper.firstAuthor}${paper.year}${paper.key}`;
        item.detail = [paper.title, [paper.firstAuthor, paper.year].filter(Boolean).join(" · ")].filter(Boolean).join(" · ");
        item.documentation = new vscode.MarkdownString([
          `**${paper.title}**`,
          "",
          [paper.authors, paper.year].filter(Boolean).join(" · "),
          paper.venue,
          `Citation key: \`${paper.key}\``,
        ].filter(Boolean).join("\n\n"));
        item.range = new vscode.Range(
          position.line,
          context.replaceFrom,
          position.line,
          position.character,
        );
        return item;
      });
  }

  private async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Hover | undefined> {
    if (!await this.ensureLibraryFor(document)) return;
    const citation = citationKeyAtPosition(document.getText(), document.offsetAt(position));
    const paper = citation ? this.paperByKey(citation.key) : undefined;
    if (!citation || !paper) return;
    const markdown = new vscode.MarkdownString();
    markdown.appendMarkdown(`**${paper.title}**\n\n`);
    if (paper.authors) markdown.appendMarkdown(`${paper.authors}  \n`);
    if (paper.venue || paper.year) {
      markdown.appendMarkdown(`${[paper.venue, paper.year].filter(Boolean).join(" · ")}  \n`);
    }
    markdown.appendMarkdown(`\nCitation key: \`${paper.key}\`  \n`);
    if (paper.doi) markdown.appendMarkdown(`DOI: ${paper.doi}  \n`);
    if (paper.arxivId) markdown.appendMarkdown(`arXiv: ${paper.arxivId}  \n`);
    markdown.appendMarkdown(`Cited ${paper.uses ?? 0} time${paper.uses === 1 ? "" : "s"} in this project.`);
    return new vscode.Hover(
      markdown,
      new vscode.Range(document.positionAt(citation.start), document.positionAt(citation.end)),
    );
  }

  private async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Location | undefined> {
    if (!await this.ensureLibraryFor(document) || !this.bibliographyUri) return;
    const citation = citationKeyAtPosition(document.getText(), document.offsetAt(position));
    const paper = citation ? this.paperByKey(citation.key) : undefined;
    if (!paper) return;
    const line = Math.max(0, paper.line - 1);
    return new vscode.Location(
      this.bibliographyUri,
      new vscode.Range(line, 0, line, 0),
    );
  }

  private async chooseFilter(): Promise<void> {
    const picked = await vscode.window.showQuickPick([
      { label: "All papers", value: "all" as const },
      { label: "Cited in this project", value: "cited" as const },
      { label: "Uncited", value: "uncited" as const },
    ], {
      title: "Filter Papers",
      placeHolder: "Choose which papers to show",
    });
    if (!picked) return;
    this.filter = picked.value;
    this.updateViewDescription();
    this.changed.fire(undefined);
  }

  private async pickPaper(): Promise<PaperRecord | undefined> {
    if (!this.papers.length) {
      void vscode.window.showInformationMessage("No papers are available in the project bibliography.");
      return undefined;
    }
    const picked = await vscode.window.showQuickPick(
      this.papers.map(searchPaperItem),
      {
        title: "Search Papers",
        placeHolder: "Search by title, author, citation key, DOI or arXiv id",
        matchOnDescription: true,
        matchOnDetail: true,
      },
    );
    return picked?.paper;
  }

  private async search(): Promise<void> {
    const paper = await this.pickPaper();
    if (paper) await this.insertCitation(paper);
  }

  private async insertCitation(selected?: PaperRecord): Promise<void> {
    const paper = selected ?? await this.pickPaper();
    if (!paper) return;
    const command = citationText(paper.key);
    const editor = this.activeLatexEditor();
    if (!editor) {
      await vscode.env.clipboard.writeText(command);
      void vscode.window.showInformationMessage(`${command} copied. Open a LaTeX editor to insert it.`);
      return;
    }
    const inserted = await editor.edit((edit) => {
      if (editor.selection.isEmpty) edit.insert(editor.selection.active, command);
      else edit.replace(editor.selection, command);
    });
    if (!inserted) void vscode.window.showErrorMessage(`Could not insert ${command}.`);
  }

  private async openEntry(selected?: PaperRecord): Promise<void> {
    const paper = selected ?? await this.pickPaper();
    if (!paper || !this.bibliographyUri) return;
    const document = await vscode.workspace.openTextDocument(this.bibliographyUri);
    const editor = await vscode.window.showTextDocument(document, { preview: true });
    const line = Math.max(0, paper.line - 1);
    const range = new vscode.Range(line, 0, line, 0);
    editor.selection = new vscode.Selection(range.start, range.start);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  private async copyKey(selected?: PaperRecord): Promise<void> {
    const paper = selected ?? await this.pickPaper();
    if (!paper) return;
    await vscode.env.clipboard.writeText(paper.key);
    void vscode.window.showInformationMessage(`Copied citation key ${paper.key}.`);
  }

  private async openLink(selected?: PaperRecord): Promise<void> {
    const paper = selected ?? await this.pickPaper();
    if (!paper) return;
    const target = paperLinkTarget(paper);
    if (!target) {
      void vscode.window.showInformationMessage("This paper has no DOI, arXiv id or URL.");
      return;
    }
    await vscode.env.openExternal(vscode.Uri.parse(target, true));
  }

  private resolverDeps(controller: AbortController): ResolverDeps {
    const contactEmail = this.currentFolder
      ? vscode.workspace.getConfiguration(CONFIG_SECTION, this.currentFolder.uri).get<string>("contactEmail")?.trim()
      : vscode.workspace.getConfiguration(CONFIG_SECTION).get<string>("contactEmail")?.trim();
    return {
      fetch: (input, init) => globalThis.fetch(input, init),
      signal: controller.signal,
      ...(contactEmail ? { contactEmail } : {}),
    };
  }

  private async addPaper(): Promise<void> {
    const input = await vscode.window.showInputBox({
      title: "Add Paper",
      prompt: "Enter a DOI, arXiv id, paper title, URL or one BibTeX entry.",
      placeHolder: "10.1038/nature14539 or arXiv:1706.03762 or Attention Is All You Need",
      ignoreFocusOut: true,
    });
    if (!input?.trim()) return;

    const latexEditor = this.activeLatexEditor();
    const latexSelection = latexEditor?.selection;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const deps = this.resolverDeps(controller);
      let resolved: ResolvedReference;
      if (detectReferenceInput(input) === "title") {
        const candidates = await searchTitleCandidates(input, deps);
        if (!candidates.length) {
          void vscode.window.showInformationMessage("Crossref did not find a matching paper.");
          return;
        }
        const picked = await vscode.window.showQuickPick(candidateQuickPick(candidates), {
          title: "Choose Paper",
          placeHolder: "Select the paper to add",
          matchOnDescription: true,
          matchOnDetail: true,
        });
        if (!picked) return;
        resolved = { ...(await resolveDoi(picked.candidate.doi, deps)), kind: "title" };
      } else {
        resolved = await resolveReference(input, deps);
      }

      const existing = findDuplicate(this.papers, {
        key: resolved.key,
        title: resolved.title,
        year: resolved.year,
        doi: resolved.doi,
        arxivId: resolved.arxivId,
      });
      if (existing) {
        const action = await vscode.window.showInformationMessage(
          `${existing.title} is already in Papers.`,
          "Insert Citation",
          "Open Bibliography Entry",
        );
        if (action === "Insert Citation") await this.insertCitation(existing);
        if (action === "Open Bibliography Entry") await this.openEntry(existing);
        return;
      }

      const key = uniqueCitationKey(resolved.key, new Set(this.papers.map((paper) => paper.key)));
      if (key !== resolved.key) {
        resolved = { ...resolved, key, bibtex: renameBibtexKey(resolved.bibtex, key) };
      }
      const confirmation = await vscode.window.showWarningMessage(
        addConfirmationText(resolved),
        { modal: true },
        "Add Paper",
      );
      if (confirmation !== "Add Paper") return;

      if (!this.bibliographyUri) {
        await this.refresh(this.currentFolder);
        if (!this.bibliographyUri) {
          void vscode.window.showErrorMessage("Select a project bibliography before adding a paper.");
          return;
        }
      }

      const document = await vscode.workspace.openTextDocument(this.bibliographyUri);
      const before = document.getText();
      const after = appendEntryText(before, resolved.bibtex);
      const edit = new vscode.WorkspaceEdit();
      edit.replace(
        document.uri,
        new vscode.Range(document.positionAt(0), document.positionAt(before.length)),
        after,
      );
      if (!await vscode.workspace.applyEdit(edit)) {
        void vscode.window.showErrorMessage("The bibliography changed and the paper was not added.");
        return;
      }
      await document.save();
      await this.refresh(this.currentFolder);

      const next = await vscode.window.showInformationMessage(
        `Added ${resolved.title}.`,
        "Insert Citation",
      );
      if (next === "Insert Citation") {
        if (latexEditor && !latexEditor.document.isClosed && latexSelection) {
          const editor = await vscode.window.showTextDocument(latexEditor.document, { preview: false });
          editor.selection = latexSelection;
          await editor.edit((builder) => {
            if (latexSelection.isEmpty) builder.insert(latexSelection.active, citationText(resolved.key));
            else builder.replace(latexSelection, citationText(resolved.key));
          });
        } else {
          await vscode.env.clipboard.writeText(citationText(resolved.key));
          void vscode.window.showInformationMessage(`${citationText(resolved.key)} copied.`);
        }
      }
    } catch (error) {
      const message = controller.signal.aborted
        ? "Paper lookup timed out after 8 seconds."
        : error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`Could not add paper: ${message}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async selectBibliography(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (!folders.length) {
      void vscode.window.showErrorMessage("Open a workspace folder first.");
      return;
    }
    const candidates: Array<{ label: string; description?: string; folder: vscode.WorkspaceFolder; uri: vscode.Uri }> = [];
    for (const folder of folders) {
      const files = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, "**/*.bib"), EXCLUDE, 2000);
      for (const uri of files) {
        candidates.push({
          label: this.relativeToFolder(uri),
          description: folders.length > 1 ? folder.name : undefined,
          folder,
          uri,
        });
      }
    }
    if (!candidates.length) {
      void vscode.window.showInformationMessage("No .bib files were found in this workspace.");
      return;
    }
    const picked = await vscode.window.showQuickPick(candidates, {
      title: "Select Bibliography",
      placeHolder: "Choose the bibliography used by Papers",
      matchOnDescription: true,
    });
    if (!picked) return;
    const relative = this.relativeToFolder(picked.uri);
    await vscode.workspace.getConfiguration(CONFIG_SECTION, picked.folder.uri).update(
      "bibliographyPath",
      relative,
      vscode.ConfigurationTarget.WorkspaceFolder,
    );
    await this.refresh(picked.folder);
  }
}
