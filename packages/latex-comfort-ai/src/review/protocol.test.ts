import { describe, expect, it } from "vitest";
import { parseWebviewMessage } from "./protocol";

describe("parseWebviewMessage", () => {
  it("accepts the webview-ready handshake", () => {
    expect(parseWebviewMessage({ type: "webviewReady" })).toEqual({
      type: "webviewReady",
    });
  });

  it("accepts hunk toggles and bounded acceptance lists", () => {
    expect(
      parseWebviewMessage({ type: "toggleHunk", id: 2, accepted: true }),
    ).toEqual({ type: "toggleHunk", id: 2, accepted: true });
    expect(parseWebviewMessage({ type: "accept", acceptedIds: [0, 2] })).toEqual({
      type: "accept",
      acceptedIds: [0, 2],
    });
  });

  it("accepts the provider configuration request", () => {
    expect(parseWebviewMessage({ type: "configureProvider" })).toEqual({
      type: "configureProvider",
    });
  });

  it("rejects malformed messages", () => {
    expect(parseWebviewMessage({ type: "accept", acceptedIds: ["0"] })).toBeNull();
    expect(parseWebviewMessage({ type: "toggleHunk", id: -1, accepted: true })).toBeNull();
    expect(parseWebviewMessage({ type: "nope" })).toBeNull();
  });
});
