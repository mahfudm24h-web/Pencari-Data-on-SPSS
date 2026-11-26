import { SPSSDataset, SPSSVariable } from '../types';

function download(filename: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function fileBaseName(title: string): string {
  const base = title
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return base || 'dataset';
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value).replace(/[\r\n]+/g, ' ');
  return /[",]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildCsv(dataset: SPSSDataset): string {
  const lines = [dataset.variables.map((v) => csvCell(v.name)).join(',')];
  for (const row of dataset.data) {
    lines.push(dataset.variables.map((v) => csvCell(row[v.name])).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function spssFormat(v: SPSSVariable, dataset: SPSSDataset): string {
  if (v.type === 'Numeric') return `F${Math.max(v.width, v.decimals + 2)}.${v.decimals}`;
  const cells = dataset.data.map((r) => r[v.name]).filter((c) => c !== null);
  if (v.type === 'Date' && cells.length > 0 && cells.every((c) => ISO_DATE.test(String(c)))) {
    return 'SDATE10';
  }
  // String widths are counted in bytes, so leave room for non-ASCII characters.
  const longest = cells.reduce<number>((m, c) => Math.max(m, new TextEncoder().encode(String(c)).length), 1);
  return `A${Math.min(longest, 32767)}`;
}

function valueLabelLines(dataset: SPSSDataset): string[] {
  const labelled = dataset.variables.filter((v) => v.values && v.values.length > 0);
  if (labelled.length === 0) return [];
  const lines = ['', 'VALUE LABELS'];
  labelled.forEach((v, i) => {
    lines.push(`  ${i > 0 ? '/' : ''}${v.name}`);
    for (const item of v.values!) {
      // Numeric codes are written bare; codes of text variables are quoted.
      const code = v.type === 'Numeric' && Number.isFinite(Number(item.value)) ? Number(item.value) : quote(item.value);
      lines.push(`    ${code} ${quote(item.label.slice(0, 120))}`);
    }
  });
  lines[lines.length - 1] += '.';
  return lines;
}

function quote(text: string) {
  return `"${text.replace(/"/g, '""')}"`;
}

/** SPSS syntax that imports the CSV and restores labels and measurement levels. */
export function buildSpssSyntax(dataset: SPSSDataset, csvFileName: string): string {
  const vars = dataset.variables;
  const lines = [
    '* Encoding: UTF-8.',
    `* ${dataset.title.replace(/[\r\n]+/g, ' ')}.`,
    `* Dibuat oleh SPSS DataScout. Sumber: ${[dataset.providerLabel, dataset.model].filter(Boolean).join(', ')}.`,
    '* Simpan berkas ini satu folder dengan berkas CSV, atau ubah lokasi pada baris /FILE di bawah.',
    '',
    'GET DATA',
    '  /TYPE=TXT',
    `  /FILE=${quote(csvFileName)}`,
    "  /ENCODING='UTF8'",
    '  /DELCASE=LINE',
    '  /DELIMITERS=","',
    `  /QUALIFIER='"'`,
    '  /ARRANGEMENT=DELIMITED',
    '  /FIRSTCASE=2',
    '  /VARIABLES=',
    ...vars.map((v) => `    ${v.name} ${spssFormat(v, dataset)}`),
    '  .',
    'CACHE.',
    'EXECUTE.',
    '',
    'VARIABLE LABELS',
    ...vars.map((v, i) => `  ${v.name} ${quote(v.label.slice(0, 250))}${i < vars.length - 1 ? ' /' : '.'}`),
    '',
    'VARIABLE LEVEL',
    ...vars.map((v, i) => `  ${v.name} (${v.measure.toUpperCase()})${i < vars.length - 1 ? ' /' : '.'}`),
    ...valueLabelLines(dataset),
    '',
    "DATASET NAME DataScout WINDOW=FRONT.",
    '',
  ];
  return lines.join('\r\n');
}

export function downloadCsv(dataset: SPSSDataset) {
  // The BOM makes Excel and SPSS read the file as UTF-8.
  download(`${fileBaseName(dataset.title)}.csv`, '﻿' + buildCsv(dataset), 'text/csv;charset=utf-8');
}

export function downloadSpssSyntax(dataset: SPSSDataset) {
  const base = fileBaseName(dataset.title);
  download(`${base}.sps`, '﻿' + buildSpssSyntax(dataset, `${base}.csv`), 'text/plain;charset=utf-8');
}
