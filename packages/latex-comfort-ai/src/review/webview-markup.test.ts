import { describe, expect, it } from "vitest";
import { injectWebviewShell } from "./webview-markup";

describe("injectWebviewShell", () => {
  it("marks the document with its review surface", () => {
    const html = injectWebviewShell(
      "<!doctype html><html><head></head><body><div id=\"root\"></div></body></html>",
      "inset",
      "vscode-webview://review",
      "default-src 'none'",
    );

    expect(html).toContain('<body data-review-surface="inset">');
    expect(html).toContain('<base href="vscode-webview://review/">');
    expect(html).toContain('http-equiv="Content-Security-Policy"');
  });
});
