export const COMMANDS = {
  editSelection: "latexComfort.ai.editSelection",
  configureProvider: "latexComfort.ai.configureProvider",
  configureReviewSurface: "latexComfort.ai.configureReviewSurface",
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
