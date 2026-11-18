export const COMMANDS = {
  editSelection: "latexComfort.ai.editSelection",
  configureProvider: "latexComfort.ai.configureProvider",
  configureReviewSurface: "latexComfort.ai.configureReviewSurface",
  runAgent: "latexComfort.ai.runAgent",
} as const;

export const SECRET_KEYS = {
  apiKeyLegacy: "latexComfort.ai.apiKey",
  apiKeys: {
    "openai-compatible": "latexComfort.ai.apiKey.openai-compatible",
    deepseek: "latexComfort.ai.apiKey.deepseek",
    "opencode-go": "latexComfort.ai.apiKey.opencode-go",
  },
} as const;

export function providerSecretKey(
  provider: keyof typeof SECRET_KEYS.apiKeys | "vscode-lm",
): string | undefined {
  if (provider === "vscode-lm") return undefined;
  return SECRET_KEYS.apiKeys[provider];
}

export const PAPER_COMMANDS = {
  refresh: "latexComfort.papers.refresh",
  search: "latexComfort.papers.search",
  filter: "latexComfort.papers.filter",
  add: "latexComfort.papers.add",
  insertCitation: "latexComfort.papers.insertCitation",
  openEntry: "latexComfort.papers.openEntry",
  copyKey: "latexComfort.papers.copyKey",
  openLink: "latexComfort.papers.openLink",
  selectBibliography: "latexComfort.papers.selectBibliography",
} as const;
