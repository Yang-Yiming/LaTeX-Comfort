import * as path from "node:path";
import type { AgentUiFileMention } from "@latex-comfort/shared";

const MAX_FILE_MENTIONS = 50;
const MAX_WORKSPACE_FILES = 1_000;
const EXCLUDE_GLOB = "**/{node_modules,.git,dist,build,out,.next,.cache,coverage}/**";

export function rankFileMentions(
  paths: readonly string[],
  query: string,
): AgentUiFileMention[] {
  const needle = query.trim().toLowerCase();
  const ranked = paths.flatMap((filePath) => {
    const normalized = filePath.replaceAll("\\", "/");
    const name = path.posix.basename(normalized);
    const haystack = normalized.toLowerCase();
    if (needle && !haystack.includes(needle)) return [];
    const rank = !needle
      ? 3
      : !normalized.includes("/") && name.toLowerCase().startsWith(needle)
        ? -1
        : name.toLowerCase().startsWith(needle)
          ? 0
          : normalized.toLowerCase().startsWith(needle)
            ? 1
            : 2;
    return [{ path: normalized, name, rank }];
  });
  return ranked
    .sort((left, right) => left.rank - right.rank || left.path.localeCompare(right.path))
    .slice(0, MAX_FILE_MENTIONS)
    .map(({ path: filePath, name }) => ({ path: filePath, name }));
}

export async function findWorkspaceFiles(query: string): Promise<AgentUiFileMention[]> {
  const vscode = await import("vscode");
  const root = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!root) return [];
  const uris = await vscode.workspace.findFiles("**/*", EXCLUDE_GLOB, MAX_WORKSPACE_FILES);
  const paths = uris
    .map((uri) => path.relative(root.fsPath, uri.fsPath).replaceAll(path.sep, "/"))
    .filter((filePath) => filePath && !filePath.startsWith("../"));
  return rankFileMentions(paths, query);
}
