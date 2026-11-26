import { BpsOption, DatasetSummary, ProviderInfo, Quota, SearchMode, SPSSDataset, User } from '../types';

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    });
  } catch {
    throw new ApiError('Tidak bisa menghubungi server. Periksa koneksi Anda lalu coba lagi.', 0);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(
      typeof payload?.error === 'string' && payload.error
        ? payload.error
        : 'Terjadi kesalahan. Silakan coba lagi.',
      response.status
    );
  }
  return payload as T;
}

const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const api = {
  me: () => request<{ user: User | null; allowRegistration: boolean }>('/api/auth/me'),
  login: (email: string, password: string) =>
    post<{ user: User }>('/api/auth/login', { email, password }),
  register: (name: string, email: string, password: string) =>
    post<{ user: User }>('/api/auth/register', { name, email, password }),
  logout: () => post<{ ok: true }>('/api/auth/logout', {}),

  providers: () => request<{ providers: ProviderInfo[]; bps: boolean; quota: Quota }>('/api/providers'),
  search: (query: string, provider: string, mode: SearchMode) =>
    post<SPSSDataset>('/api/search', { query, provider, mode }),

  askAssistant: (provider: string, context: string, messages: { role: 'user' | 'assistant'; text: string }[]) =>
    post<{ text: string; model: string; providerLabel: string }>('/api/assistant', { provider, context, messages }),

  bps: {
    domains: () => request<{ items: BpsOption[] }>('/api/bps/domains'),
    subjects: (domain: string) => request<{ items: BpsOption[] }>(`/api/bps/subjects?domain=${domain}`),
    variables: (domain: string, subject: string) =>
      request<{ items: BpsOption[] }>(`/api/bps/variables?domain=${domain}&subject=${subject}`),
    periods: (domain: string, variable: string) =>
      request<{ items: BpsOption[] }>(`/api/bps/periods?domain=${domain}&variable=${variable}`),
    dataset: (domain: string, variable: string, periods: string[]) =>
      post<SPSSDataset>('/api/bps/dataset', { domain, variable, periods }),
  },

  listDatasets: () => request<{ datasets: DatasetSummary[] }>('/api/datasets'),
  getDataset: (id: number) => request<SPSSDataset>(`/api/datasets/${id}`),
  saveDataset: (dataset: SPSSDataset) =>
    post<{ dataset: DatasetSummary }>('/api/datasets', dataset),
  updateDataset: (id: number, dataset: SPSSDataset) =>
    request<{ dataset: DatasetSummary }>(`/api/datasets/${id}`, { method: 'PUT', body: JSON.stringify(dataset) }),
  deleteDataset: (id: number) => request<{ ok: true }>(`/api/datasets/${id}`, { method: 'DELETE' }),
};
