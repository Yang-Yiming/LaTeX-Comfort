import type {
  EditMode,
  ReviewReadyState,
  TextRange,
} from "@latex-comfort/shared";

export interface ReviewContext {
  uri: string;
  range: TextRange;
  textLength: number;
}

export type ReviewViewState =
  | { status: "idle" }
  | {
      status: "loading";
      context: ReviewContext;
      mode: EditMode;
      instruction?: string;
    }
  | {
      status: "ready";
      context: ReviewContext;
      review: ReviewReadyState;
      selectedHunkIds: readonly number[];
    }
  | {
      status: "error";
      context?: ReviewContext;
      message: string;
      canConfigure: boolean;
    };

export type ReviewAction =
  | { type: "toggleHunk"; id: number; accepted: boolean }
  | { type: "accept" }
  | { type: "reject" }
  | { type: "openSidebar" }
  | { type: "configureProvider" };

export function allHunkIds(
  hunks: readonly { id: number }[],
): Set<number> {
  return new Set(hunks.map((hunk) => hunk.id));
}

export function toggleSelectedHunk(
  selected: ReadonlySet<number>,
  id: number,
  accepted: boolean,
): Set<number> {
  const next = new Set(selected);
  if (accepted) next.add(id);
  else next.delete(id);
  return new Set([...next].sort((left, right) => left - right));
}
