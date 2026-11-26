import { summarize } from './stats';
import { SPSSDataset } from '../types';

const fmt = (n: number) => Number(n.toPrecision(6)).toString();

/** A compact text summary of the whole dataset for the research assistant. */
export function buildAssistantContext(dataset: SPSSDataset): string {
  const lines: string[] = [
    `Title: ${dataset.title}`,
    `Description: ${dataset.description || '-'}`,
    `Collected by: ${[dataset.providerLabel, dataset.model].filter(Boolean).join(', ')}`,
    `Rows: ${dataset.data.length}`,
    '',
    'Variables (summary statistics use all rows):',
  ];

  for (const v of dataset.variables.slice(0, 60)) {
    const cells = dataset.data.map((r) => r[v.name]);
    const present = cells.filter((c) => c !== null && c !== undefined);
    let detail: string;
    if (v.type === 'Numeric') {
      const s = summarize(present.filter((c): c is number => typeof c === 'number'));
      detail = s
        ? `n=${s.n}, mean=${fmt(s.mean)}, median=${fmt(s.median)}, sd=${fmt(s.stdDev)}, min=${fmt(s.min)}, max=${fmt(s.max)}` +
          (s.skewness === null ? '' : `, skewness=${fmt(s.skewness)}`)
        : 'no numeric values';
    } else {
      const counts = new Map<string, number>();
      for (const c of present) counts.set(String(c), (counts.get(String(c)) ?? 0) + 1);
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
      detail = `${counts.size} distinct values; most frequent: ${top.map(([k, n]) => `${k.slice(0, 40)} (${n})`).join(', ')}`;
    }
    const labels = v.values?.length ? `; value labels: ${v.values.map((x) => `${x.value}=${x.label}`).join(', ')}` : '';
    lines.push(
      `- ${v.name} [${v.type}, ${v.measure}] "${v.label}": ${detail}; missing=${cells.length - present.length}${labels}`
    );
  }

  const sample = dataset.data.slice(0, 15);
  if (sample.length > 0) {
    lines.push('', `First ${sample.length} rows (CSV):`, dataset.variables.map((v) => v.name).join(','));
    for (const row of sample) {
      lines.push(dataset.variables.map((v) => String(row[v.name] ?? '').slice(0, 60).replace(/[,\n]/g, ' ')).join(','));
    }
  }
  if (dataset.warnings.length > 0) lines.push('', `Data warnings: ${dataset.warnings.join(' ')}`);

  return lines.join('\n').slice(0, 30000);
}
