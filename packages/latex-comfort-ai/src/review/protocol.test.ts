import { describe, expect, it } from "vitest";
import { parseWebviewMessage } from "./protocol";

describe("parseWebviewMessage", () => {
  it("accepts the webview-ready handshake", () => {
    expect(parseWebviewMessage({ type: "webviewReady" })).toEqual({
      type: "webviewReady",
    });
  });

  it("accepts hunk toggles and the controller-owned acceptance action", () => {
    expect(
      parseWebviewMessage({ type: "toggleHunk", id: 2, accepted: true }),
    ).toEqual({ type: "toggleHunk", id: 2, accepted: true });
    expect(parseWebviewMessage({ type: "accept" })).toEqual({ type: "accept" });
    expect(parseWebviewMessage({ type: "openSidebar" })).toEqual({
      type: "openSidebar",
    });
    expect(parseWebviewMessage({ type: "contentHeight", height: 248 })).toEqual({
      type: "contentHeight",
      height: 248,
    });
  });

  it("accepts the provider configuration request", () => {
    expect(parseWebviewMessage({ type: "configureProvider" })).toEqual({
      type: "configureProvider",
    });
  });

  it("rejects malformed messages", () => {
    expect(parseWebviewMessage({ type: "toggleHunk", id: -1, accepted: true })).toBeNull();
    expect(parseWebviewMessage({ type: "contentHeight", height: -1 })).toBeNull();
    expect(parseWebviewMessage({ type: "nope" })).toBeNull();
  });
});
