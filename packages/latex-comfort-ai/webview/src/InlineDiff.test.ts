import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Hunk } from "@latex-comfort/shared";
import { InlineDiff } from "./InlineDiff";

describe("InlineDiff LaTeX highlighting", () => {
  it("highlights commands in unchanged and changed diff segments", () => {
    const original = "\\section{Old} % note";
    const hunks: Hunk[] = [
      {
        id: 0,
        from: original.indexOf("Old"),
        to: original.indexOf("Old") + 3,
        insert: "New",
      },
    ];

    const html = renderToStaticMarkup(
      createElement(InlineDiff, {
        original,
        hunks,
        rejected: new Set<number>(),
        onToggle: () => undefined,
      }),
    );

    expect(html).toContain("hljs-keyword");
    expect(html).toContain("hljs-comment");
    expect(html).toContain("<del>");
    expect(html).toContain("<ins>");
  });

  it("keeps the surrounding LaTeX context when highlighting an insertion", () => {
    const original = "% keep old\n";
    const from = original.indexOf("old");
    const hunks: Hunk[] = [{ id: 0, from, to: from + 3, insert: "new" }];

    const html = renderToStaticMarkup(
      createElement(InlineDiff, {
        original,
        hunks,
        rejected: new Set<number>(),
        onToggle: () => undefined,
      }),
    );

    expect(html).toContain('<ins><span class="hljs-comment">new</span></ins>');
  });
});
