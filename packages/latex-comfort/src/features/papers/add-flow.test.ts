import { describe, expect, it } from "vitest";
import { addConfirmationText, candidateQuickPick } from "./add-flow";

describe("Add Paper presentation", () => {
  it("shows title, authors, year and DOI in candidate rows", () => {
    const [item] = candidateQuickPick([{
      title: "A Paper",
      authors: "Ada Lovelace",
      year: "2024",
      doi: "10.1/x",
      venue: "ICML",
    }]);

    expect(item).toMatchObject({
      label: "A Paper",
      description: "Ada Lovelace · 2024",
      detail: "ICML · https://doi.org/10.1/x",
    });
  });

  it("describes the record before writing", () => {
    expect(addConfirmationText({
      title: "A Paper",
      authors: "Ada Lovelace",
      year: "2024",
      key: "lovelace2024paper",
    })).toBe("A Paper\nAda Lovelace · 2024\nCitation key: lovelace2024paper");
  });
});
