export type OffsetRange = { start: number; end: number };

export type TextEdit = { start: number; end: number; insert: string };

export type ToggleResult = {
  edits: TextEdit[];
  selections: OffsetRange[];
};

type Wrapper = {
  start: number;
  insideStart: number;
  contentStart: number;
  contentEnd: number;
  insideEnd: number;
  end: number;
};

type OpenEnvironment = {
  name: string;
  start: number;
  end: number;
};

function normalizeRange(source: string, range: OffsetRange): OffsetRange {
  return {
    start: Math.max(0, Math.min(range.start, range.end, source.length)),
    end: Math.min(source.length, Math.max(range.start, range.end)),
  };
}

function isEscaped(source: string, index: number): boolean {
  let slashes = 0;
  while (source[index - 1 - slashes] === "\\") slashes += 1;
  return slashes % 2 === 1;
}

function commentedAt(source: string, offset: number): boolean {
  const lineStart = source.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
  const lineEnd = Math.min(source.length, offset + 1);
  for (let index = lineStart; index < lineEnd; index += 1) {
    if (source[index] === "%" && !isEscaped(source, index)) return true;
  }
  return false;
}

function trimmedRange(source: string, range: OffsetRange): OffsetRange | null {
  const raw = source.slice(range.start, range.end);
  const leading = raw.length - raw.trimStart().length;
  const content = raw.trim();
  if (!content) return null;
  return { start: range.start + leading, end: range.start + leading + content.length };
}

function simpleWrapper(start: number, contentStart: number, contentEnd: number, end: number): Wrapper {
  return {
    start,
    insideStart: contentStart,
    contentStart,
    contentEnd,
    insideEnd: contentEnd,
    end,
  };
}

function commandWrapper(
  source: string,
  start: number,
  openEnd: number,
  closeStart: number,
  end: number,
): Wrapper {
  let contentStart = openEnd;
  if (source.startsWith("\r\n", contentStart)) contentStart += 2;
  else if (source[contentStart] === "\n" || source[contentStart] === "\r") contentStart += 1;

  let contentEnd = closeStart;
  if (contentEnd - 2 >= contentStart && source.slice(contentEnd - 2, contentEnd) === "\r\n") {
    contentEnd -= 2;
  } else if (source[contentEnd - 1] === "\n" || source[contentEnd - 1] === "\r") {
    contentEnd -= 1;
  }

  return {
    start,
    insideStart: openEnd,
    contentStart,
    contentEnd,
    insideEnd: closeStart,
    end,
  };
}

function inlineMathWrappers(source: string): Wrapper[] {
  const wrappers: Wrapper[] = [];
  let open: number | null = null;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "%" && !isEscaped(source, index)) {
      const newline = source.indexOf("\n", index);
      if (newline < 0) break;
      index = newline;
      continue;
    }
    if (
      source[index] !== "$"
      || isEscaped(source, index)
      || source[index - 1] === "$"
      || source[index + 1] === "$"
    ) {
      continue;
    }
    if (open === null) {
      open = index;
    } else {
      wrappers.push(simpleWrapper(open, open + 1, index, index + 1));
      open = null;
    }
  }
  return wrappers;
}

function displayMathWrappers(source: string): Wrapper[] {
  const wrappers: Wrapper[] = [];
  let open: number | null = null;
  for (let index = 0; index < source.length - 1; index += 1) {
    if (source[index] === "%" && !isEscaped(source, index)) {
      const newline = source.indexOf("\n", index);
      if (newline < 0) break;
      index = newline;
      continue;
    }
    if (source[index] !== "\\" || isEscaped(source, index)) continue;
    if (source[index + 1] === "[") {
      open = index;
    } else if (source[index + 1] === "]" && open !== null) {
      wrappers.push(simpleWrapper(open, open + 2, index, index + 2));
      open = null;
    }
  }
  return wrappers;
}

function environmentWrappers(source: string): Wrapper[] {
  const wrappers: Wrapper[] = [];
  const stack: OpenEnvironment[] = [];
  const pattern = /\\(begin|end)\{([^{}]*)\}/y;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "%" && !isEscaped(source, index)) {
      const newline = source.indexOf("\n", index);
      if (newline < 0) break;
      index = newline;
      continue;
    }
    if (source[index] !== "\\" || isEscaped(source, index)) continue;

    pattern.lastIndex = index;
    const match = pattern.exec(source);
    if (!match) continue;
    const kind = match[1];
    const name = match[2];
    if (kind === undefined || name === undefined) continue;
    const end = index + match[0].length;
    if (kind === "begin") {
      stack.push({ name, start: index, end });
      index = end - 1;
      continue;
    }

    const open = stack[stack.length - 1];
    if (open?.name !== name) continue;
    stack.pop();
    wrappers.push(commandWrapper(source, open.start, open.end, index, end));
    index = end - 1;
  }
  return wrappers;
}

function iffalseWrappers(source: string): Wrapper[] {
  const wrappers: Wrapper[] = [];
  const stack: OpenEnvironment[] = [];
  const pattern = /\\(iffalse|fi)(?![A-Za-z@])/y;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "%" && !isEscaped(source, index)) {
      const newline = source.indexOf("\n", index);
      if (newline < 0) break;
      index = newline;
      continue;
    }
    if (source[index] !== "\\" || isEscaped(source, index)) continue;

    pattern.lastIndex = index;
    const match = pattern.exec(source);
    if (!match) continue;
    const kind = match[1];
    if (kind === undefined) continue;
    const end = index + match[0].length;
    if (kind === "iffalse") {
      stack.push({ name: kind, start: index, end });
    } else {
      const open = stack.pop();
      if (open) wrappers.push(commandWrapper(source, open.start, open.end, index, end));
    }
    index = end - 1;
  }
  return wrappers;
}

function enclosingWrapper(wrappers: readonly Wrapper[], range: OffsetRange): Wrapper | null {
  let found: Wrapper | null = null;
  for (const wrapper of wrappers) {
    const whole = range.start === wrapper.start && range.end === wrapper.end;
    const inside = range.start >= wrapper.insideStart && range.end <= wrapper.insideEnd;
    if (!whole && !inside) continue;
    if (!found || wrapper.end - wrapper.start < found.end - found.start) found = wrapper;
  }
  return found;
}

function overlapsWrapper(wrappers: readonly Wrapper[], range: OffsetRange): boolean {
  return wrappers.some((wrapper) => range.start < wrapper.end && range.end > wrapper.start);
}

function toggleDelimited(
  source: string,
  range: OffsetRange,
  open: string,
  close: string,
  wrappers: readonly Wrapper[],
): ToggleResult {
  const selected = normalizeRange(source, range);
  if (commentedAt(source, selected.start)) {
    return { edits: [], selections: [selected] };
  }

  if (selected.start === selected.end) {
    return {
      edits: [{ start: selected.start, end: selected.start, insert: open + close }],
      selections: [{ start: selected.start + open.length, end: selected.start + open.length }],
    };
  }

  const content = trimmedRange(source, selected);
  if (!content) return { edits: [], selections: [selected] };

  const wrapper = enclosingWrapper(wrappers, content);
  if (wrapper) {
    return {
      edits: [
        { start: wrapper.start, end: wrapper.contentStart, insert: "" },
        { start: wrapper.contentEnd, end: wrapper.end, insert: "" },
      ],
      selections: [{
        start: wrapper.start,
        end: wrapper.start + wrapper.contentEnd - wrapper.contentStart,
      }],
    };
  }

  if (overlapsWrapper(wrappers, content)) {
    return { edits: [], selections: [selected] };
  }

  return {
    edits: [
      { start: content.start, end: content.start, insert: open },
      { start: content.end, end: content.end, insert: close },
    ],
    selections: [{
      start: content.start + open.length,
      end: content.end + open.length,
    }],
  };
}

/** Toggle single-dollar inline math around the selected content. */
export function toggleInlineMath(source: string, range: OffsetRange): ToggleResult {
  return toggleDelimited(source, range, "$", "$", inlineMathWrappers(source));
}

/** Toggle display math around the selected content. */
export function toggleDisplayMath(source: string, range: OffsetRange): ToggleResult {
  return toggleDelimited(source, range, "\\[", "\\]", displayMathWrappers(source));
}

/** Toggle a named environment around the selected content. */
export function toggleEnvironment(source: string, range: OffsetRange, name: string): ToggleResult {
  if (!name) return { edits: [], selections: [normalizeRange(source, range)] };
  return toggleDelimited(
    source,
    range,
    `\\begin{${name}}\n`,
    `\n\\end{${name}}`,
    environmentWrappers(source).filter((wrapper) => (
      source.slice(wrapper.start, wrapper.contentStart).includes(`{${name}}`)
    )),
  );
}

/** Toggle a `\iffalse` block around the selected content. */
export function toggleIffalse(source: string, range: OffsetRange): ToggleResult {
  return toggleDelimited(source, range, "\\iffalse\n", "\n\\fi", iffalseWrappers(source));
}
