/** Turns a plain-language request into suggested BPS variables, using an AI provider to choose. */
import { BpsOption, BpsVariable, listDomains, listSubjects, listVariables } from "./bps";
import { extractJson } from "./dataset";
import { ChatResult, Provider, ProviderError } from "./providers/types";

export interface BpsRecommendation {
  domain: BpsOption;
  yearFrom: number | null;
  yearTo: number | null;
  items: {
    subjectId: string;
    subjectName: string;
    variableId: string;
    variableName: string;
    unit: string;
    reason: string;
  }[];
  model: string;
  inputTokens: number;
  outputTokens: number;
}

const normalize = (text: string) =>
  ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;

/**
 * Finds the region a request names. The longest region name found in the text wins; when a
 * regency and a city share a name, the word "kota" in the request picks the city.
 */
export function matchDomain(query: string, domains: BpsOption[]): BpsOption | null {
  const text = normalize(query);
  const wantsCity = text.includes(" kota ");
  let best: BpsOption | null = null;
  let bestLength = 0;
  for (const d of domains) {
    if (d.id === "0000") continue;
    const name = normalize(d.name.replace(/^(Kab\.|Kota)\s+/i, ""));
    if (name.trim().length < 3 || !text.includes(name)) continue;
    const isCity = /^Kota\s/i.test(d.name);
    const better =
      name.length > bestLength ||
      (name.length === bestLength && best !== null && isCity === wantsCity && /^Kota\s/i.test(best.name) !== wantsCity);
    if (better) {
      best = d;
      bestLength = name.length;
    }
  }
  return best;
}

async function askJson(provider: Provider, system: string, user: string, signal: AbortSignal): Promise<{ json: any; result: ChatResult }> {
  const result = await provider.chat(system, [{ role: "user", text: user }], signal);
  try {
    return { json: extractJson(result.text), result };
  } catch {
    throw new ProviderError("AI tidak memberi jawaban yang bisa dibaca. Coba lagi.", 502);
  }
}

const SYSTEM = `You help people find official statistics in the catalogue of BPS (Statistics Indonesia). You are given a request and a numbered catalogue list, and you choose the entries that best answer the request. Choose only from the list, using the ids exactly as given. Reply with a single JSON object and nothing else.`;

const year = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1900 && n <= 2100 ? n : null;
};

export async function recommendBps(
  provider: Provider,
  query: string,
  fallbackDomainId: string,
  signal: AbortSignal
): Promise<BpsRecommendation> {
  const domains = await listDomains();
  const domain =
    matchDomain(query, domains) ?? domains.find((d) => d.id === fallbackDomainId) ?? domains[0];

  const subjects = await listSubjects(domain.id);
  if (subjects.length === 0) {
    throw new ProviderError(`BPS ${domain.name} tidak punya daftar subjek. Coba wilayah lain.`, 404);
  }

  // Step 1: which subjects could hold the data, and which years are wanted.
  const first = await askJson(
    provider,
    SYSTEM,
    `Request: ${query}

Subjects available for ${domain.name} (id: name):
${subjects.map((s) => `${s.id}: ${s.name}`).join("\n")}

Pick the 1 to 3 subjects most likely to contain the requested data. Also read the years the request asks for, if any.
Reply as {"subject_ids": ["..."], "year_from": 2015 or null, "year_to": 2023 or null}`,
    signal
  );
  const subjectIds: string[] = (Array.isArray(first.json?.subject_ids) ? first.json.subject_ids : [])
    .map(String)
    .filter((id: string) => subjects.some((s) => s.id === id))
    .slice(0, 3);
  if (subjectIds.length === 0) {
    throw new ProviderError("AI tidak menemukan subjek BPS yang cocok. Coba kalimat lain.", 404);
  }

  const candidates: (BpsVariable & { subjectId: string })[] = [];
  for (const id of subjectIds) {
    for (const v of await listVariables(domain.id, id)) candidates.push({ ...v, subjectId: id });
  }
  if (candidates.length === 0) {
    throw new ProviderError(`Subjek yang cocok tidak punya variabel untuk ${domain.name}.`, 404);
  }

  // Step 2: which variables within those subjects.
  const second = await askJson(
    provider,
    SYSTEM,
    `Request: ${query}

Variables available for ${domain.name} (id: title [unit] — subject):
${candidates.slice(0, 400).map((v) => `${v.id}: ${v.name}${v.unit ? ` [${v.unit}]` : ""} — ${v.subject}`).join("\n")}

Pick up to 5 variables that best answer the request, best first. If none fits, return an empty list.
For each, give a short reason in Indonesian (one sentence) saying what the variable contains and why it fits.
Reply as {"recommendations": [{"variable_id": "...", "reason": "..."}]}`,
    signal
  );

  const seen = new Set<string>();
  const items: BpsRecommendation["items"] = [];
  for (const rec of Array.isArray(second.json?.recommendations) ? second.json.recommendations : []) {
    const variable = candidates.find((v) => v.id === String(rec?.variable_id));
    if (!variable || seen.has(variable.id)) continue;
    seen.add(variable.id);
    items.push({
      subjectId: variable.subjectId,
      subjectName: subjects.find((s) => s.id === variable.subjectId)?.name ?? variable.subject,
      variableId: variable.id,
      variableName: variable.name,
      unit: variable.unit,
      reason: typeof rec?.reason === "string" ? rec.reason.replace(/\s+/g, " ").trim().slice(0, 300) : "",
    });
    if (items.length === 5) break;
  }

  return {
    domain,
    yearFrom: year(first.json?.year_from),
    yearTo: year(first.json?.year_to),
    items,
    model: second.result.model,
    inputTokens: (first.result.inputTokens ?? 0) + (second.result.inputTokens ?? 0),
    outputTokens: (first.result.outputTokens ?? 0) + (second.result.outputTokens ?? 0),
  };
}
