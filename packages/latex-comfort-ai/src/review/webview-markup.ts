export type ReviewWebviewSurface = "panel" | "inset";

export function injectWebviewShell(
  raw: string,
  surface: ReviewWebviewSurface,
  base: string,
  csp: string,
): string {
  const surfaceStyle =
    surface === "inset"
      ? `<style id="review-inset-layout">
html, body { margin: 0 !important; padding: 0 !important; background: transparent !important; }
#root { width: 100% !important; }
.review-shell { width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 4px 0 8px !important; }
.review-card { width: 100% !important; max-width: none !important; min-width: 0 !important; margin: 0 !important; }
.inline-diff { max-width: 100% !important; min-width: 0 !important; overflow-wrap: anywhere !important; word-break: break-word !important; }
</style>`
      : "";
  const withHead = raw.replace(
    /<head>/i,
    `<head><base href="${base}/"><meta http-equiv="Content-Security-Policy" content="${csp}">${surfaceStyle}`,
  );
  return withHead.replace(
    /<body([^>]*)>/i,
    (_match, attributes: string) =>
      `<body${attributes} data-review-surface="${surface}">`,
  );
}
