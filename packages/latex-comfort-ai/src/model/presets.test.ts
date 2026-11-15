import { describe, expect, it } from "vitest";
import { getProviderPreset } from "./presets";

describe("provider presets", () => {
  it("uses the official DeepSeek endpoint and model", () => {
    expect(getProviderPreset("deepseek")).toMatchObject({
      label: "DeepSeek",
      baseUrl: "https://api.deepseek.com",
      defaultModel: "deepseek-flash",
      requiresApiKey: true,
    });
  });

  it("uses OpenCode Go's request model ID and session header", () => {
    expect(getProviderPreset("opencode-go")).toMatchObject({
      label: "OpenCode Go",
      baseUrl: "https://opencode.ai/inference/go/openai/v1",
      defaultModel: "deepseek-v4.1-flash",
      displayModel: "DeepSeek V4.1 Flash 1017",
      requiresApiKey: true,
      sessionHeader: "x-opencode-session",
    });
  });
});
