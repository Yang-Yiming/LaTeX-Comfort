import { describe, expect, it } from "vitest";
import { bibliographyReferences, chooseBibliography } from "./locator";

describe("bibliography locator", () => {
  it("reads bibliography and biblatex resource commands", () => {
    expect(bibliographyReferences("\\bibliography{refs,extra}")).toEqual(["refs", "extra"]);
    expect(bibliographyReferences("\\addbibresource{references.bib}")).toEqual(["references.bib"]);
  });

  it("ignores comments and optional biblatex arguments", () => {
    const source = [
      "% \\bibliography{commented}",
      "\\addbibresource[location=local]{library/references.bib}",
    ].join("\n");

    expect(bibliographyReferences(source)).toEqual(["library/references.bib"]);
  });

  it("prefers configuration, then the active document, then a single bib file", () => {
    expect(chooseBibliography({
      configured: "custom.bib",
      activeSource: "\\bibliography{paper}",
      activePath: "main.tex",
      discovered: ["paper.bib"],
    })).toBe("custom.bib");

    expect(chooseBibliography({
      activeSource: "\\bibliography{paper}",
      activePath: "chapters/main.tex",
      discovered: ["paper.bib", "other.bib"],
    })).toBe("chapters/paper.bib");

    expect(chooseBibliography({
      activeSource: "",
      activePath: "main.tex",
      discovered: ["only.bib"],
    })).toBe("only.bib");
  });

  it("returns no bibliography when the workspace has several and none is named", () => {
    expect(chooseBibliography({
      activeSource: "",
      activePath: "main.tex",
      discovered: ["a.bib", "b.bib"],
    })).toBeUndefined();
  });

  it("keeps the previously used bibliography when no editor names one", () => {
    expect(chooseBibliography({
      activeSource: "",
      activePath: "references.bib",
      discovered: ["a.bib", "b.bib"],
      remembered: "b.bib",
    })).toBe("b.bib");
  });
});
