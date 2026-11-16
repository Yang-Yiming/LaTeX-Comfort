/*
 * Review diff presentation adapted from Lattice's proofreading card
 * (Apache-2.0). Copyright 2026 Leonardo and the Lattice contributors.
 * Licensed under the Apache License, Version 2.0.
 * Modified for LaTeX Comfort: VS Code Webview rendering and interactions.
 */

import { useMemo, type CSSProperties, type ReactNode } from "react";
import type { Hunk } from "@latex-comfort/shared";
import { highlightLatexTokens, LatexHighlight } from "./LatexHighlight";

type Props = {
  original: string;
  hunks: readonly Hunk[];
  rejected: ReadonlySet<number>;
  onToggle: (id: number, accepted: boolean) => void;
};

export function InlineDiff({ original, hunks, rejected, onToggle }: Props) {
  const ordered = [...hunks].sort((left, right) => left.from - right.from);
  const originalTokens = useMemo(
    () => highlightLatexTokens(original),
    [original],
  );
  const proposal = useMemo(
    () => buildProposal(original, ordered),
    [original, hunks],
  );
  const proposedTokens = useMemo(
    () => highlightLatexTokens(proposal.text),
    [proposal.text],
  );
  const parts: ReactNode[] = [];
  let cursor = 0;

  for (const [index, hunk] of ordered.entries()) {
    const before = original.slice(cursor, hunk.from);
    if (before) {
      parts.push(
        <span key={`text-${hunk.id}`}>
          <LatexHighlight tokens={originalTokens} from={cursor} to={hunk.from} />
        </span>,
      );
    }
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
            {deleted ? (
              <del>
                <LatexHighlight
                  tokens={originalTokens}
                  from={hunk.from}
                  to={hunk.to}
                />
              </del>
            ) : null}
            {deleted && hunk.insert ? " " : null}
            {hunk.insert ? (
              <ins>
                <LatexHighlight
                  tokens={proposedTokens}
                  from={proposal.insertions.get(hunk.id)?.from ?? 0}
                  to={proposal.insertions.get(hunk.id)?.to ?? 0}
                />
              </ins>
            ) : null}
          </>
        ) : deleted ? (
          <span className="kept">
            <LatexHighlight
              tokens={originalTokens}
              from={hunk.from}
              to={hunk.to}
            />
          </span>
        ) : (
          <span className="caret">⁁</span>
        )}
      </span>,
    );
  }

  const tail = original.slice(cursor);
  if (tail) {
    parts.push(
      <span key="tail">
        <LatexHighlight
          tokens={originalTokens}
          from={cursor}
          to={original.length}
        />
      </span>,
    );
  }
  return <div className="inline-diff">{parts}</div>;
}

function buildProposal(
  original: string,
  hunks: readonly Hunk[],
): { text: string; insertions: ReadonlyMap<number, { from: number; to: number }> } {
  let text = "";
  let originalCursor = 0;
  const insertions = new Map<number, { from: number; to: number }>();

  for (const hunk of hunks) {
    text += original.slice(originalCursor, hunk.from);
    const from = text.length;
    text += hunk.insert;
    insertions.set(hunk.id, { from, to: text.length });
    originalCursor = hunk.to;
  }
  text += original.slice(originalCursor);
  return { text, insertions };
}
