import { PAPER_COMMANDS } from "@latex-comfort/shared";
import type { PaperRecord } from "./model";

export type PaperTreeRow = {
  label: string;
  description: string | undefined;
  tooltip: string;
  contextValue: "paper";
  command: {
    command: string;
    title: string;
    arguments: [PaperRecord];
  };
};

export function paperTreeItem(paper: PaperRecord, _index: number): PaperTreeRow {
  const description = [paper.firstAuthor, paper.year, paper.uses === undefined ? "" : `${paper.uses}×`].filter(Boolean).join(" · ");
  const tooltip = [
    paper.title,
    [paper.authors, paper.year].filter(Boolean).join(" · "),
    paper.venue,
    paper.key,
    paper.uses === undefined ? "" : `Cited ${paper.uses} time${paper.uses === 1 ? "" : "s"} in this project`,
    `${paper.path}:${paper.line}`,
  ].filter(Boolean).join("\n");

  return {
    label: paper.title,
    description: description || undefined,
    tooltip,
    contextValue: "paper",
    command: {
      command: PAPER_COMMANDS.insertCitation,
      title: "Insert Citation",
      arguments: [paper],
    },
  };
}

export type PaperQuickPickRow = {
  label: string;
  description: string;
  detail: string;
  paper: PaperRecord;
};

export function searchPaperItem(paper: PaperRecord): PaperQuickPickRow {
  return {
    label: paper.title,
    description: [paper.firstAuthor, paper.year, paper.uses === undefined ? "" : `${paper.uses}×`].filter(Boolean).join(" · "),
    detail: [paper.key, paper.venue, paper.uses === undefined ? "" : `${paper.uses}×`, `${paper.path}:${paper.line}`].filter(Boolean).join(" · "),
    paper,
  };
}

export function paperLinkTarget(paper: Pick<PaperRecord, "doi" | "arxivId" | "url">): string | undefined {
  if (paper.doi) return `https://doi.org/${paper.doi}`;
  if (paper.arxivId) return `https://arxiv.org/abs/${paper.arxivId}`;
  return paper.url;
}
