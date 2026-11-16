import { describe, expect, it } from "vitest";
import { highlightLatex, type LatexHighlightNode } from "./LatexHighlight";

function textContent(nodes: readonly LatexHighlightNode[]): string {
  return nodes
    .map((node) =>
      node.type === "text" ? node.value : textContent(node.children),
    )
    .join("");
}

function classNames(nodes: readonly LatexHighlightNode[]): string[] {
  return nodes.flatMap((node) =>
    node.type === "text"
      ? []
      : [...(node.className ? [node.className] : []), ...classNames(node.children)],
  );
}

describe("highlightLatex", () => {
  it("preserves the source exactly while classifying LaTeX commands and comments", () => {
    const source = "\\section{Results} % review note\nText & <values>";
    const nodes = highlightLatex(source);

    expect(textContent(nodes)).toBe(source);
    expect(classNames(nodes)).toContain("hljs-keyword");
    expect(classNames(nodes)).toContain("hljs-comment");
  });

  it("does not turn escaped percent signs into comments", () => {
    const nodes = highlightLatex("A rate of 20\\% is final.");

    expect(classNames(nodes)).not.toContain("hljs-comment");
  });
});
