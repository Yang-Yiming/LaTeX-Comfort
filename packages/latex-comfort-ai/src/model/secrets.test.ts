import { describe, expect, it, vi } from "vitest";
import { SECRET_KEYS } from "@latex-comfort/shared";
import { readProviderApiKey, storeProviderApiKey } from "./secrets";

function memorySecrets(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    get: vi.fn(async (key: string) => values.get(key)),
    store: vi.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      values.delete(key);
    }),
  };
}

describe("provider secrets", () => {
  it("reads the selected provider's API key", async () => {
    const secrets = memorySecrets({
      "latexComfort.ai.apiKey.deepseek": "deepseek-key",
      "latexComfort.ai.apiKey.opencode-go": "opencode-key",
    });

    await expect(readProviderApiKey(secrets, "deepseek")).resolves.toBe(
      "deepseek-key",
    );
    await expect(readProviderApiKey(secrets, "opencode-go")).resolves.toBe(
      "opencode-key",
    );
  });

  it("migrates the legacy key to the custom OpenAI-compatible provider", async () => {
    const secrets = memorySecrets({
      [SECRET_KEYS.apiKeyLegacy]: "legacy-key",
    });

    await expect(
      readProviderApiKey(secrets, "openai-compatible"),
    ).resolves.toBe("legacy-key");
    expect(secrets.values.get("latexComfort.ai.apiKey.openai-compatible")).toBe(
      "legacy-key",
    );
  });

  it("stores and deletes keys without touching other providers", async () => {
    const secrets = memorySecrets({
      "latexComfort.ai.apiKey.deepseek": "old-deepseek-key",
      "latexComfort.ai.apiKey.opencode-go": "opencode-key",
    });

    await storeProviderApiKey(secrets, "deepseek", "new-deepseek-key");
    expect(secrets.values.get("latexComfort.ai.apiKey.deepseek")).toBe(
      "new-deepseek-key",
    );
    expect(secrets.values.get("latexComfort.ai.apiKey.opencode-go")).toBe(
      "opencode-key",
    );

    await storeProviderApiKey(secrets, "deepseek", "");
    expect(secrets.values.has("latexComfort.ai.apiKey.deepseek")).toBe(false);
  });
});
