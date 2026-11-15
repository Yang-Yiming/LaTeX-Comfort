import { describe, expect, it } from "vitest";
import { toSelectionContext } from "./api";

describe("core selection API", () => {
  it("serializes the editor selection without leaking VS Code objects", () => {
    const editor = {
      document: {
        uri: { toString: () => "file:///paper.tex" },
        languageId: "latex",
        version: 7,
        getText: () => "selected text",
      },
      selection: {
        start: { line: 2, character: 4 },
        end: { line: 3, character: 1 },
      },
    };

    expect(toSelectionContext(editor as never)).toEqual({
      uri: "file:///paper.tex",
      range: {
        start: { line: 2, character: 4 },
        end: { line: 3, character: 1 },
      },
      text: "selected text",
      languageId: "latex",
      documentVersion: 7,
    });
  });
});
