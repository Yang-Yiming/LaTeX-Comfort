import { Fragment, type ReactNode } from "react";

function safeHref(value: string): string | undefined {
  try {
    const url = new URL(value);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? value : undefined;
  } catch {
    return undefined;
  }
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const pattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\*[^*\n]+\*|_[^_\n]+_|\[[^\]\n]+\]\([^)]+\))/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const token = match[0];
    const key = `${keyPrefix}:${index++}`;
    if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(<strong key={key}>{renderInline(token.slice(2, -2), key)}</strong>);
    } else if (token.startsWith("__") && token.endsWith("__")) {
      nodes.push(<strong key={key}>{renderInline(token.slice(2, -2), key)}</strong>);
    } else if (token.startsWith("~~") && token.endsWith("~~")) {
      nodes.push(<del key={key}>{renderInline(token.slice(2, -2), key)}</del>);
    } else if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push(<em key={key}>{renderInline(token.slice(1, -1), key)}</em>);
    } else if (token.startsWith("_") && token.endsWith("_")) {
      nodes.push(<em key={key}>{renderInline(token.slice(1, -1), key)}</em>);
    } else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      const href = link ? safeHref(link[2] ?? "") : undefined;
      nodes.push(
        href ? (
          <a key={key} href={href} target="_blank" rel="noreferrer">
            {renderInline(link?.[1] ?? "", key)}
          </a>
        ) : (
          <span key={key}>{token}</span>
        ),
      );
    }
    cursor = match.index + token.length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isBlockStart(lines: string[], index: number): boolean {
  const line = lines[index] ?? "";
  return (
    /^```/.test(line) ||
    /^#{1,6}\s+/.test(line) ||
    /^>\s?/.test(line) ||
    /^[-*+]\s+/.test(line) ||
    /^\d+\.\s+/.test(line) ||
    /^(-{3,}|\*{3,}|_{3,})$/.test(line.trim()) ||
    (line.includes("|") && isTableSeparator(lines[index + 1] ?? ""))
  );
}

function renderBlocks(lines: string[], keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let index = 0;
  let block = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const key = `${keyPrefix}:block:${block++}`;
    const fence = /^```([^\s]*)\s*$/.exec(line);
    if (fence) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index] ?? "")) {
        code.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) index += 1;
      nodes.push(
        <pre key={key} data-language={fence[1] || undefined}>
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1]?.length ?? 1;
      const content = renderInline(heading[2] ?? "", key);
      if (level === 1) nodes.push(<h1 key={key}>{content}</h1>);
      else if (level === 2) nodes.push(<h2 key={key}>{content}</h2>);
      else if (level === 3) nodes.push(<h3 key={key}>{content}</h3>);
      else if (level === 4) nodes.push(<h4 key={key}>{content}</h4>);
      else if (level === 5) nodes.push(<h5 key={key}>{content}</h5>);
      else nodes.push(<h6 key={key}>{content}</h6>);
      index += 1;
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      nodes.push(<hr key={key} />);
      index += 1;
      continue;
    }
    if (line.includes("|") && isTableSeparator(lines[index + 1] ?? "")) {
      const header = splitTableRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && (lines[index] ?? "").includes("|") && (lines[index] ?? "").trim()) {
        rows.push(splitTableRow(lines[index] ?? ""));
        index += 1;
      }
      nodes.push(
        <div className="lattice-markdown-table" key={key}>
          <table>
            <thead>
              <tr>
                {header.map((cell, cellIndex) => (
                  <th key={`${key}:h:${cellIndex}`}>{renderInline(cell, `${key}:h:${cellIndex}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`${key}:r:${rowIndex}`}>
                  {header.map((_, cellIndex) => (
                    <td key={`${key}:r:${rowIndex}:${cellIndex}`}>
                      {renderInline(row[cellIndex] ?? "", `${key}:r:${rowIndex}:${cellIndex}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index] ?? "")) {
        quote.push((lines[index] ?? "").replace(/^>\s?/, ""));
        index += 1;
      }
      nodes.push(<blockquote key={key}>{renderBlocks(quote, key)}</blockquote>);
      continue;
    }
    if (/^[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*+]\s+/.test(lines[index] ?? "")) {
        items.push((lines[index] ?? "").replace(/^[-*+]\s+/, ""));
        index += 1;
      }
      nodes.push(
        <ul key={key}>
          {items.map((item, itemIndex) => (
            <li key={`${key}:${itemIndex}`}>{renderInline(item, `${key}:${itemIndex}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index] ?? "")) {
        items.push((lines[index] ?? "").replace(/^\d+\.\s+/, ""));
        index += 1;
      }
      nodes.push(
        <ol key={key}>
          {items.map((item, itemIndex) => (
            <li key={`${key}:${itemIndex}`}>{renderInline(item, `${key}:${itemIndex}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }
    const paragraph: string[] = [line];
    index += 1;
    while (index < lines.length && (lines[index] ?? "").trim() && !isBlockStart(lines, index)) {
      paragraph.push(lines[index] ?? "");
      index += 1;
    }
    nodes.push(
      <p key={key}>
        {paragraph.map((part, partIndex) => (
          <Fragment key={`${key}:${partIndex}`}>
            {partIndex > 0 ? <br /> : null}
            {renderInline(part, `${key}:${partIndex}`)}
          </Fragment>
        ))}
      </p>,
    );
  }
  return nodes;
}

export function AgentMarkdown({ text }: { text: string }) {
  return <div className="lattice-markdown">{renderBlocks(text.replace(/\r\n/g, "\n").split("\n"), "md")}</div>;
}
