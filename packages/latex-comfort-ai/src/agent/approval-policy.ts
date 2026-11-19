import nodePath from "node:path";
import type {
  AgentApprovalMode,
  AgentPermissionOption,
  AgentPermissionRequest,
  AgentProposedDiff,
} from "./types";

export type PermissionDecision =
  | { type: "allow"; optionId: string }
  | { type: "reject"; optionId: string }
  | { type: "ask" };

function pathInside(root: string, candidate: string): boolean {
  const absolute = nodePath.isAbsolute(candidate)
    ? nodePath.normalize(candidate)
    : nodePath.resolve(root, candidate);
  const relative = nodePath.relative(root, absolute);
  return relative === "" || (!relative.startsWith("..") && !nodePath.isAbsolute(relative));
}

function affectedPaths(
  request: AgentPermissionRequest,
  diffs: readonly AgentProposedDiff[],
): string[] {
  const paths = new Set<string>();
  for (const diff of diffs) paths.add(diff.path);
  for (const location of request.locations ?? []) {
    if (location.path) paths.add(location.path);
  }
  return [...paths];
}

function allInsideWorkspace(
  request: AgentPermissionRequest,
  workspaceRoot: string | undefined,
): boolean {
  if (!workspaceRoot) return false;
  const diffs = request.diffs ?? [];
  const paths = affectedPaths(request, diffs);
  return paths.length > 0 && paths.every((path) => pathInside(workspaceRoot, path));
}

/**
 * Client-side policy on top of ACP permission requests. The agent decides
 * whether it asks; this decides whether the request needs the writer's eyes.
 */
export function decidePermission(
  request: AgentPermissionRequest,
  mode: AgentApprovalMode,
  workspaceRoot: string | undefined,
): PermissionDecision {
  const allow = (): PermissionDecision => {
    const option = selectOption(request.options, "allow");
    return option ? { type: "allow", optionId: option } : { type: "ask" };
  };
  const reject = (): PermissionDecision => {
    const option = selectOption(request.options, "reject");
    return option ? { type: "reject", optionId: option } : { type: "ask" };
  };

  if (mode === "full-access") return allow();

  const kind = request.toolKind;
  if (kind === "read" || kind === "search" || kind === "think") {
    return allow();
  }

  if (mode === "approval-required") return { type: "ask" };

  // auto: routine edits inside the project are applied without a prompt, but
  // still recorded with their diff. Anything that can leave the project or
  // destroy work asks first.
  if (kind === "edit" || kind === "move") {
    return allInsideWorkspace(request, workspaceRoot) ? allow() : { type: "ask" };
  }

  // A diff without a reliable tool kind is an edit proposal; never auto-apply
  // it without knowing which tool produced it.
  if (!kind && request.diffs?.length) return { type: "ask" };

  return { type: "ask" };
}

function selectOption(
  options: readonly AgentPermissionOption[],
  action: "allow" | "reject",
): string | undefined {
  const once = action === "allow" ? "allow_once" : "reject_once";
  const always = action === "allow" ? "allow_always" : "reject_always";
  const exact = (kind: string) =>
    options.find((option) => option.kind === kind)?.id;
  return (
    exact(once) ??
    exact(always) ??
    options.find((option) => option.kind?.startsWith(action))?.id
  );
}
