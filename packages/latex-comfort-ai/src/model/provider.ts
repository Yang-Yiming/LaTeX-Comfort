import type { ProviderConfig } from "./config";

export interface CompletionRequest {
  system: string;
  user: string;
  config: ProviderConfig;
  signal: AbortSignal;
}

export interface CompletionResult {
  text: string;
  label: string;
}

export interface EditProvider {
  complete(request: CompletionRequest): Promise<CompletionResult>;
}
