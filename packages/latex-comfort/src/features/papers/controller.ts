import * as vscode from "vscode";
import { PAPER_COMMANDS } from "@latex-comfort/shared";
import { addConfirmationText, candidateQuickPick } from "./add-flow";
import { uniqueCitationKey } from "./citation-key";
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
  private papers: PaperRecord[] = [];
  private generation = 0;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;

  start(): vscode.Disposable[] {
    this.treeView = vscode.window.createTreeView(VIEW_ID, {
      treeDataProvider: this,
      showCollapseAll: false,
    });

    const watcher = vscode.workspace.createFileSystemWatcher("**/*.bib");
    const disposables: vscode.Disposable[] = [
      this,
      this.treeView,
      watcher,
      watcher.onDidCreate(() => this.scheduleRefresh()),
      watcher.onDidChange(() => this.scheduleRefresh()),
      watcher.onDidDelete(() => this.scheduleRefresh()),
      vscode.window.onDidChangeActiveTextEditor(() => this.scheduleRefresh()),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration(`${CONFIG_SECTION}.bibliographyPath`)) this.scheduleRefresh();
      }),
      vscode.commands.registerCommand(PAPER_COMMANDS.refresh, () => this.refresh()),
      vscode.commands.registerCommand(PAPER_COMMANDS.add, () => this.addPaper()),
      vscode.commands.registerCommand(PAPER_COMMANDS.search, () => this.search()),
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
    return this.papers.map((paper, index) => new PaperTreeItem(paper, index));
  }

  dispose(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.changed.dispose();
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      void this.refresh();
    }, 150);
  }

  private async refresh(): Promise<void> {
    const generation = ++this.generation;
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      this.setPapers([], undefined, "Open a workspace folder to use Papers.");
      return;
    }

    try {
      const discovered = (await vscode.workspace.findFiles("**/*.bib", "**/{node_modules,.git}/**", 2000))
        .map((uri) => vscode.workspace.asRelativePath(uri, false).replace(/\\/g, "/"));
      if (generation !== this.generation) return;

      const active = this.activeLatexEditor();
      const configured = vscode.workspace.getConfiguration(CONFIG_SECTION).get<string>("bibliographyPath") ?? "";
      const selected = chooseBibliography({
        configured,
        activeSource: active?.document.getText(),
        activePath: active ? vscode.workspace.asRelativePath(active.document.uri, false).replace(/\\/g, "/") : undefined,
        discovered,
        remembered: this.bibliographyUri
          ? vscode.workspace.asRelativePath(this.bibliographyUri, false).replace(/\\/g, "/")
          : undefined,
      });
      if (!selected) {
        this.setPapers([], undefined, "No project bibliography found. Run LaTeX Comfort: Select Bibliography.");
        return;
      }

      const uri = vscode.Uri.joinPath(folder.uri, ...selected.split("/"));
      const source = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
      if (generation !== this.generation) return;

      const index = buildPaperRecords(selected, source);
      const message = index.errors.length
        ? `Could not read ${selected} at line ${index.errors[0]!.line}.`
        : index.papers.length
          ? undefined
          : `No entries in ${selected}.`;
      this.setPapers(index.papers, uri, message);
    } catch (error) {
      if (generation !== this.generation) return;
      const message = error instanceof Error ? error.message : String(error);
      this.setPapers([], undefined, `Could not read the bibliography: ${message}`);
    }
  }

  private activeLatexEditor(): vscode.TextEditor | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return undefined;
    return editor.document.languageId === "latex" || editor.document.fileName.toLowerCase().endsWith(".tex")
      ? editor
      : undefined;
  }

  private setPapers(papers: PaperRecord[], uri: vscode.Uri | undefined, message: string | undefined): void {
    this.papers = papers;
    this.bibliographyUri = uri;
    if (this.treeView) {
      this.treeView.message = message;
      this.treeView.description = uri ? vscode.workspace.asRelativePath(uri, false) : undefined;
    }
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
    const contactEmail = vscode.workspace.getConfiguration(CONFIG_SECTION).get<string>("contactEmail")?.trim();
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
        await this.refresh();
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
      await this.refresh();

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
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      void vscode.window.showErrorMessage("Open a workspace folder first.");
      return;
    }
    const files = await vscode.workspace.findFiles("**/*.bib", "**/{node_modules,.git}/**", 2000);
    if (!files.length) {
      void vscode.window.showInformationMessage("No .bib files were found in this workspace.");
      return;
    }
    const picked = await vscode.window.showQuickPick(
      files.map((uri) => ({
        label: vscode.workspace.asRelativePath(uri, false),
        uri,
      })),
      { title: "Select Bibliography", placeHolder: "Choose the bibliography used by Papers" },
    );
    if (!picked) return;
    const relative = vscode.workspace.asRelativePath(picked.uri, false).replace(/\\/g, "/");
    await vscode.workspace.getConfiguration(CONFIG_SECTION).update(
      "bibliographyPath",
      relative,
      vscode.ConfigurationTarget.Workspace,
    );
    await this.refresh();
  }
}
