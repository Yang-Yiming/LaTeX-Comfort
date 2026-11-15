import type { EditProvider } from "./provider";
import { cleanModelReply } from "./prompt";

export interface LanguageModelLike {
  id: string;
  family: string;
  vendor: string;
  name: string;
  sendRequest(
    messages: unknown[],
    options?: unknown,
    token?: unknown,
  ): Promise<{ text: AsyncIterable<string> }>;
}

export interface VscodeLmDependencies {
  selectChatModels(): Promise<LanguageModelLike[]>;
  createUserMessage(content: string): unknown;
}

/** Adapter for models contributed through the stable `vscode.lm` API. */
export function createVscodeLmProvider(
  dependencies: VscodeLmDependencies,
): EditProvider {
  return {
    async complete(request) {
      const config = request.config;
      if (config.kind !== "vscode-lm") {
        throw new Error("The VS Code language model provider received another provider config.");
      }

      const models = await dependencies.selectChatModels();
      if (!models.length) {
        throw new Error(
          "No VS Code language model is available. Install a chat model provider or configure an OpenAI-compatible provider.",
        );
      }
      const model =
        (config.model
          ? models.find(
              (candidate) =>
                candidate.id === config.model || candidate.family === config.model,
            )
          : undefined) ?? models[0]!;

      const message = dependencies.createUserMessage(
        `${request.system}\n\n${request.user}`,
      );
      const response = await model.sendRequest([message]);
      let raw = "";
      for await (const chunk of response.text) raw += chunk;
      const text = cleanModelReply(raw);
      if (!text) throw new Error("AI provider returned an empty replacement.");
      return { text, label: model.name };
    },
  };
}
