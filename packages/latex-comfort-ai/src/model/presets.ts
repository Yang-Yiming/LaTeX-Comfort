import type { ProviderKind } from "@latex-comfort/shared";

export type OpenAICompatibleProviderKind = Exclude<ProviderKind, "vscode-lm">;

export interface ProviderPreset {
  id: OpenAICompatibleProviderKind;
  label: string;
  baseUrl: string;
  defaultModel: string;
  displayModel?: string;
  requiresApiKey: boolean;
  sessionHeader?: string;
  docsUrl?: string;
}

const PRESETS: Record<OpenAICompatibleProviderKind, ProviderPreset> = {
  "openai-compatible": {
    id: "openai-compatible",
    label: "OpenAI-compatible",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "",
    requiresApiKey: false,
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    defaultModel: "deepseek-flash",
    requiresApiKey: true,
    docsUrl: "https://api-docs.deepseek.com/",
  },
  "opencode-go": {
    id: "opencode-go",
    label: "OpenCode Go",
    baseUrl: "https://opencode.ai/inference/go/openai/v1",
    defaultModel: "deepseek-v4.1-flash",
    displayModel: "DeepSeek V4.1 Flash 1017",
    requiresApiKey: true,
    sessionHeader: "x-opencode-session",
    docsUrl: "https://opencode.ai/docs/console/go",
  },
};

export function getProviderPreset(
  provider: ProviderKind | string,
): ProviderPreset | undefined {
  if (provider === "vscode-lm") return undefined;
  return PRESETS[provider as OpenAICompatibleProviderKind];
}
