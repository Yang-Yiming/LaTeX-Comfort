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
    const provider = createOpenAICompatibleProvider(
      {
        kind: "openai-compatible",
        provider: "openai-compatible",
        providerLabel: "OpenAI-compatible",
        baseUrl: "http://localhost:11434/v1",
        model: "qwen",
        apiKey: "secret",
        maxChars: 12000,
        temperature: 0.2,
      },
      fetchImpl as never,
    );

    const result = await provider.complete({
      system: "system",
      user: "user",
      signal: new AbortController().signal,
      sessionId: "session-1",
    });

    expect(result).toEqual({ text: "Better text.", label: "qwen" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
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
      {
        kind: "openai-compatible",
        provider: "openai-compatible",
        providerLabel: "OpenAI-compatible",
        baseUrl: "https://example.test/v1",
        model: "model",
        maxChars: 12000,
        temperature: 0.2,
      },
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
        sessionId: "session-1",
      }),
    ).rejects.toThrow("401");
  });

  it("adds OpenCode Go's session and user-agent headers", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Better text." } }],
      }),
    }));
    const provider = createOpenAICompatibleProvider(
      {
        kind: "openai-compatible",
        provider: "opencode-go",
        providerLabel: "OpenCode Go",
        baseUrl: "https://opencode.ai/inference/go/openai/v1",
        model: "deepseek-v4.1-flash",
        apiKey: "secret",
        maxChars: 12000,
        temperature: 0.2,
        userAgent: "latex-comfort/0.1.0",
        sessionHeader: "x-opencode-session",
      },
      fetchImpl as never,
    );

    await provider.complete({
      system: "system",
      user: "user",
      signal: new AbortController().signal,
      sessionId: "session-42",
    });

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toMatchObject({
      Authorization: "Bearer secret",
      "Content-Type": "application/json",
      "User-Agent": "latex-comfort/0.1.0",
      "x-opencode-session": "session-42",
    });
  });
});
