export type VariableType = 'Numeric' | 'String' | 'Date';
export type MeasureType = 'Scale' | 'Ordinal' | 'Nominal';
export type SearchMode = 'fast' | 'deep';
export type CellValue = string | number | null;

export interface SPSSVariable {
  name: string;
  type: VariableType;
  width: number;
  decimals: number;
  label: string;
  measure: MeasureType;
  /** Value labels, e.g. 1 = "Laki-laki". */
  values?: ValueLabel[];
}

export interface ValueLabel {
  value: string;
  label: string;
}

export interface DataSource {
  url: string;
  title: string;
}

export interface SPSSDataset {
  id?: number;
  title: string;
  description: string;
  suggestedAnalysis: string;
  variables: SPSSVariable[];
  data: Record<string, CellValue>[];
  sources: DataSource[];
  warnings: string[];
  provider: string;
  providerLabel: string;
  model: string;
  mode: SearchMode | 'bps';
  query: string;
  retrievedAt: string;
  savedAt?: string;
}

export interface DatasetSummary {
  id: number;
  title: string;
  description: string;
  rowCount: number;
  savedAt: string;
}

export interface User {
  id: number;
  email: string;
  name: string;
  role: 'user' | 'admin';
}

export interface BpsOption {
  id: string;
  name: string;
}

export interface ProviderInfo {
  id: string;
  label: string;
  models: { fast: string; deep: string };
}

export interface Quota {
  used: number;
  usedDeep: number;
  limit: number;
  limitDeep: number;
  unlimited: boolean;
}
