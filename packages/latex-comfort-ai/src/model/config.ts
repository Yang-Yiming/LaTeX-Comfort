import type { ProviderSettings } from "@latex-comfort/shared";
import {
  getProviderPreset,
  type OpenAICompatibleProviderKind,
} from "./presets";

export type ProviderConfig =
  | {
      kind: "vscode-lm";
      model: string;
      maxChars: number;
      temperature: number;
    }
  | {
      kind: "openai-compatible";
      provider: OpenAICompatibleProviderKind;
      providerLabel: string;
      baseUrl: string;
      model: string;
      apiKey?: string;
      maxChars: number;
      temperature: number;
      userAgent?: string;
      sessionHeader?: string;
    };

export interface ResolveProviderOptions {
  userAgent?: string;
}

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
  options: ResolveProviderOptions = {},
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

  const preset = getProviderPreset(settings.provider);
  if (!preset) {
    throw new Error(`Unsupported provider: ${settings.provider}`);
  }

  const baseUrl =
    settings.provider === "openai-compatible"
      ? settings.baseUrl.trim().replace(/\/+$/, "")
      : preset.baseUrl;
  const model = settings.model.trim() || preset.defaultModel;
  if (!baseUrl) throw new Error("baseUrl is required for an OpenAI-compatible provider.");
  if (!model) throw new Error("model is required for an OpenAI-compatible provider.");
  if (preset.requiresApiKey && !apiKey?.trim()) {
    throw new Error(
      `${preset.label} API key is required. Run "LaTeX Comfort AI: Configure Provider".`,
    );
  }

  return {
    kind: "openai-compatible",
    provider: preset.id,
    providerLabel: preset.label,
    baseUrl,
    model,
    ...(apiKey?.trim() ? { apiKey: apiKey.trim() } : {}),
    maxChars: settings.maxChars,
    temperature: settings.temperature,
    ...(options.userAgent ? { userAgent: options.userAgent } : {}),
    ...(preset.sessionHeader ? { sessionHeader: preset.sessionHeader } : {}),
  };
}
