import { GoogleGenAI, Type } from "@google/genai";
import { config } from "../config";
import { extractJson } from "../dataset";
import { SYSTEM_INSTRUCTION, userPrompt } from "./prompt";
import { Provider, ProviderError, ProviderResult, SearchMode } from "./types";

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    description: { type: Type.STRING },
    suggested_analysis: { type: Type.STRING },
    sources: { type: Type.ARRAY, items: { type: Type.STRING } },
    variables: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          type: { type: Type.STRING, enum: ["Numeric", "String", "Date"] },
          label: { type: Type.STRING },
          measure: { type: Type.STRING, enum: ["Scale", "Ordinal", "Nominal"] },
        },
        required: ["name", "type", "label", "measure"],
      },
    },
    observations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { values: { type: Type.ARRAY, items: { type: Type.STRING } } },
        required: ["values"],
      },
    },
  },
  required: ["title", "description", "suggested_analysis", "sources", "variables", "observations"],
};

function statusOf(error: unknown): number | undefined {
  const e = error as { status?: unknown; code?: unknown } | null;
  if (typeof e?.status === "number") return e.status;
  if (typeof e?.code === "number") return e.code;
  return undefined;
}

export const geminiProvider: Provider = {
  id: "gemini",
  label: "Google Gemini",
  isConfigured: () => Boolean(config.geminiApiKey),
  modelFor: (mode) => (mode === "deep" ? config.geminiModelDeep : config.geminiModelFast),

  async search(query: string, mode: SearchMode, signal: AbortSignal): Promise<ProviderResult> {
    const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
    const model = this.modelFor(mode);

    let response;
    try {
      response = await ai.models.generateContent({
        model,
        contents: userPrompt(query),
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          abortSignal: signal,
        },
      });
    } catch (error) {
      if (signal.aborted) throw new ProviderError("The search took too long and was stopped.", 504);
      const status = statusOf(error);
      const message = error instanceof Error ? error.message : "";
      if (status === 401 || status === 403 || message.includes("API key not valid")) {
        throw new ProviderError("The Gemini API key was rejected. Ask the administrator to check it.", 502);
      }
      if (status === 429) {
        throw new ProviderError("Gemini's usage limit was reached. Try again later or pick another model.", 429);
      }
      if (status === 404) {
        throw new ProviderError(`Gemini model "${model}" is not available. Ask the administrator to update it.`, 502);
      }
      if (error instanceof TypeError) {
        // fetch() reports network failures as TypeError.
        throw new ProviderError("Could not reach Gemini. Please try again in a moment.", 502);
      }
      throw error;
    }

    const text = response.text;
    if (!text) throw new ProviderError("Gemini returned no data. Try rephrasing the request.");

    const sources: { url: string; title?: string }[] = [];
    for (const chunk of response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []) {
      // Grounding links are Google redirect URLs; the title carries the real site name.
      if (chunk.web?.uri) sources.push({ url: chunk.web.uri, title: chunk.web.title });
    }

    return {
      raw: extractJson(text),
      sources,
      model: response.modelVersion || model,
      inputTokens: response.usageMetadata?.promptTokenCount,
      outputTokens:
        (response.usageMetadata?.candidatesTokenCount ?? 0) +
        (response.usageMetadata?.thoughtsTokenCount ?? 0),
    };
  },
};
