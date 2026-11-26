export type SearchMode = "fast" | "deep";

export interface ProviderResult {
  /** Parsed JSON object produced by the model (not yet validated). */
  raw: unknown;
  /** Pages the provider's own web search reported reading. */
  sources: { url: string; title?: string }[];
  /** The model that actually served the request. */
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

export interface ChatResult {
  text: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface Provider {
  id: string;
  label: string;
  isConfigured(): boolean;
  modelFor(mode: SearchMode): string;
  search(query: string, mode: SearchMode, signal: AbortSignal): Promise<ProviderResult>;
  /** Plain conversation without web search, used by the research assistant. */
  chat(system: string, turns: ChatTurn[], signal: AbortSignal): Promise<ChatResult>;
}

/** An error whose message is safe to show to the user. */
export class ProviderError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}
