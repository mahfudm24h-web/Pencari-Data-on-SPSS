export interface NumericSummary {
  n: number;
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  /** Adjusted Fisher-Pearson skewness (the one SPSS reports); null when n < 3 or no spread. */
  skewness: number | null;
}

export function summarize(values: number[]): NumericSummary | null {
  const n = values.length;
  if (n === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const mid = Math.floor(n / 2);
  const median = n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const variance = n > 1 ? values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (n - 1) : 0;
  const stdDev = Math.sqrt(variance);

  let skewness: number | null = null;
  if (n > 2 && stdDev > 0) {
    const cubed = values.reduce((acc, v) => acc + (v - mean) ** 3, 0);
    skewness = (n * cubed) / ((n - 1) * (n - 2) * stdDev ** 3);
  }
  return { n, mean, median, stdDev, min: sorted[0], max: sorted[n - 1], skewness };
}

export interface HistogramBin {
  name: string;
  count: number;
}

export function histogram(values: number[]): HistogramBin[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [{ name: String(min), count: values.length }];
  const binCount = Math.max(2, Math.min(12, Math.ceil(Math.sqrt(values.length))));
  const size = (max - min) / binCount;
  const fmt = (n: number) => Number(n.toPrecision(4)).toLocaleString('id-ID');
  const bins = Array.from({ length: binCount }, (_, i) => ({
    name: `${fmt(min + i * size)} – ${fmt(min + (i + 1) * size)}`,
    count: 0,
  }));
  for (const v of values) bins[Math.min(Math.floor((v - min) / size), binCount - 1)].count++;
  return bins;
}
