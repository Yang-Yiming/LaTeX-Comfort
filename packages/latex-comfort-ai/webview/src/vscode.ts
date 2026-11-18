import type {
  AgentWebviewToHostMessage,
  WebviewToHostMessage,
} from "@latex-comfort/shared";

type VsCodeApi = {
  postMessage(message: WebviewToHostMessage | AgentWebviewToHostMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
};

declare function acquireVsCodeApi(): VsCodeApi;

export const vscode = acquireVsCodeApi();
