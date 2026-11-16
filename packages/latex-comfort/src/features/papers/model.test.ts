import { describe, expect, it } from "vitest";
import { buildPaperRecords, findDuplicate, type PaperRecord } from "./model";

function paper(overrides: Partial<PaperRecord> = {}): PaperRecord {
  return {
    key: "paper",
    entryType: "article",
    title: "A Paper",
    authors: "Ada Lovelace",
    firstAuthor: "Lovelace",
    year: "2024",
    venue: "",
    path: "references.bib",
    line: 1,
    haystack: "paper a paper ada lovelace lovelace 2024",
    ...overrides,
  };
}

describe("paper model", () => {
  it("normalizes display fields and preserves the source line", () => {
    const source = [
      "@inproceedings{vaswani2017attention,",
      "  title={Attention Is All You Need},",
      "  author={Vaswani, Ashish and Shazeer, Noam},",
      "  year={2017},",
      "  booktitle={NeurIPS}",
      "}",
      "",
    ].join("\n");

    const index = buildPaperRecords("references.bib", source);

    expect(index.papers[0]).toMatchObject({
      key: "vaswani2017attention",
      title: "Attention Is All You Need",
      firstAuthor: "Vaswani",
      year: "2017",
      venue: "NeurIPS",
      line: 1,
    });
  });

  it("extracts DOI, normalized arXiv identity and URL", () => {
    const source = "@article{x, title={X}, doi={https://doi.org/10.1000/ABC}, eprint={2401.00001v3}, archivePrefix={arXiv}, url={https://arxiv.org/abs/2401.00001v3}}\n";

    expect(buildPaperRecords("references.bib", source).papers[0]).toMatchObject({
      doi: "10.1000/abc",
      arxivId: "2401.00001",
      url: "https://arxiv.org/abs/2401.00001v3",
    });
  });

  it("sorts by first author, year and title", () => {
    const source = [
      "@misc{b, title={Beta}, author={Zed, Zoe}, year={2020}}",
      "@misc{a, title={Alpha}, author={Ada, Ann}, year={2021}}",
      "@misc{c, title={Gamma}, author={Ada, Ann}, year={2019}}",
    ].join("\n");

    expect(buildPaperRecords("references.bib", source).papers.map((entry) => entry.key)).toEqual(["c", "a", "b"]);
  });

  it("matches duplicate DOI and versionless arXiv ids", () => {
    const existing = paper({ doi: "10.1/x", arxivId: "2401.00001", title: "A", year: "2024" });

    expect(findDuplicate([existing], { doi: "https://doi.org/10.1/X" })).toBe(existing);
    expect(findDuplicate([existing], { arxivId: "2401.00001v3" })).toBe(existing);
  });

  it("matches citation keys case-insensitively", () => {
    const existing = paper({ key: "Vaswani2017Attention" });

    expect(findDuplicate([existing], { key: "vaswani2017attention" })).toBe(existing);
  });

  it("uses exact normalized title and year only as a fallback", () => {
    const existing = paper({ title: "Attention: Is All You Need!", year: "2017" });

    expect(findDuplicate([existing], { title: "attention is all you need", year: "2017" })).toBe(existing);
    expect(findDuplicate([existing], { title: "Attention Is All You Need Now", year: "2017" })).toBeUndefined();
  });
});
