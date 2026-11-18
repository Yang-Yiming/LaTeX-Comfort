export type OffsetRange = { start: number; end: number };
export type InlineFormat = "bold" | "emphasis" | "underline";

export type TextEdit = { start: number; end: number; insert: string };

export type InlineFormatResult = {
  edits: TextEdit[];
  selections: OffsetRange[];
};
type CommandGroup = {
  start: number;
  contentStart: number;
  contentEnd: number;
  end: number;
};

const COMMANDS: Record<InlineFormat, { write: string; reads: readonly string[] }> = {
  bold: { write: "textbf", reads: ["textbf"] },
  emphasis: { write: "emph", reads: ["emph", "textit"] },
  underline: { write: "underline", reads: ["underline"] },
};

function commentedAt(source: string, offset: number): boolean {
  const lineStart = source.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
  const prefix = source.slice(lineStart, offset);
  for (let index = 0; index < prefix.length; index += 1) {
    if (prefix[index] !== "%") continue;
    let slashes = 0;
    while (prefix[index - 1 - slashes] === "\\") slashes += 1;
    if (slashes % 2 === 0) return true;
  }
  return false;
}

function closingBrace(source: string, open: number): number | null {
  let depth = 1;
  for (let index = open + 1; index < source.length; index += 1) {
    const character = source[index];
    if (character === "\\") {
      index += 1;
      continue;
    }
    if (character === "%") {
      const newline = source.indexOf("\n", index);
      if (newline < 0) return null;
      index = newline;
      continue;
    }
    if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) return index;
  }
  return null;
}

function commandGroups(source: string, format: InlineFormat): CommandGroup[] {
  const groups: CommandGroup[] = [];
  const commands = COMMANDS[format].reads;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === "%") {
      const newline = source.indexOf("\n", index);
      if (newline < 0) break;
      index = newline;
      continue;
    }
    if (character !== "\\") continue;
    let matched = false;
    for (const command of commands) {
      const opener = `\\${command}{`;
      if (!source.startsWith(opener, index)) continue;
      const contentStart = index + opener.length;
      const contentEnd = closingBrace(source, contentStart - 1);
      if (contentEnd === null) break;
      groups.push({ start: index, contentStart, contentEnd, end: contentEnd + 1 });
      matched = true;
      break;
    }
    if (!matched) index += 1;
  }
  return groups;
}

function trimmedRange(source: string, range: OffsetRange): OffsetRange | null {
  const start = Math.max(0, Math.min(range.start, range.end));
  const end = Math.min(source.length, Math.max(range.start, range.end));
  const raw = source.slice(start, end);
  const leading = raw.length - raw.trimStart().length;
  const content = raw.trim();
  if (!content) return null;
  return { start: start + leading, end: start + leading + content.length };
}

function enclosingGroup(groups: readonly CommandGroup[], range: OffsetRange): CommandGroup | null {
  let found: CommandGroup | null = null;
  for (const group of groups) {
    if (group.start > range.start || group.end < range.end) continue;
    if (!found || group.start >= found.start) found = group;
  }
  return found;
}

function overlapsGroup(groups: readonly CommandGroup[], range: OffsetRange): boolean {
  return groups.some((group) => range.start < group.end && range.end > group.start);
}

function deltaBefore(edits: readonly TextEdit[], position: number): number {
  let delta = 0;
  for (const edit of edits) {
    const removesAtPosition = edit.start < position && edit.end === position;
    if (edit.end < position || removesAtPosition) {
      delta += edit.insert.length - (edit.end - edit.start);
    }
  }
  return delta;
}

/**
 * Toggle one inline LaTeX command over each non-empty selection. Formatting is
 * removed when the selection sits wholly inside an existing command, and
 * otherwise added around the selection while leaving surrounding whitespace.
 */
export function toggleLatexInline(
  source: string,
  ranges: readonly OffsetRange[],
  format: InlineFormat,
): InlineFormatResult {
  const groups = commandGroups(source, format);
  const edits: TextEdit[] = [];
  type Action =
    | { kind: "wrap"; from: number; to: number; openLength: number; edits: TextEdit[] }
    | { kind: "unwrap"; from: number; length: number; edits: TextEdit[] };
  const actions = new Map<number, Action>();
  const candidates = ranges.flatMap((range, index) => {
    const selected = trimmedRange(source, range);
    return selected && !commentedAt(source, selected.start) ? [{ index, selected }] : [];
  }).sort((a, b) => a.selected.start - b.selected.start || a.selected.end - b.selected.end);

  let previousEnd = -1;
  for (const { index, selected } of candidates) {
    if (selected.start < previousEnd) continue;
    previousEnd = selected.end;
    const group = enclosingGroup(groups, selected);
    if (!group && overlapsGroup(groups, selected)) continue;
    if (group) {
      const actionEdits = [
        { start: group.start, end: group.contentStart, insert: "" },
        { start: group.contentEnd, end: group.end, insert: "" },
      ];
      edits.push(...actionEdits);
      actions.set(index, {
        kind: "unwrap",
        from: group.start,
        length: group.contentEnd - group.contentStart,
        edits: actionEdits,
      });
      continue;
    }
    const open = `\\${COMMANDS[format].write}{`;
    const actionEdits = [
      { start: selected.start, end: selected.start, insert: open },
      { start: selected.end, end: selected.end, insert: "}" },
    ];
    edits.push(...actionEdits);
    actions.set(index, {
      kind: "wrap",
      from: selected.start,
      to: selected.end,
      openLength: open.length,
      edits: actionEdits,
    });
  }

  const selections = ranges.map((range, index) => {
    const action = actions.get(index);
    if (!action) {
      const start = Math.max(0, Math.min(range.start, range.end));
      const end = Math.min(source.length, Math.max(range.start, range.end));
      return {
        start: start + deltaBefore(edits, start),
        end: end + deltaBefore(edits, end),
      };
    }
    const otherEdits = edits.filter((edit) => !action.edits.includes(edit));
    if (action.kind === "unwrap") {
      const start = action.from + deltaBefore(otherEdits, action.from);
      return { start, end: start + action.length };
    }
    return {
      start: action.from + deltaBefore(otherEdits, action.from) + action.openLength,
      end: action.to + deltaBefore(otherEdits, action.to) + action.openLength,
    };
  });

  return { edits, selections };
}
