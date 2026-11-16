import type { CSSProperties, ReactNode } from "react";
import type { Hunk } from "@latex-comfort/shared";

type Props = {
  original: string;
  hunks: readonly Hunk[];
  rejected: ReadonlySet<number>;
  onToggle: (id: number, accepted: boolean) => void;
};

export function InlineDiff({ original, hunks, rejected, onToggle }: Props) {
  const ordered = [...hunks].sort((left, right) => left.from - right.from);
  const parts: ReactNode[] = [];
  let cursor = 0;

  for (const [index, hunk] of ordered.entries()) {
    const before = original.slice(cursor, hunk.from);
    if (before) parts.push(<span key={`text-${hunk.id}`}>{before}</span>);
    cursor = hunk.to;

    const deleted = original.slice(hunk.from, hunk.to);
    const applied = !rejected.has(hunk.id);
    parts.push(
      <span
        key={`edit-${hunk.id}`}
        className="inline-edit"
        data-status={applied ? "applied" : "kept"}
        style={{ "--edit-index": index } as CSSProperties}
        role="button"
        tabIndex={0}
        aria-pressed={applied}
        aria-label={
          deleted
            ? `Replace ${JSON.stringify(deleted)} with ${JSON.stringify(hunk.insert)}`
            : `Insert ${JSON.stringify(hunk.insert)}`
        }
        title={applied ? "Click to keep the original" : "Click to apply this change"}
        onClick={() => {
          if (window.getSelection()?.isCollapsed !== false) {
            onToggle(hunk.id, !applied);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onToggle(hunk.id, !applied);
          }
        }}
      >
        {applied ? (
          <>
            {deleted ? <del>{deleted}</del> : null}
            {deleted && hunk.insert ? " " : null}
            {hunk.insert ? <ins>{hunk.insert}</ins> : null}
          </>
        ) : deleted ? (
          <span className="kept">{deleted}</span>
        ) : (
          <span className="caret">⁁</span>
        )}
      </span>,
    );
  }

  const tail = original.slice(cursor);
  if (tail) parts.push(<span key="tail">{tail}</span>);
  return <div className="inline-diff">{parts}</div>;
}
