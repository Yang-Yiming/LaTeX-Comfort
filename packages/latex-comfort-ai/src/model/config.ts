import type { ProviderSettings } from "@latex-comfort/shared";

export type ProviderConfig =
  | {
      kind: "vscode-lm";
      model: string;
      maxChars: number;
      temperature: number;
    }
  | {
      kind: "openai-compatible";
      baseUrl: string;
      model: string;
      apiKey?: string;
      maxChars: number;
      temperature: number;
    };

function validateCommon(settings: ProviderSettings): void {
  if (!Number.isFinite(settings.maxChars) || settings.maxChars < 1) {
    throw new Error("maxChars must be greater than zero.");
  }
  if (
    !Number.isFinite(settings.temperature) ||
    settings.temperature < 0 ||
    settings.temperature > 2
  ) {
    throw new Error("temperature must be between 0 and 2.");
  }
}

/** Validates user settings and converts them into the provider's runtime config. */
export function resolveProviderConfig(
  settings: ProviderSettings,
  apiKey?: string,
): ProviderConfig {
  validateCommon(settings);
  if (settings.provider === "vscode-lm") {
    return {
      kind: "vscode-lm",
      model: settings.model.trim(),
      maxChars: settings.maxChars,
      temperature: settings.temperature,
    };
  }

  const baseUrl = settings.baseUrl.trim().replace(/\/+$/, "");
  const model = settings.model.trim();
  if (!baseUrl) throw new Error("baseUrl is required for an OpenAI-compatible provider.");
  if (!model) throw new Error("model is required for an OpenAI-compatible provider.");

  return {
    kind: "openai-compatible",
    baseUrl,
    model,
    ...(apiKey?.trim() ? { apiKey: apiKey.trim() } : {}),
    maxChars: settings.maxChars,
    temperature: settings.temperature,
  };
}
