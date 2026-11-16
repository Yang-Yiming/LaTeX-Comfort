import { readFile } from "node:fs/promises";
import * as vscode from "vscode";

export async function webviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
): Promise<string> {
  const root = vscode.Uri.joinPath(extensionUri, "dist", "webview");
  const raw = await readFile(
    vscode.Uri.joinPath(root, "index.html").fsPath,
    "utf8",
  );
  const base = webview.asWebviewUri(root).toString();
  const csp = [
    "default-src 'none'",
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src ${webview.cspSource}`,
    `img-src ${webview.cspSource} data:`,
    `font-src ${webview.cspSource}`,
  ].join("; ");
  return raw.replace(
    /<head>/i,
    `<head><base href="${base}/"><meta http-equiv="Content-Security-Policy" content="${csp}">`,
  );
}
