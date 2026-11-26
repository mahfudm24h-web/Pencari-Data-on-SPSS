/** Turns raw model output into a validated, SPSS-safe dataset. */

export type VariableType = "Numeric" | "String" | "Date";
export type Measure = "Scale" | "Ordinal" | "Nominal";

export interface DatasetVariable {
  name: string;
  type: VariableType;
  width: number;
  decimals: number;
  label: string;
  measure: Measure;
}

export interface Dataset {
  title: string;
  description: string;
  suggestedAnalysis: string;
  variables: DatasetVariable[];
  data: Record<string, string | number | null>[];
  sources: { url: string; title: string }[];
  warnings: string[];
}

/** Row limit for datasets written by an AI model. */
export const MAX_ROWS = 1000;
/** Row limit for datasets fetched from BPS, which can cover every region and many years. */
export const MAX_ROWS_BPS = 20000;
export const MAX_VARIABLES = 60;

const SPSS_RESERVED = new Set([
  "ALL", "AND", "BY", "EQ", "GE", "GT", "LE", "LT", "NE", "NOT", "OR", "TO", "WITH",
]);

/**
 * Parses a number written in either English (1,234.5) or Indonesian/European (1.234,5) style.
 * Returns null when the text is not a number.
 */
export function parseNumber(input: unknown): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  if (typeof input !== "string") return null;
  let s = input.trim().replace(/[\s ]/g, "");
  if (!s) return null;
  s = s.replace(/%$/, "");
  if (!/^[-+]?[\d.,]+$/.test(s) || !/\d/.test(s)) return null;

  const dots = (s.match(/\./g) || []).length;
  const commas = (s.match(/,/g) || []).length;

  if (dots && commas) {
    // The separator that appears last is the decimal mark.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (commas) {
    // "1,234,567" or "1,234" are thousands groups; "2,5" is a decimal comma.
    if (/^[-+]?\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, "");
    else if (commas === 1) s = s.replace(",", ".");
    else return null;
  } else if (dots > 1) {
    // "1.234.567" can only be thousands groups.
    if (/^[-+]?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    else return null;
  }
  // A single dot is read as a decimal point: the prompt asks models for that format.

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Makes a legal, unique SPSS variable name. */
export function normalizeVariableName(raw: unknown, used: Set<string>, index: number): string {
  let name = String(raw ?? "")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!name) name = `var${index + 1}`;
  if (!/^[A-Za-z]/.test(name)) name = `v_${name}`;
  name = name.slice(0, 32);
  if (SPSS_RESERVED.has(name.toUpperCase())) name = `${name}_`;

  let candidate = name;
  for (let n = 2; used.has(candidate.toLowerCase()); n++) {
    candidate = `${name.slice(0, 28)}_${n}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export function sanitizeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function countDecimals(n: number): number {
  // toPrecision drops floating-point noise such as 5.300000000000001.
  const s = String(Number(n.toPrecision(12)));
  if (s.includes("e")) return 0;
  const i = s.indexOf(".");
  return i === -1 ? 0 : Math.min(s.length - i - 1, 6);
}

interface RawDataset {
  title?: unknown;
  description?: unknown;
  suggested_analysis?: unknown;
  sources?: unknown;
  variables?: unknown;
  observations?: unknown;
}

export function normalizeDataset(
  raw: unknown,
  extraSources: { url: string; title?: string }[] = [],
  maxRows = MAX_ROWS
): Dataset {
  const input = (raw && typeof raw === "object" ? raw : {}) as RawDataset;
  const warnings: string[] = [];

  const rawVars = Array.isArray(input.variables) ? input.variables.slice(0, MAX_VARIABLES) : [];
  if (rawVars.length === 0) throw new Error("AI tidak mengembalikan variabel.");

  const used = new Set<string>();
  const variables: DatasetVariable[] = rawVars.map((v: any, i) => {
    const type: VariableType = v?.type === "Numeric" || v?.type === "Date" ? v.type : "String";
    const measure: Measure =
      v?.measure === "Scale" || v?.measure === "Ordinal" ? v.measure : "Nominal";
    return {
      name: normalizeVariableName(v?.name, used, i),
      type,
      width: 8,
      decimals: 0,
      label: cleanText(v?.label, 200) || String(v?.name ?? ""),
      // A text column cannot be a scale variable in SPSS.
      measure: type === "String" && measure === "Scale" ? "Nominal" : measure,
    };
  });

  let rawRows = Array.isArray(input.observations) ? input.observations : [];
  if (rawRows.length > maxRows) {
    warnings.push(
      `Hanya ${maxRows.toLocaleString("id-ID")} baris pertama dari ${rawRows.length.toLocaleString("id-ID")} yang dipakai. Persempit pilihan untuk mendapat sisanya.`
    );
    rawRows = rawRows.slice(0, maxRows);
  }

  let misaligned = 0;
  const unparsed = new Map<string, number>();
  const data = rawRows.map((obs: any) => {
    const values: unknown[] = Array.isArray(obs?.values) ? obs.values : [];
    if (values.length !== variables.length) misaligned++;
    const row: Record<string, string | number | null> = {};
    variables.forEach((v, i) => {
      const cell = values[i];
      const text = cell === null || cell === undefined ? "" : String(cell).trim();
      if (!text) {
        row[v.name] = null;
      } else if (v.type === "Numeric") {
        const n = parseNumber(text);
        if (n === null) unparsed.set(v.name, (unparsed.get(v.name) ?? 0) + 1);
        row[v.name] = n;
      } else {
        row[v.name] = text.replace(/[\r\n]+/g, " ").slice(0, 2000);
      }
    });
    return row;
  });

  if (misaligned > 0) {
    warnings.push(
      `${misaligned} baris tidak punya nilai untuk setiap variabel; sel yang kurang dikosongkan.`
    );
  }
  for (const [name, count] of unparsed) {
    warnings.push(`${count} nilai di "${name}" bukan angka dan dikosongkan.`);
  }

  // Derive display width and decimals from the actual values.
  for (const v of variables) {
    const cells = data.map((r) => r[v.name]).filter((c) => c !== null);
    if (v.type === "Numeric") {
      v.decimals = Math.min(
        cells.reduce<number>((m, c) => Math.max(m, countDecimals(c as number)), 0),
        6
      );
      const longest = cells.reduce<number>(
        (m, c) => Math.max(m, (c as number).toFixed(v.decimals).length),
        0
      );
      v.width = Math.min(Math.max(8, longest), 40);
    } else {
      const longest = cells.reduce<number>((m, c) => Math.max(m, String(c).length), 0);
      v.width = Math.min(Math.max(8, longest), 2000);
    }
  }

  const sources: { url: string; title: string }[] = [];
  const seen = new Set<string>();
  const addSource = (urlValue: unknown, title?: unknown) => {
    const url = sanitizeUrl(urlValue);
    if (!url || seen.has(url) || sources.length >= 30) return;
    seen.add(url);
    sources.push({ url, title: cleanText(title, 200) });
  };
  if (Array.isArray(input.sources)) input.sources.forEach((s) => addSource(s));
  extraSources.forEach((s) => addSource(s.url, s.title));

  if (data.length === 0) warnings.push("AI tidak menemukan data untuk permintaan ini.");
  if (sources.length === 0) {
    warnings.push("Tidak ada tautan sumber. Anggap angka-angka ini belum terverifikasi.");
  }

  return {
    title: cleanText(input.title, 200) || "Dataset tanpa judul",
    description: cleanText(input.description, 1000),
    suggestedAnalysis: cleanText(input.suggested_analysis, 500),
    variables,
    data,
    sources,
    warnings,
  };
}

/** Pulls the JSON object out of a model reply, tolerating code fences or stray text. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("Jawaban AI bukan JSON yang sah.");
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}
