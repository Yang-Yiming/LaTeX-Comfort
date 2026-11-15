import { describe, expect, it } from "vitest";
import {
  createEditSession,
  isSessionStale,
  selectedHunks,
} from "./session";

describe("edit session", () => {
  const selection = {
    uri: "file:///paper.tex",
    range: {
      start: { line: 1, character: 2 },
      end: { line: 1, character: 14 },
    },
    text: "selected text",
    languageId: "latex",
    documentVersion: 4,
  };

  it("captures the selection and mode", () => {
    const session = createEditSession(selection, "polish", "Make it clearer.");
    expect(session).toMatchObject({
      ...selection,
      mode: "polish",
      instruction: "Make it clearer.",
    });
    expect(session.id.length).toBeGreaterThan(0);
  });

  it("detects a document version change", () => {
    const session = createEditSession(selection, "proofread", "");
    expect(
      isSessionStale(session, {
        uri: selection.uri,
        version: 5,
        text: selection.text,
      }),
    ).toBe(true);
  });

  it("detects replacement text that no longer matches", () => {
    const session = createEditSession(selection, "proofread", "");
    expect(
      isSessionStale(session, {
        uri: selection.uri,
        version: 4,
        text: "changed text",
      }),
    ).toBe(true);
  });

  it("keeps only accepted hunks", () => {
    const hunks = [
      { id: 0, from: 0, to: 1, insert: "A" },
      { id: 1, from: 2, to: 3, insert: "B" },
    ];
    expect(selectedHunks(hunks, [1])).toEqual([hunks[1]]);
  });
});
