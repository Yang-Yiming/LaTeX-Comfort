import { describe, expect, it } from "vitest";
import {
  COMMANDS,
  DEFAULT_PROVIDER_SETTINGS,
  PAPER_COMMANDS,
  PROVIDERS,
  SECRET_KEYS,
  providerSecretKey,
} from "./index";

describe("shared contracts", () => {
  it("keeps command ids stable and namespaced", () => {
    expect(COMMANDS.editSelection).toBe("latexComfort.ai.editSelection");
    expect(COMMANDS.configureProvider).toBe(
      "latexComfort.ai.configureProvider",
    );
    expect(COMMANDS.runAgent).toBe("latexComfort.ai.runAgent");
    expect(Object.values(COMMANDS).every((id) => id.startsWith("latexComfort.ai."))).toBe(
      true,
    );
  });

  it("keeps paper command ids stable and namespaced", () => {
    expect(PAPER_COMMANDS.refresh).toBe("latexComfort.papers.refresh");
    expect(PAPER_COMMANDS.search).toBe("latexComfort.papers.search");
    expect(PAPER_COMMANDS.filter).toBe("latexComfort.papers.filter");
    expect(PAPER_COMMANDS.insertCitation).toBe("latexComfort.papers.insertCitation");
    expect(Object.values(PAPER_COMMANDS).every((id) => id.startsWith("latexComfort.papers."))).toBe(true);
  });

  it("offers the supported providers", () => {
    expect(PROVIDERS).toEqual([
      "vscode-lm",
      "openai-compatible",
      "deepseek",
      "opencode-go",
    ]);
  });

  it("uses conservative provider defaults", () => {
    expect(DEFAULT_PROVIDER_SETTINGS).toEqual({
      provider: "vscode-lm",
      baseUrl: "https://api.openai.com/v1",
      model: "",
      maxChars: 12000,
      temperature: 0.2,
    });
  });

  it("keeps API keys isolated by provider", () => {
    expect(SECRET_KEYS.apiKeyLegacy).toBe("latexComfort.ai.apiKey");
    expect(providerSecretKey("deepseek")).toBe(
      "latexComfort.ai.apiKey.deepseek",
    );
    expect(providerSecretKey("opencode-go")).toBe(
      "latexComfort.ai.apiKey.opencode-go",
    );
    expect(providerSecretKey("openai-compatible")).toBe(
      "latexComfort.ai.apiKey.openai-compatible",
    );
    expect(providerSecretKey("vscode-lm")).toBeUndefined();
  });
});
