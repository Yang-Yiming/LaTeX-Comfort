import type { ProviderConfig } from "./config";
import type { EditProvider } from "./provider";
import { cleanModelReply } from "./prompt";

type FetchResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
};

type FetchLike = (
  input: string,
  init: RequestInit,
) => Promise<FetchResponse>;

type ChatCompletion = {
  choices?: Array<{ message?: { content?: string | null } }>;
};

/** Adapter for OpenAI-compatible /v1/chat/completions endpoints. */
export function createOpenAICompatibleProvider(
  config: ProviderConfig,
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
): EditProvider {
  if (config.kind !== "openai-compatible") {
    throw new Error("The OpenAI-compatible provider received another provider config.");
  }
  return {
    async complete(request) {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
      if (config.userAgent) headers["User-Agent"] = config.userAgent;
      if (config.sessionHeader) {
        headers[config.sessionHeader] = request.sessionId;
      }

      const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        signal: request.signal,
        body: JSON.stringify({
          model: config.model,
          stream: false,
          temperature: config.temperature,
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user },
          ],
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(
          `AI provider returned HTTP ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
        );
      }

      const payload = (await response.json()) as ChatCompletion;
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        throw new Error("AI provider returned no message content.");
      }
      const text = cleanModelReply(content);
      if (!text) throw new Error("AI provider returned an empty replacement.");
      return { text, label: config.model };
    },
  };
}
