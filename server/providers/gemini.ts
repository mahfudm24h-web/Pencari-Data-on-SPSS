import { GoogleGenAI, Type } from "@google/genai";
import { config } from "../config";
import { extractJson } from "../dataset";
import { SYSTEM_INSTRUCTION, userPrompt } from "./prompt";
import { ChatResult, ChatTurn, Provider, ProviderError, ProviderResult, SearchMode } from "./types";

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

function mapError(error: unknown, signal: AbortSignal, model: string): unknown {
  if (signal.aborted) return new ProviderError("Permintaan terlalu lama dan dihentikan.", 504);
  const status = statusOf(error);
  const message = error instanceof Error ? error.message : "";
  if (status === 401 || status === 403 || message.includes("API key not valid")) {
    return new ProviderError("Kunci API Gemini ditolak. Minta administrator memeriksanya.", 502);
  }
  if (status === 429) {
    return new ProviderError("Batas pemakaian Gemini tercapai. Coba lagi nanti atau pilih model lain.", 429);
  }
  if (status === 404) {
    return new ProviderError(`Model Gemini "${model}" tidak tersedia. Minta administrator memperbaruinya.`, 502);
  }
  // fetch() reports network failures as TypeError.
  if (error instanceof TypeError) {
    return new ProviderError("Tidak bisa menghubungi Gemini. Coba lagi sebentar lagi.", 502);
  }
  return error;
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
      throw mapError(error, signal, model);
    }

    const text = response.text;
    if (!text) throw new ProviderError("Gemini tidak mengembalikan data. Coba ubah kalimat permintaan.");

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
  async chat(system: string, turns: ChatTurn[], signal: AbortSignal): Promise<ChatResult> {
    const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
    const model = config.geminiModelFast;
    try {
      const response = await ai.models.generateContent({
        model,
        contents: turns.map((t) => ({ role: t.role === "user" ? "user" : "model", parts: [{ text: t.text }] })),
        config: { systemInstruction: system, abortSignal: signal },
      });
      if (!response.text) throw new ProviderError("Gemini tidak memberi jawaban. Coba lagi.");
      return {
        text: response.text,
        model: response.modelVersion || model,
        inputTokens: response.usageMetadata?.promptTokenCount,
        outputTokens:
          (response.usageMetadata?.candidatesTokenCount ?? 0) +
          (response.usageMetadata?.thoughtsTokenCount ?? 0),
      };
    } catch (error) {
      throw error instanceof ProviderError ? error : mapError(error, signal, model);
    }
  },
};
