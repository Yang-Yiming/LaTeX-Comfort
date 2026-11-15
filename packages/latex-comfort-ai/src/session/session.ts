import type { EditMode, Hunk, SelectionContext } from "@latex-comfort/shared";

export interface EditSession extends SelectionContext {
  id: string;
  mode: EditMode;
  instruction: string;
}

export interface CurrentSelectionSnapshot {
  uri: string;
  version: number;
  text: string;
}

export function createEditSession(
  selection: SelectionContext,
  mode: EditMode,
  instruction: string,
): EditSession {
  return {
    ...selection,
    id: crypto.randomUUID(),
    mode,
    instruction: instruction.trim(),
  };
}

/** True when applying the session's original offsets would overwrite changed text. */
export function isSessionStale(
  session: EditSession,
  current: CurrentSelectionSnapshot,
): boolean {
  return (
    current.uri !== session.uri ||
    current.version !== session.documentVersion ||
    current.text !== session.text
  );
}

export function selectedHunks(
  hunks: readonly Hunk[],
  acceptedIds: readonly number[],
): Hunk[] {
  const accepted = new Set(acceptedIds);
  return hunks.filter((hunk) => accepted.has(hunk.id));
}
