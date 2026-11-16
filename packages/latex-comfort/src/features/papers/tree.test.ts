import { describe, expect, it } from "vitest";
import { paperLinkTarget, paperTreeItem, searchPaperItem } from "./tree";
import type { PaperRecord } from "./model";

const paper: PaperRecord = {
  key: "vaswani2017attention",
  entryType: "inproceedings",
  title: "Attention Is All You Need",
  authors: "Ashish Vaswani and Noam Shazeer",
  firstAuthor: "Vaswani",
  year: "2017",
  venue: "NeurIPS",
  doi: "10.1/x",
  arxivId: "1706.03762",
  path: "references.bib",
  line: 3,
  haystack: "vaswani2017attention attention is all you need ashish vaswani 2017 neurips",
};

describe("paper tree rows", () => {
  it("uses title, author/year and citation key in the row", () => {
    const item = paperTreeItem(paper, 0);

    expect(item).toMatchObject({
      label: "Attention Is All You Need",
      description: "Vaswani · 2017",
      contextValue: "paper",
      command: {
        command: "latexComfort.papers.insertCitation",
        arguments: [paper],
      },
    });
    expect(item.tooltip).toContain("vaswani2017attention");
    expect(item.tooltip).toContain("references.bib:3");
  });

  it("keeps a long author/year row within the compact description", () => {
    const item = paperTreeItem({ ...paper, firstAuthor: "", year: "" }, 1);

    expect(item.description).toBeUndefined();
    expect(item.tooltip).toContain("NeurIPS");
  });
});

describe("paper command rows", () => {
  it("builds searchable Quick Pick rows", () => {
    const item = searchPaperItem(paper);

    expect(item).toMatchObject({
      label: "Attention Is All You Need",
      description: "Vaswani · 2017",
      detail: "vaswani2017attention · NeurIPS · references.bib:3",
      paper,
    });
  });

  it("chooses DOI before arXiv and URL as the external link", () => {
    expect(paperLinkTarget(paper)).toBe("https://doi.org/10.1/x");
    expect(paperLinkTarget({ ...paper, doi: undefined })).toBe("https://arxiv.org/abs/1706.03762");
    expect(paperLinkTarget({ ...paper, doi: undefined, arxivId: undefined })).toBeUndefined();
    expect(paperLinkTarget({ ...paper, doi: undefined, arxivId: undefined, url: "https://example.com/paper" })).toBe("https://example.com/paper");
  });
});
