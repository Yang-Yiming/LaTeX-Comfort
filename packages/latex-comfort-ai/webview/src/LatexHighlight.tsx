import type { ReactNode } from "react";
import { createLowlight } from "lowlight";
import latex from "highlight.js/lib/languages/latex";

export type LatexHighlightNode =
  | { type: "text"; value: string }
  | {
      type: "element";
      tagName: string;
      className?: string;
      children: LatexHighlightNode[];
    };

export type LatexHighlightToken = {
  text: string;
  from: number;
  to: number;
  className?: string;
};

const lowlight = createLowlight();
lowlight.register("latex", latex);

export function highlightLatex(source: string): LatexHighlightNode[] {
  return convertNodes(lowlight.highlight("latex", source).children);
}

export function highlightLatexTokens(source: string): LatexHighlightToken[] {
  const tokens: LatexHighlightToken[] = [];
  let offset = 0;

  const visit = (
    nodes: readonly LatexHighlightNode[],
    inheritedClass?: string,
  ) => {
    for (const node of nodes) {
      if (node.type === "element") {
        visit(node.children, combineClasses(inheritedClass, node.className));
        continue;
      }

      const from = offset;
      offset += node.value.length;
      if (!node.value) continue;
      tokens.push({
        text: node.value,
        from,
        to: offset,
        ...(inheritedClass ? { className: inheritedClass } : {}),
      });
    }
  };

  visit(highlightLatex(source));
  return tokens;
}

function convertNodes(
  nodes: ReturnType<typeof lowlight.highlight>["children"],
): LatexHighlightNode[] {
  return nodes.flatMap((node): LatexHighlightNode[] => {
    if (node.type === "text") return [{ type: "text", value: node.value }];
    if (node.type !== "element") return [];

    const className = Array.isArray(node.properties.className)
      ? node.properties.className.filter((name) => typeof name === "string").join(" ")
      : typeof node.properties.className === "string"
        ? node.properties.className
        : undefined;
    return [
      {
        type: "element",
        tagName: node.tagName,
        ...(className ? { className } : {}),
        children: convertNodes(node.children),
      },
    ];
  });
}

function combineClasses(
  inherited: string | undefined,
  current: string | undefined,
): string | undefined {
  if (!inherited) return current;
  if (!current) return inherited;
  return `${inherited} ${current}`;
}

export function LatexHighlight({
  tokens,
  from,
  to,
}: {
  tokens: readonly LatexHighlightToken[];
  from: number;
  to: number;
}): ReactNode {
  return (
    <>
      {tokens.map((token) => {
        const start = Math.max(from, token.from);
        const end = Math.min(to, token.to);
        if (start >= end) return null;

        const text = token.text.slice(start - token.from, end - token.from);
        if (!token.className) return text;
        return (
          <span key={token.from} className={token.className}>
            {text}
          </span>
        );
      })}
    </>
  );
}
