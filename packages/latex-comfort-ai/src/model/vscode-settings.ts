import * as vscode from "vscode";
import {
  DEFAULT_PROVIDER_SETTINGS,
  PROVIDERS,
  type ProviderSettings,
} from "@latex-comfort/shared";
import { createOpenAICompatibleProvider } from "./openai-provider";
import { createVscodeLmProvider } from "./vscode-lm-provider";
import { resolveProviderConfig, type ProviderConfig } from "./config";
import { getProviderPreset } from "./presets";
import { readProviderApiKey, storeProviderApiKey } from "./secrets";

const SECTION = "latexComfort.ai";

export function readProviderSettings(): ProviderSettings {
  const config = vscode.workspace.getConfiguration(SECTION);
  const providerValue = config.get<string>(
    "provider",
    DEFAULT_PROVIDER_SETTINGS.provider,
  );
  const provider = (PROVIDERS as readonly string[]).includes(providerValue)
    ? (providerValue as ProviderSettings["provider"])
    : DEFAULT_PROVIDER_SETTINGS.provider;
  const preset = getProviderPreset(provider);
  const configuredModel = config.get<string>(
    "model",
    DEFAULT_PROVIDER_SETTINGS.model,
  );
  return {
    provider,
    baseUrl: config.get<string>(
      "baseUrl",
      preset?.baseUrl ?? DEFAULT_PROVIDER_SETTINGS.baseUrl,
    ),
    model: configuredModel.trim() || preset?.defaultModel || "",
    maxChars: config.get<number>(
      "maxChars",
      DEFAULT_PROVIDER_SETTINGS.maxChars,
    ),
    temperature: config.get<number>(
      "temperature",
      DEFAULT_PROVIDER_SETTINGS.temperature,
    ),
  };
}

export async function readProviderConfig(
  context: vscode.ExtensionContext,
): Promise<ProviderConfig> {
  const settings = readProviderSettings();
  const apiKey = await readProviderApiKey(context.secrets, settings.provider);
  return resolveProviderConfig(settings, apiKey, {
    userAgent: `latex-comfort/${String(context.extension.packageJSON.version ?? "unknown")}`,
  });
}

export async function createProvider(context: vscode.ExtensionContext) {
  const config = await readProviderConfig(context);
  if (config.kind === "openai-compatible") {
    return {
      provider: createOpenAICompatibleProvider(config),
      label: config.providerLabel,
    };
  }
  return {
    provider: createVscodeLmProvider(config, {
      selectChatModels: () => vscode.lm.selectChatModels(),
      createUserMessage: (content) =>
        vscode.LanguageModelChatMessage.User(content),
    }),
    label: "VS Code language model",
  };
}

export async function configureProvider(
  context: vscode.ExtensionContext,
): Promise<void> {
  const current = readProviderSettings();
  const currentPreset = getProviderPreset(current.provider);
  const picked = await vscode.window.showQuickPick(
    [
      {
        label: "VS Code Language Model",
        description: "Use models exposed by installed chat providers",
        value: "vscode-lm" as const,
      },
      {
        label: "DeepSeek",
        description: "Official API · deepseek-flash",
        value: "deepseek" as const,
      },
      {
        label: "OpenCode Go",
        description: "OpenCode subscription · DeepSeek V4.1 Flash 1017",
        value: "opencode-go" as const,
      },
      {
        label: "OpenAI-compatible API",
        description: "OpenAI, Ollama, LM Studio or another compatible endpoint",
        value: "openai-compatible" as const,
      },
    ],
    {
      title: "LaTeX Comfort AI: Provider",
      placeHolder: `Current: ${currentPreset?.label ?? "VS Code language model"}`,
      ignoreFocusOut: true,
    },
  );
  if (!picked) return;

  const config = vscode.workspace.getConfiguration(SECTION);

  if (picked.value === "vscode-lm") {
    try {
      const models = await vscode.lm.selectChatModels();
      if (models.length) {
        const model = await vscode.window.showQuickPick(
          [
            {
              label: "Use the first available model",
              description: "Recommended unless you have a specific preference",
              id: "",
            },
            ...models.map((candidate) => ({
              label: candidate.name,
              description: candidate.family,
              detail: candidate.vendor,
              id: candidate.id,
            })),
          ],
          {
            title: "LaTeX Comfort AI: Model",
            placeHolder: "Choose a VS Code language model",
            ignoreFocusOut: true,
          },
        );
        if (model) await config.update("model", model.id, vscode.ConfigurationTarget.Global);
      }
    } catch {
      // The provider can still be selected; the first request will report the
      // actual availability error without blocking configuration.
    }
    vscode.window.showInformationMessage(
      "LaTeX Comfort AI will use models exposed by VS Code.",
    );
    await config.update("provider", picked.value, vscode.ConfigurationTarget.Global);
    return;
  }

  if (picked.value !== "openai-compatible") {
    const preset = getProviderPreset(picked.value);
    if (!preset) return;

    const existingKey = await readProviderApiKey(context.secrets, picked.value);
    const apiKey = await vscode.window.showInputBox({
      title: `LaTeX Comfort AI: ${preset.label} API Key`,
      prompt: existingKey
        ? "Stored securely in VS Code SecretStorage. Leave empty to keep the current key."
        : "Stored securely in VS Code SecretStorage. An API key is required.",
      password: true,
      ignoreFocusOut: true,
    });
    if (apiKey === undefined) return;
    if (!apiKey.trim() && !existingKey) {
      void vscode.window.showWarningMessage(
        `${preset.label} requires an API key.`,
      );
      return;
    }

    if (apiKey.trim()) {
      await storeProviderApiKey(context.secrets, picked.value, apiKey);
    }
    await Promise.all([
      config.update("provider", picked.value, vscode.ConfigurationTarget.Global),
      config.update("baseUrl", preset.baseUrl, vscode.ConfigurationTarget.Global),
      config.update("model", preset.defaultModel, vscode.ConfigurationTarget.Global),
    ]);
    vscode.window.showInformationMessage(
      `LaTeX Comfort AI is configured for ${preset.label} (${preset.displayModel ?? preset.defaultModel}).`,
    );
    return;
  }

  const baseUrl = await vscode.window.showInputBox({
    title: "LaTeX Comfort AI: Base URL",
    prompt: "OpenAI-compatible base URL",
    value: current.baseUrl,
    ignoreFocusOut: true,
    validateInput: (value) =>
      value.trim() ? undefined : "A base URL is required.",
  });
  if (baseUrl === undefined) return;

  const model = await vscode.window.showInputBox({
    title: "LaTeX Comfort AI: Model",
    prompt: "Model name, for example qwen2.5-coder or gpt-4.1-mini",
    value: current.model,
    ignoreFocusOut: true,
    validateInput: (value) =>
      value.trim() ? undefined : "A model name is required.",
  });
  if (model === undefined) return;

  const apiKey = await vscode.window.showInputBox({
    title: "LaTeX Comfort AI: API Key",
    prompt: "Stored securely in VS Code SecretStorage. Leave empty for a local endpoint or to keep the current key.",
    password: true,
    ignoreFocusOut: true,
  });
  if (apiKey === undefined) return;

  await Promise.all([
    config.update("provider", picked.value, vscode.ConfigurationTarget.Global),
    config.update("baseUrl", baseUrl.trim(), vscode.ConfigurationTarget.Global),
    config.update("model", model.trim(), vscode.ConfigurationTarget.Global),
  ]);
  if (apiKey.trim()) {
    await storeProviderApiKey(context.secrets, picked.value, apiKey);
  }
  vscode.window.showInformationMessage(
    `LaTeX Comfort AI is configured for ${model.trim()}.`,
  );
}
