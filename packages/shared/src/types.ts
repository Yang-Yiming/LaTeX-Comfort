export const PROVIDERS = ["vscode-lm", "openai-compatible"] as const;

export type ProviderKind = (typeof PROVIDERS)[number];

export type EditMode = "proofread" | "polish" | "rewrite";

export interface TextPosition {
  line: number;
  character: number;
}

export interface TextRange {
  start: TextPosition;
  end: TextPosition;
}

export interface SelectionContext {
  uri: string;
  range: TextRange;
  text: string;
  languageId: string;
  documentVersion: number;
}

export interface ProviderSettings {
  provider: ProviderKind;
  baseUrl: string;
  model: string;
  maxChars: number;
  temperature: number;
}

export const DEFAULT_PROVIDER_SETTINGS: ProviderSettings = {
  provider: "vscode-lm",
  baseUrl: "https://api.openai.com/v1",
  model: "",
  maxChars: 12_000,
  temperature: 0.2,
};

export interface Hunk {
  id: number;
  from: number;
  to: number;
  insert: string;
}

export interface ReviewReadyState {
  original: string;
  proposed: string;
  hunks: Hunk[];
  mode: EditMode;
  instruction?: string;
  providerLabel: string;
  modelLabel?: string;
}

export type HostToWebviewMessage =
  | {
      type: "loading";
      mode: EditMode;
      instruction?: string;
    }
  | {
      type: "ready";
      state: ReviewReadyState;
    }
  | {
      type: "error";
      message: string;
      canConfigure: boolean;
    };

export type WebviewToHostMessage =
  | {
      type: "toggleHunk";
      id: number;
      accepted: boolean;
    }
  | {
      type: "accept";
      acceptedIds: number[];
    }
  | {
      type: "reject";
    };
