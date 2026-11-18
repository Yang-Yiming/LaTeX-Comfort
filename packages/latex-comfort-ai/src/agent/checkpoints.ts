import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  readdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import nodePath from "node:path";
import * as vscode from "vscode";
import type { AgentUiChangeFile } from "@latex-comfort/shared";
import type {
  AgentCheckpointFileVersions,
  AgentRestoreResult,
  AgentTurnCheckpointService,
  AgentWorkspaceSnapshot,
} from "./history-types";

const DIFF_SCHEME = "latex-comfort-agent-diff";
const MAX_FILE_BYTES = 1_000_000;
const MAX_TOTAL_BYTES = 20_000_000;
const MAX_FILES = 2_000;
const SKIP_DIRECTORIES = new Set([
  ".git",
  ".svn",
  ".hg",
  ".vscode",
  ".idea",
  "node_modules",
  "dist",
  "build",
  "out",
  "target",
  ".cache",
]);
const TEXT_EXTENSIONS = new Set([
  ".tex", ".ltx", ".bib", ".bst", ".sty", ".cls", ".def", ".cfg",
  ".md", ".markdown", ".txt", ".rst", ".json", ".jsonc", ".yaml", ".yml",
  ".toml", ".ini", ".csv", ".tsv", ".tikz", ".pgf", ".svg",
  ".py", ".lua", ".sh", ".zsh", ".bash", ".js", ".mjs", ".cjs", ".ts",
  ".tsx", ".jsx", ".html", ".css", ".scss", ".xml",
]);
const TEXT_NAMES = new Set([
  "Makefile",
  "makefile",
  "Latexmk",
  ".latexmkrc",
  "latexmkrc",
]);

interface StoredCheckpointFile extends AgentUiChangeFile {
  beforeHash?: string;
  afterHash?: string;
}

interface CheckpointManifest {
  turnId: string;
  root: string;
  files: StoredCheckpointFile[];
}

interface FileVersion {
  text: string;
}

function hashContent(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function textCandidate(relativePath: string): boolean {
  const name = nodePath.basename(relativePath);
  if (TEXT_NAMES.has(name)) return true;
  return TEXT_EXTENSIONS.has(nodePath.extname(name).toLowerCase());
}

function addDeleteStats(before: string, after: string): {
  additions: number;
  deletions: number;
} {
  const left = before.length === 0 ? [] : before.split(/\r?\n/);
  const right = after.length === 0 ? [] : after.split(/\r?\n/);
  if (left.length * right.length > 4_000_000) {
    return {
      additions: right.length,
      deletions: left.length,
    };
  }
  let previous = new Uint32Array(right.length + 1);
  for (let i = 1; i <= left.length; i += 1) {
    const current = new Uint32Array(right.length + 1);
    for (let j = 1; j <= right.length; j += 1) {
      current[j] =
        left[i - 1] === right[j - 1]
          ? (previous[j - 1] ?? 0) + 1
          : Math.max(previous[j] ?? 0, current[j - 1] ?? 0);
    }
    previous = current;
  }
  const common = previous[right.length] ?? 0;
  return {
    additions: right.length - common,
    deletions: left.length - common,
  };
}

class AgentDiffContentProvider implements vscode.TextDocumentContentProvider {
  private readonly changed = new vscode.EventEmitter<vscode.Uri>();
  private readonly contents = new Map<string, string>();
  readonly onDidChange = this.changed.event;

  set(uri: vscode.Uri, content: string): void {
    this.contents.set(uri.toString(), content);
    this.changed.fire(uri);
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.toString()) ?? "";
  }

  dispose(): void {
    this.contents.clear();
    this.changed.dispose();
  }
}

export class AgentCheckpointService
  implements AgentTurnCheckpointService, vscode.Disposable
{
  private readonly checkpointsDirectory: string;
  private readonly contentDirectory: string;
  private readonly provider = new AgentDiffContentProvider();
  private readonly providerRegistration: vscode.Disposable;

  constructor(storageRoot: string) {
    this.checkpointsDirectory = nodePath.join(storageRoot, "agent-checkpoints");
    this.contentDirectory = nodePath.join(storageRoot, "agent-content");
    this.providerRegistration =
      vscode.workspace.registerTextDocumentContentProvider(
        DIFF_SCHEME,
        this.provider,
      );
  }

  async capture(workspaceRoot: string): Promise<AgentWorkspaceSnapshot> {
    const files: Record<string, string> = {};
    let totalBytes = 0;
    const walk = async (directory: string, relative: string): Promise<void> => {
      if (Object.keys(files).length >= MAX_FILES || totalBytes >= MAX_TOTAL_BYTES) {
        return;
      }
      const entries = await readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        if (Object.keys(files).length >= MAX_FILES || totalBytes >= MAX_TOTAL_BYTES) {
          return;
        }
        if (entry.isSymbolicLink()) continue;
        const nextRelative = relative
          ? `${relative}/${entry.name}`
          : entry.name;
        const absolute = nodePath.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (
            entry.name.startsWith(".") ||
            SKIP_DIRECTORIES.has(entry.name)
          ) {
            continue;
          }
          await walk(absolute, nextRelative);
          continue;
        }
        if (!entry.isFile() || !textCandidate(nextRelative)) continue;
        try {
          const content = await readFile(absolute);
          if (
            content.length > MAX_FILE_BYTES ||
            totalBytes + content.length > MAX_TOTAL_BYTES ||
            content.includes(0)
          ) {
            continue;
          }
          totalBytes += content.length;
          const hash = hashContent(content);
          files[nextRelative.replaceAll("\\", "/")] = hash;
          await this.writeContent(hash, content);
        } catch {
          // Files can disappear while a turn is running; the next capture catches it.
        }
      }
    };
    await walk(workspaceRoot, "");
    return { root: workspaceRoot, files };
  }

  async complete(
    turnId: string,
    before: AgentWorkspaceSnapshot,
  ): Promise<AgentUiChangeFile[]> {
    const after = await this.capture(before.root);
    const paths = new Set([
      ...Object.keys(before.files),
      ...Object.keys(after.files),
    ]);
    const files: StoredCheckpointFile[] = [];
    for (const filePath of paths) {
      const beforeHash = before.files[filePath];
      const afterHash = after.files[filePath];
      if (beforeHash === afterHash) continue;
      const beforeText = beforeHash ? await this.readContent(beforeHash) : "";
      const afterText = afterHash ? await this.readContent(afterHash) : "";
      const stats = addDeleteStats(beforeText, afterText);
      files.push({
        path: filePath,
        kind: !beforeHash ? "created" : !afterHash ? "deleted" : "modified",
        additions: stats.additions,
        deletions: stats.deletions,
        ...(beforeHash ? { beforeHash } : {}),
        ...(afterHash ? { afterHash } : {}),
      });
    }
    files.sort((a, b) => a.path.localeCompare(b.path));
    if (files.length > 0) {
      await mkdir(this.checkpointsDirectory, { recursive: true });
      const manifest: CheckpointManifest = {
        turnId,
        root: before.root,
        files,
      };
      await writeFile(
        this.manifestPath(turnId),
        `${JSON.stringify(manifest, null, 2)}\n`,
        "utf8",
      );
    }
    return files.map(({ path: filePath, kind, additions, deletions }) => ({
      path: filePath,
      kind,
      additions,
      deletions,
    }));
  }

  async openDiff(turnId: string, filePath: string): Promise<void> {
    const manifest = await this.readManifest(turnId);
    const file = manifest?.files.find((candidate) => candidate.path === filePath);
    if (!manifest || !file) {
      void vscode.window.showWarningMessage(
        "The checkpoint for this file is no longer available.",
      );
      return;
    }
    const beforeText = file.beforeHash
      ? await this.readContent(file.beforeHash)
      : "";
    const afterText = file.afterHash
      ? await this.readContent(file.afterHash)
      : "";
    const beforeUri = vscode.Uri.from({
      scheme: DIFF_SCHEME,
      path: `/${turnId}/before/${file.path}`,
    });
    const afterUri = vscode.Uri.from({
      scheme: DIFF_SCHEME,
      path: `/${turnId}/after/${file.path}`,
    });
    this.provider.set(beforeUri, beforeText);
    this.provider.set(afterUri, afterText);
    await vscode.commands.executeCommand(
      "vscode.diff",
      beforeUri,
      afterUri,
      `${file.path} · Agent ${file.kind}`,
      { preview: false },
    );
  }

  async versions(
    turnId: string,
    filePath: string,
  ): Promise<AgentCheckpointFileVersions | undefined> {
    const manifest = await this.readManifest(turnId);
    const file = manifest?.files.find((candidate) => candidate.path === filePath);
    if (!manifest || !file) return undefined;
    return {
      root: manifest.root,
      absolutePath: nodePath.resolve(manifest.root, file.path),
      beforeText: file.beforeHash
        ? await this.readContent(file.beforeHash)
        : "",
      afterText: file.afterHash
        ? await this.readContent(file.afterHash)
        : "",
    };
  }

  async restoreTurn(turnId: string): Promise<AgentRestoreResult> {
    const manifest = await this.readManifest(turnId);
    if (!manifest) return { restored: 0, skipped: [] };
    let restored = 0;
    const skipped: string[] = [];
    for (const file of manifest.files) {
      const absolute = nodePath.resolve(manifest.root, file.path);
      const relative = nodePath.relative(manifest.root, absolute);
      if (relative.startsWith("..") || nodePath.isAbsolute(relative)) {
        skipped.push(file.path);
        continue;
      }
      const current = await readFile(absolute).catch(() => undefined);
      const currentHash = current ? hashContent(current) : undefined;
      if (currentHash !== file.afterHash) {
        skipped.push(file.path);
        continue;
      }
      if (file.beforeHash) {
        const before = await readFile(this.contentPath(file.beforeHash)).catch(
          () => undefined,
        );
        if (!before) {
          skipped.push(file.path);
          continue;
        }
        await mkdir(nodePath.dirname(absolute), { recursive: true });
        await writeFile(absolute, before);
      } else {
        await unlink(absolute).catch(() => undefined);
      }
      restored += 1;
    }
    return { restored, skipped };
  }

  dispose(): void {
    this.providerRegistration.dispose();
    this.provider.dispose();
  }

  private manifestPath(turnId: string): string {
    return nodePath.join(this.checkpointsDirectory, `${turnId}.json`);
  }

  private async readManifest(
    turnId: string,
  ): Promise<CheckpointManifest | undefined> {
    try {
      const raw = await readFile(this.manifestPath(turnId), "utf8");
      return JSON.parse(raw) as CheckpointManifest;
    } catch {
      return undefined;
    }
  }

  private contentPath(hash: string): string {
    return nodePath.join(this.contentDirectory, hash);
  }

  private async writeContent(hash: string, content: Buffer): Promise<void> {
    await mkdir(this.contentDirectory, { recursive: true });
    try {
      await access(this.contentPath(hash));
    } catch {
      await writeFile(this.contentPath(hash), content);
    }
  }

  private async readContent(hash: string): Promise<string> {
    const version: FileVersion = {
      text: await readFile(this.contentPath(hash), "utf8").catch(() => ""),
    };
    return version.text;
  }
}
