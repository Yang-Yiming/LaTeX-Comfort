import { describe, expect, it, vi } from "vitest";
import { createVscodeLmProvider } from "./vscode-lm-provider";

describe("VS Code language model provider", () => {
  it("uses the selected model and joins streamed text", async () => {
    const sendRequest = vi.fn(async () => ({
      text: (async function* () {
        yield "Better ";
        yield "text.";
      })(),
    }));
    const model = {
      id: "gpt-test",
      family: "gpt",
      vendor: "copilot",
      name: "Test Model",
      maxInputTokens: 1000,
      sendRequest,
    };
    const provider = createVscodeLmProvider({
      selectChatModels: async () => [model],
      createUserMessage: (content: string) => content,
    });

    const result = await provider.complete({
      system: "system",
      user: "user",
      signal: new AbortController().signal,
      config: {
        kind: "vscode-lm",
        model: "gpt",
        maxChars: 12000,
        temperature: 0.2,
      },
    });

    expect(result).toEqual({ text: "Better text.", label: "Test Model" });
    expect(sendRequest).toHaveBeenCalledOnce();
  });

  it("fails clearly when no model is available", async () => {
    const provider = createVscodeLmProvider({
      selectChatModels: async () => [],
      createUserMessage: (content: string) => content,
    });

    await expect(
      provider.complete({
        system: "system",
        user: "user",
        signal: new AbortController().signal,
        config: {
          kind: "vscode-lm",
          model: "",
          maxChars: 12000,
          temperature: 0.2,
        },
      }),
    ).rejects.toThrow("language model");
  });
});
