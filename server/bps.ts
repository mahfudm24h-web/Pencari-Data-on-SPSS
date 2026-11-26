/**
 * Client for the BPS (Statistics Indonesia) WebAPI, https://webapi.bps.go.id/documentation/
 *
 * Required parameters go in the path as name/value pairs with the key last; optional ones go in
 * the query string. List endpoints return `data: [pageInfo, items[]]`.
 */
import { config } from "./config";
import { Dataset, normalizeDataset } from "./dataset";
import { ProviderError } from "./providers/types";

const BASE = "https://webapi.bps.go.id/v1/api";
const TIMEOUT_MS = 30_000;
const CACHE_MS = 6 * 60 * 60 * 1000;
const MAX_PAGES = 40;
export const MAX_PERIODS = 60;

export interface BpsOption {
  id: string;
  name: string;
}

export interface BpsVariable extends BpsOption {
  unit: string;
  subject: string;
}

const cache = new Map<string, { at: number; value: unknown }>();

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

const onlyDigits = (value: unknown, max = 8): string => {
  const text = String(value ?? "");
  if (!/^\d+$/.test(text) || text.length > max) throw new ProviderError("Pilihan tidak sah.", 400);
  return text;
};

async function request(path: string, query: Record<string, string> = {}): Promise<any> {
  if (!config.bpsApiKey) throw new ProviderError("Sumber BPS belum disiapkan di server.", 503);
  const url = new URL(`${BASE}/${path}/key/${encodeURIComponent(config.bpsApiKey)}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

  let response: Response;
  let text: string;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: "application/json" } });
    text = await response.text();
  } catch {
    throw new ProviderError("Tidak bisa menghubungi server BPS. Coba lagi sebentar lagi.", 502);
  }

  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    // BPS sits behind a firewall that can answer with an HTML page instead of JSON.
    throw new ProviderError("Server BPS memberi jawaban yang tidak bisa dibaca. Coba lagi sebentar lagi.", 502);
  }
  if (response.status === 401 || body?.code === "KEY_MISSING") {
    throw new ProviderError("Kunci API BPS ditolak. Minta administrator memeriksanya.", 502);
  }
  return body;
}

const isAvailable = (body: any) => body?.status === "OK" && body?.["data-availability"] === "available";

/** Reads every page of a list endpoint. "No data" is an empty list, not an error. */
async function listAll(path: string, query: Record<string, string> = {}): Promise<any[]> {
  const items: any[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = await request(path, { ...query, page: String(page) });
    if (!isAvailable(body) || !Array.isArray(body.data)) break;
    const [info, rows] = body.data;
    if (Array.isArray(rows)) items.push(...rows);
    if (!info || !Array.isArray(rows) || rows.length === 0 || page >= Number(info.pages ?? 1)) break;
  }
  return items;
}

const stripHtml = (value: unknown) =>
  String(value ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

export function listDomains(): Promise<BpsOption[]> {
  return cached("domains", async () => {
    const rows = await listAll("domain/type/all");
    const domains = rows.map((r) => ({ id: String(r.domain_id), name: stripHtml(r.domain_name) }));
    // The national domain is not always part of the list.
    if (!domains.some((d) => d.id === "0000")) domains.unshift({ id: "0000", name: "Indonesia (nasional)" });
    return domains;
  });
}

export function listSubjects(domain: string): Promise<BpsOption[]> {
  const d = onlyDigits(domain, 4);
  return cached(`subjects:${d}`, async () =>
    (await listAll(`list/model/subject/domain/${d}`)).map((r) => ({ id: String(r.sub_id), name: stripHtml(r.title) }))
  );
}

export function listVariables(domain: string, subject: string): Promise<BpsVariable[]> {
  const d = onlyDigits(domain, 4);
  const s = onlyDigits(subject);
  return cached(`vars:${d}:${s}`, async () =>
    (await listAll(`list/model/var/domain/${d}`, { subject: s })).map((r) => ({
      id: String(r.var_id),
      name: stripHtml(r.title),
      unit: stripHtml(r.unit),
      subject: stripHtml(r.sub_name),
    }))
  );
}

/** Periods for a variable. `id` is the BPS period id (th_id), `name` is the year or period label. */
export function listPeriods(domain: string, variable: string): Promise<BpsOption[]> {
  const d = onlyDigits(domain, 4);
  const v = onlyDigits(variable);
  return cached(`periods:${d}:${v}`, async () => {
    const rows = await listAll(`list/model/th/domain/${d}`, { var: v });
    return rows
      .map((r) => ({ id: String(r.th_id), name: stripHtml(r.th) }))
      .sort((a, b) => a.name.localeCompare(b.name, "id", { numeric: true }));
  });
}

interface Labelled {
  val: number | string;
  label: string;
}

const asList = (value: unknown): Labelled[] =>
  Array.isArray(value) ? value.filter((x) => x && x.val !== undefined && x.val !== null) : [];

/**
 * Turns a `model=data` response into a dataset: one row per region and period, and one column
 * per derived variable (turvar) when the variable has several.
 *
 * Keys of `datacontent` are the ids of vervar, var, turvar, tahun and turtahun joined without a
 * separator, so they are built from the id lists rather than sliced by position.
 */
export function buildBpsDataset(body: any, domainName: string): Dataset {
  const variable = asList(body?.var)[0] as (Labelled & { unit?: string; subj?: string; note?: string; def?: string }) | undefined;
  const content: Record<string, unknown> = body?.datacontent && typeof body.datacontent === "object" ? body.datacontent : {};
  if (!variable || Object.keys(content).length === 0) {
    throw new ProviderError("BPS tidak punya data untuk pilihan ini. Coba tahun atau wilayah lain.", 404);
  }

  const none: Labelled[] = [{ val: 0, label: "" }];
  const regions = asList(body.vervar);
  const years = asList(body.tahun);
  const derived = asList(body.turvar).length ? asList(body.turvar) : none;
  const subPeriods = asList(body.turtahun).length ? asList(body.turtahun) : none;

  const unit = stripHtml(variable.unit);
  const title = stripHtml(variable.label);
  const withUnit = (label: string) => (unit ? `${label} (${unit})` : label);
  const splitDerived = derived.length > 1 && derived.length <= 40;
  const valueColumns = splitDerived
    ? derived.map((t) => ({ t, label: withUnit(stripHtml(t.label)) }))
    : [{ t: null as Labelled | null, label: withUnit(title) }];
  const showDerived = !splitDerived && derived.length > 1;
  const showSubPeriod = subPeriods.length > 1;
  const yearsAreNumeric = years.every((y) => /^\d{4}$/.test(String(y.label).trim()));

  const variables: { name: string; type: string; label: string; measure: string }[] = [
    { name: "wilayah", type: "String", label: stripHtml(body.labelvervar) || "Wilayah", measure: "Nominal" },
    { name: "tahun", type: yearsAreNumeric ? "Numeric" : "String", label: "Tahun", measure: "Ordinal" },
  ];
  if (showSubPeriod) variables.push({ name: "periode", type: "String", label: "Periode", measure: "Ordinal" });
  if (showDerived) variables.push({ name: "kategori", type: "String", label: "Kategori", measure: "Nominal" });
  valueColumns.forEach((c, i) =>
    variables.push({
      name: valueColumns.length === 1 ? "nilai" : stripHtml(c.t!.label) || `nilai_${i + 1}`,
      type: "Numeric",
      label: c.label,
      measure: "Scale",
    })
  );

  const cell = (r: Labelled, t: Labelled, y: Labelled, p: Labelled): string => {
    const raw = content[`${r.val}${variable.val}${t.val}${y.val}${p.val}`];
    return raw === null || raw === undefined ? "" : String(raw);
  };

  let matched = 0;
  const observations: { values: string[] }[] = [];
  for (const r of regions) {
    for (const y of years) {
      for (const p of subPeriods) {
        for (const t of splitDerived ? [none[0]] : derived) {
          const values = valueColumns.map((c) => cell(r, c.t ?? t, y, p));
          if (values.every((v) => v === "")) continue;
          matched += values.filter((v) => v !== "").length;
          const row = [stripHtml(r.label), String(y.label).trim()];
          if (showSubPeriod) row.push(stripHtml(p.label));
          if (showDerived) row.push(stripHtml(t.label));
          observations.push({ values: [...row, ...values] });
        }
      }
    }
  }

  // If the keys could not be matched, fail rather than hand back a partial or empty table.
  if (matched === 0) {
    throw new ProviderError("Data BPS untuk variabel ini memakai format yang belum didukung.", 502);
  }

  const note = stripHtml(variable.note);
  const dataset = normalizeDataset({
    title: `${title} – ${domainName}`,
    description: [
      stripHtml(variable.subj) && `Subjek: ${stripHtml(variable.subj)}.`,
      unit && `Satuan: ${unit}.`,
      `Wilayah: ${domainName}.`,
      note,
    ].filter(Boolean).join(" "),
    suggested_analysis: "",
    sources: ["https://www.bps.go.id/"],
    variables,
    observations,
  });
  dataset.sources = [{ url: "https://www.bps.go.id/", title: "Badan Pusat Statistik (bps.go.id)" }];
  if (matched < Object.keys(content).length) {
    dataset.warnings.push(
      `${Object.keys(content).length - matched} nilai dari BPS tidak bisa ditempatkan ke tabel dan tidak ikut ditampilkan.`
    );
  }
  return dataset;
}

export async function fetchBpsDataset(domain: string, variable: string, periodIds: string[]): Promise<Dataset> {
  const d = onlyDigits(domain, 4);
  const v = onlyDigits(variable);
  const periods = periodIds.map((p) => onlyDigits(p)).slice(0, MAX_PERIODS);
  if (periods.length === 0) throw new ProviderError("Pilih setidaknya satu tahun.", 400);

  const body = await request(`list/model/data/domain/${d}/var/${v}/th/${periods.join(";")}`);
  if (!isAvailable(body)) {
    throw new ProviderError("BPS tidak punya data untuk pilihan ini. Coba tahun atau wilayah lain.", 404);
  }
  const domainName = (await listDomains()).find((x) => x.id === d)?.name ?? d;
  return buildBpsDataset(body, domainName);
}
