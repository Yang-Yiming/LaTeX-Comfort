export interface LineHunk {
  id: number;
  beforeStart: number;
  beforeEnd: number;
  afterStart: number;
  afterEnd: number;
  beforeText: string;
  afterText: string;
}

const MAX_LCS_CELLS = 4_000_000;

function splitLines(text: string): string[] {
  if (!text) return [];
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

function wholeFileHunk(before: string[], after: string[]): LineHunk {
  return {
    id: 0,
    beforeStart: 0,
    beforeEnd: before.length,
    afterStart: 0,
    afterEnd: after.length,
    beforeText: before.join(""),
    afterText: after.join(""),
  };
}

/** Line-oriented LCS hunks used by the inline turn review. */
export function lineHunks(beforeText: string, afterText: string): LineHunk[] {
  const before = splitLines(beforeText);
  const after = splitLines(afterText);
  if (beforeText === afterText) return [];
  if (before.length * after.length > MAX_LCS_CELLS) {
    return [wholeFileHunk(before, after)];
  }

  const width = after.length + 1;
  const table = new Uint32Array((before.length + 1) * width);
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        before[i] === after[j]
          ? (table[(i + 1) * width + j + 1] ?? 0) + 1
          : Math.max(table[(i + 1) * width + j] ?? 0, table[i * width + j + 1] ?? 0);
    }
  }

  const hunks: LineHunk[] = [];
  let i = 0;
  let j = 0;
  let beforeStart = -1;
  let afterStart = -1;
  let beforeEnd = 0;
  let afterEnd = 0;

  const flush = () => {
    if (beforeStart < 0) return;
    hunks.push({
      id: hunks.length,
      beforeStart,
      beforeEnd,
      afterStart,
      afterEnd,
      beforeText: before.slice(beforeStart, beforeEnd).join(""),
      afterText: after.slice(afterStart, afterEnd).join(""),
    });
    beforeStart = -1;
    afterStart = -1;
  };

  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      flush();
      i += 1;
      j += 1;
      continue;
    }
    if (beforeStart < 0) {
      beforeStart = i;
      afterStart = j;
    }
    if ((table[(i + 1) * width + j] ?? 0) >= (table[i * width + j + 1] ?? 0)) {
      i += 1;
      beforeEnd = i;
      afterEnd = j;
    } else {
      j += 1;
      beforeEnd = i;
      afterEnd = j;
    }
  }
  if (beforeStart >= 0) {
    beforeEnd = i;
    afterEnd = j;
  }
  while (i < before.length) {
    if (beforeStart < 0) {
      beforeStart = i;
      afterStart = j;
    }
    i += 1;
    beforeEnd = i;
    afterEnd = j;
  }
  while (j < after.length) {
    if (beforeStart < 0) {
      beforeStart = i;
      afterStart = j;
    }
    j += 1;
    beforeEnd = i;
    afterEnd = j;
  }
  flush();
  return hunks;
}
