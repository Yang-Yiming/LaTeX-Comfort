import { describe, expect, it, vi } from "vitest";
import { createOpenAICompatibleProvider } from "./openai-provider";

describe("OpenAI-compatible provider", () => {
  it("posts the prompt and returns a cleaned completion", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "```latex\nBetter text.\n```" } }],
      }),
    }));
    const provider = createOpenAICompatibleProvider(fetchImpl as never);

    const result = await provider.complete({
      system: "system",
      user: "user",
      signal: new AbortController().signal,
      config: {
        kind: "openai-compatible",
        baseUrl: "http://localhost:11434/v1",
        model: "qwen",
        apiKey: "secret",
        maxChars: 12000,
        temperature: 0.2,
      },
    });

    expect(result).toEqual({ text: "Better text.", label: "qwen" });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:11434/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer secret",
    );
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "qwen",
      stream: false,
    });
  });

  it("reports an HTTP failure with a readable message", async () => {
    const provider = createOpenAICompatibleProvider(
      (async () => ({
        ok: false,
        status: 401,
        text: async () => "unauthorized",
      })) as never,
    );

    await expect(
      provider.complete({
        system: "system",
        user: "user",
        signal: new AbortController().signal,
        config: {
          kind: "openai-compatible",
          baseUrl: "https://example.test/v1",
          model: "model",
          maxChars: 12000,
          temperature: 0.2,
        },
      }),
    ).rejects.toThrow("401");
  });
});
