import { describe, expect, it } from "vitest";
import {
  COMMANDS,
  DEFAULT_PROVIDER_SETTINGS,
  PROVIDERS,
} from "./index";

describe("shared contracts", () => {
  it("keeps command ids stable and namespaced", () => {
    expect(COMMANDS.editSelection).toBe("latexComfort.ai.editSelection");
    expect(COMMANDS.configureProvider).toBe(
      "latexComfort.ai.configureProvider",
    );
    expect(Object.values(COMMANDS).every((id) => id.startsWith("latexComfort.ai."))).toBe(
      true,
    );
  });

  it("offers the two supported providers", () => {
    expect(PROVIDERS).toEqual(["vscode-lm", "openai-compatible"]);
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
});
