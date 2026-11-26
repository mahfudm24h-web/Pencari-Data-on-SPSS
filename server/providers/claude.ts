import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import { extractJson } from "../dataset";
import { DATASET_JSON_SCHEMA, SYSTEM_INSTRUCTION, userPrompt } from "./prompt";
import { ChatResult, ChatTurn, Provider, ProviderError, ProviderResult, SearchMode } from "./types";

/** How many times a long web-search turn may be resumed after the server pauses it. */
const MAX_CONTINUATIONS = 4;

export const claudeProvider: Provider = {
  id: "claude",
  label: "Anthropic Claude",
  isConfigured: () => Boolean(config.anthropicApiKey),
  modelFor: () => config.claudeModel,

  async search(query: string, mode: SearchMode, signal: AbortSignal): Promise<ProviderResult> {
    const client = new Anthropic({ apiKey: config.anthropicApiKey });
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      { role: "user", content: userPrompt(query) },
    ];
    const sources: { url: string; title?: string }[] = [];
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      for (let turn = 0; ; turn++) {
        // Streamed so a long search does not hit HTTP timeouts.
        const message = await client.beta.messages
          .stream(
            {
              model: config.claudeModel,
              max_tokens: 64000,
              system: SYSTEM_INSTRUCTION,
              messages,
              tools: [
                {
                  type: "web_search_20260209",
                  name: "web_search",
                  max_uses: mode === "deep" ? 12 : 5,
                },
              ],
              output_config: {
                effort: mode === "deep" ? "high" : "low",
                format: { type: "json_schema", schema: DATASET_JSON_SCHEMA },
              },
              // If a safety classifier declines the request, retry it on Anthropic's
              // recommended fallback model inside the same call.
              betas: ["server-side-fallback-2026-07-01"],
              fallbacks: "default",
            },
            { signal }
          )
          .finalMessage();

        inputTokens += message.usage.input_tokens;
        outputTokens += message.usage.output_tokens;

        for (const block of message.content) {
          if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
            for (const hit of block.content) {
              if (hit.type === "web_search_result") sources.push({ url: hit.url, title: hit.title });
            }
          }
        }

        if (message.stop_reason === "refusal") {
          throw new ProviderError("Claude menolak permintaan ini. Coba ubah kalimatnya.", 422);
        }
        if (message.stop_reason === "pause_turn" && turn < MAX_CONTINUATIONS) {
          // The server paused a long search; sending the turn back resumes it.
          messages.push({ role: "assistant", content: message.content });
          continue;
        }
        if (message.stop_reason === "max_tokens") {
          throw new ProviderError("Dataset terlalu besar untuk diselesaikan. Minta rentang yang lebih sempit.");
        }
        if (message.stop_reason !== "end_turn") {
          throw new ProviderError("Claude tidak menyelesaikan pencarian. Silakan coba lagi.");
        }

        // The JSON answer is the text after the last search result.
        let text = "";
        for (const block of message.content) {
          if (block.type === "text") text += block.text;
          else if (block.type === "web_search_tool_result") text = "";
        }
        if (!text.trim()) throw new ProviderError("Claude tidak mengembalikan data. Coba ubah kalimat permintaan.");

        return { raw: extractJson(text), sources, model: message.model, inputTokens, outputTokens };
      }
    } catch (error) {
      throw mapError(error, signal);
    }
  },

  async chat(system: string, turns: ChatTurn[], signal: AbortSignal): Promise<ChatResult> {
    const client = new Anthropic({ apiKey: config.anthropicApiKey });
    try {
      const message = await client.beta.messages
        .stream(
          {
            model: config.claudeModel,
            max_tokens: 16000,
            system,
            messages: turns.map((t) => ({ role: t.role, content: t.text })),
            output_config: { effort: "low" },
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
          },
          { signal }
        )
        .finalMessage();

      if (message.stop_reason === "refusal") {
        throw new ProviderError("Claude menolak pertanyaan ini. Coba ubah kalimatnya.", 422);
      }
      const text = message.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
      if (!text) throw new ProviderError("Claude tidak memberi jawaban. Coba lagi.");
      return {
        text,
        model: message.model,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      };
    } catch (error) {
      throw mapError(error, signal);
    }
  },
};

function mapError(error: unknown, signal: AbortSignal): unknown {
  if (error instanceof ProviderError) return error;
  if (signal.aborted || error instanceof Anthropic.APIUserAbortError) {
    return new ProviderError("Permintaan terlalu lama dan dihentikan.", 504);
  }
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new ProviderError("Kunci API Claude ditolak. Minta administrator memeriksanya.", 502);
  }
  if (error instanceof Anthropic.NotFoundError) {
    return new ProviderError(`Model Claude "${config.claudeModel}" tidak tersedia. Minta administrator memperbaruinya.`, 502);
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new ProviderError("Batas pemakaian Claude tercapai. Coba lagi nanti atau pilih model lain.", 429);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new ProviderError("Tidak bisa menghubungi Claude. Coba lagi sebentar lagi.", 502);
  }
  return error;
}
