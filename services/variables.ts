import { CellValue, SPSSDataset, SPSSVariable } from '../types';

const RESERVED = new Set(['ALL', 'AND', 'BY', 'EQ', 'GE', 'GT', 'LE', 'LT', 'NE', 'NOT', 'OR', 'TO', 'WITH']);

/** Returns an Indonesian error message, or null when the names are valid for SPSS. */
export function validateVariableNames(names: string[]): string | null {
  const seen = new Set<string>();
  for (const raw of names) {
    const name = raw.trim();
    if (!name) return 'Nama variabel tidak boleh kosong.';
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
      return `Nama "${name}" tidak sah. Gunakan huruf, angka, dan garis bawah, diawali huruf.`;
    }
    if (name.length > 32) return `Nama "${name}" terlalu panjang (maksimal 32 karakter).`;
    if (RESERVED.has(name.toUpperCase())) return `"${name}" adalah kata khusus SPSS dan tidak bisa dipakai.`;
    if (seen.has(name.toLowerCase())) return `Nama "${name}" dipakai lebih dari sekali.`;
    seen.add(name.toLowerCase());
  }
  return null;
}

export interface EditedVariable extends SPSSVariable {
  /** Name of the column this variable came from; undefined for a new variable. */
  originalName?: string;
}

function convertCell(value: CellValue | undefined, variable: SPSSVariable): CellValue {
  if (value === null || value === undefined || value === '') return null;
  if (variable.type === 'Numeric') {
    if (typeof value === 'number') return value;
    const n = Number(String(value).trim());
    return Number.isFinite(n) ? n : null;
  }
  return String(value);
}

function countDecimals(n: number): number {
  // toPrecision drops floating-point noise such as 5.300000000000001.
  const text = String(Number(n.toPrecision(12)));
  const dot = text.indexOf('.');
  return text.includes('e') || dot === -1 ? 0 : Math.min(text.length - dot - 1, 6);
}

/** Applies Variable View edits: renames, removals, additions and type changes. */
export function applyVariableEdits(dataset: SPSSDataset, edited: EditedVariable[]): SPSSDataset {
  const variables: SPSSVariable[] = edited.map(({ originalName: _original, ...v }) => ({
    ...v,
    name: v.name.trim(),
    label: v.label.trim(),
    measure: v.type !== 'Numeric' && v.measure === 'Scale' ? 'Nominal' : v.measure,
    values: v.values?.filter((x) => x.value.trim() !== '' && x.label.trim() !== ''),
  }));

  const data = dataset.data.map((row) => {
    const next: Record<string, CellValue> = {};
    edited.forEach((e, i) => {
      next[variables[i].name] = convertCell(e.originalName ? row[e.originalName] : null, variables[i]);
    });
    return next;
  });

  for (const v of variables) {
    const cells = data.map((r) => r[v.name]).filter((c) => c !== null);
    if (v.type === 'Numeric') {
      const found = cells.reduce<number>((m, c) => Math.max(m, countDecimals(c as number)), 0);
      v.decimals = Math.min(Math.max(v.decimals, found), 6);
      const longest = cells.reduce<number>((m, c) => Math.max(m, (c as number).toFixed(v.decimals).length), 0);
      v.width = Math.min(Math.max(8, longest), 40);
    } else {
      v.decimals = 0;
      v.width = Math.max(8, cells.reduce<number>((m, c) => Math.max(m, String(c).length), 0));
    }
    if (!v.values?.length) delete v.values;
  }

  return { ...dataset, variables, data };
}
