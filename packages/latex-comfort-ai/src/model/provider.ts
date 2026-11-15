export interface CompletionRequest {
  system: string;
  user: string;
  signal: AbortSignal;
  sessionId: string;
}

export interface CompletionResult {
  text: string;
  label: string;
}

export interface EditProvider {
  complete(request: CompletionRequest): Promise<CompletionResult>;
}
