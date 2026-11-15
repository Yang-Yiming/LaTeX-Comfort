import { describe, expect, it } from "vitest";
import { DEFAULT_PROVIDER_SETTINGS } from "@latex-comfort/shared";
import { resolveProviderConfig } from "./config";

describe("resolveProviderConfig", () => {
  it("uses the VS Code language model without an API key", () => {
    expect(
      resolveProviderConfig(
        { ...DEFAULT_PROVIDER_SETTINGS, provider: "vscode-lm" },
        undefined,
      ),
    ).toEqual({
      kind: "vscode-lm",
      model: "",
      maxChars: 12_000,
      temperature: 0.2,
    });
  });

  it("normalizes an OpenAI-compatible provider", () => {
    expect(
      resolveProviderConfig(
        {
          ...DEFAULT_PROVIDER_SETTINGS,
          provider: "openai-compatible",
          baseUrl: " http://localhost:11434/v1/ ",
          model: "qwen2.5-coder",
        },
        "secret",
      ),
    ).toEqual({
      kind: "openai-compatible",
      provider: "openai-compatible",
      providerLabel: "OpenAI-compatible",
      baseUrl: "http://localhost:11434/v1",
      model: "qwen2.5-coder",
      apiKey: "secret",
      maxChars: 12_000,
      temperature: 0.2,
    });
  });

  it("requires a model for an OpenAI-compatible provider", () => {
    expect(() =>
      resolveProviderConfig(
        {
          ...DEFAULT_PROVIDER_SETTINGS,
          provider: "openai-compatible",
          model: " ",
        },
        undefined,
      ),
    ).toThrow("model");
  });

  it("rejects a non-positive character limit", () => {
    expect(() =>
      resolveProviderConfig({ ...DEFAULT_PROVIDER_SETTINGS, maxChars: 0 }),
    ).toThrow("maxChars");
  });

  it("resolves the DeepSeek preset", () => {
    expect(
      resolveProviderConfig(
        {
          ...DEFAULT_PROVIDER_SETTINGS,
          provider: "deepseek",
          baseUrl: "https://ignored.example/v1",
          model: "",
        },
        "secret",
      ),
    ).toEqual({
      kind: "openai-compatible",
      provider: "deepseek",
      providerLabel: "DeepSeek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-flash",
      apiKey: "secret",
      maxChars: 12_000,
      temperature: 0.2,
    });
  });

  it("resolves the OpenCode Go preset with its request headers", () => {
    expect(
      resolveProviderConfig(
        {
          ...DEFAULT_PROVIDER_SETTINGS,
          provider: "opencode-go",
          baseUrl: "https://ignored.example/v1",
          model: "",
        },
        "secret",
        { userAgent: "latex-comfort/0.1.0" },
      ),
    ).toEqual({
      kind: "openai-compatible",
      provider: "opencode-go",
      providerLabel: "OpenCode Go",
      baseUrl: "https://opencode.ai/inference/go/openai/v1",
      model: "deepseek-v4.1-flash",
      apiKey: "secret",
      maxChars: 12_000,
      temperature: 0.2,
      userAgent: "latex-comfort/0.1.0",
      sessionHeader: "x-opencode-session",
    });
  });

  it("requires an API key for hosted presets", () => {
    expect(() =>
      resolveProviderConfig(
        { ...DEFAULT_PROVIDER_SETTINGS, provider: "deepseek" },
        undefined,
      ),
    ).toThrow("DeepSeek API key");
  });
});
