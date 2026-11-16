export type ReviewWebviewSurface = "panel" | "inset";

export function injectWebviewShell(
  raw: string,
  surface: ReviewWebviewSurface,
  base: string,
  csp: string,
): string {
  const withHead = raw.replace(
    /<head>/i,
    `<head><base href="${base}/"><meta http-equiv="Content-Security-Policy" content="${csp}">`,
  );
  return withHead.replace(
    /<body([^>]*)>/i,
    (_match, attributes: string) =>
      `<body${attributes} data-review-surface="${surface}">`,
  );
}
