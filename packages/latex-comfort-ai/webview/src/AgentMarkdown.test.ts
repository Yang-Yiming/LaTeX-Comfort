import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgentMarkdown } from "./AgentMarkdown";

function render(text: string): string {
  return renderToStaticMarkup(createElement(AgentMarkdown, { text }));
}

describe("AgentMarkdown", () => {
  it("renders headings, inline formatting, lists, and fenced code", () => {
    const html = render(
      "## Result\n\nUse **bold**, *italic*, `code`, and [docs](https://example.com).\n\n- one\n- two\n\n```tex\n\\section{Intro}\n```",
    );

    expect(html).toContain("<h2>Result</h2>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain("<ul><li>one</li><li>two</li></ul>");
    expect(html).toContain('<pre data-language="tex"><code>\\section{Intro}</code></pre>');
  });

  it("renders tables and refuses unsafe link schemes", () => {
    const html = render(
      "| A | B |\n| --- | --- |\n| 1 | 2 |\n\n[unsafe](javascript:alert(1))",
    );

    expect(html).toContain("<table>");
    expect(html).toContain("<th>A</th>");
    expect(html).toContain("<td>2</td>");
    expect(html).not.toContain("<a");
  });
});
