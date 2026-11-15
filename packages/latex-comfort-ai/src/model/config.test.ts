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
});
