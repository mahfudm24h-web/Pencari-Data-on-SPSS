import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { api } from '../services/api';
import { BpsOption, BpsRecommendation, SPSSDataset } from '../types';

interface Props {
  loading: boolean;
  /** AI provider used for recommendations; empty when none is set up. */
  providerId: string;
  onFetch: (load: () => Promise<SPSSDataset>) => void;
  onError: (err: unknown) => void;
}

const MAX_PERIODS = 30;

const selectClass =
  'block w-full mt-1 text-sm border border-slate-300 rounded-md bg-white py-2 px-3 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-400';

/** Loads a list whenever its inputs change and clears it while they are incomplete. */
function useOptions(load: (() => Promise<{ items: BpsOption[] }>) | null, key: string, onError: (err: unknown) => void) {
  const [items, setItems] = useState<BpsOption[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setItems([]);
    if (!load) return;
    let current = true;
    setBusy(true);
    load()
      .then((r) => current && setItems(r.items))
      .catch((err) => current && onError(err))
      .finally(() => current && setBusy(false));
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { items, busy };
}

const matches = (name: string, filter: string) => {
  const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
  return words.every((w) => name.toLowerCase().includes(w));
};

const BpsPanel: React.FC<Props> = ({ loading, providerId, onFetch, onError }) => {
  const [domain, setDomain] = useState('0000');
  const [subject, setSubject] = useState('');
  const [variable, setVariable] = useState('');
  const [domainFilter, setDomainFilter] = useState('');
  const [variableFilter, setVariableFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  /** Years asked for by an applied recommendation, used once the period list arrives. */
  const [wantedYears, setWantedYears] = useState<{ from: number | null; to: number | null } | null>(null);

  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [advice, setAdvice] = useState<BpsRecommendation | null>(null);

  const domains = useOptions(() => api.bps.domains(), 'domains', onError);
  const subjects = useOptions(() => api.bps.subjects(domain), `s:${domain}`, onError);
  const variables = useOptions(subject ? () => api.bps.variables(domain, subject) : null, `v:${domain}:${subject}`, onError);
  const periods = useOptions(variable ? () => api.bps.periods(domain, variable) : null, `p:${domain}:${variable}`, onError);

  const chooseDomain = (id: string) => {
    setWantedYears(null);
    setDomain(id);
    setSubject('');
    setVariable('');
    setVariableFilter('');
  };
  const chooseSubject = (id: string) => {
    setWantedYears(null);
    setSubject(id);
    setVariable('');
    setVariableFilter('');
  };

  useEffect(() => {
    const list = periods.items;
    if (list.length === 0) {
      setFrom('');
      setTo('');
      return;
    }
    // Use the years from an applied recommendation when it gave any; otherwise the latest ten periods.
    const indexOfYear = (y: number | null, fallback: number) => {
      if (y === null) return fallback;
      const exact = list.findIndex((p) => p.name.startsWith(String(y)));
      if (exact !== -1) return exact;
      const later = list.findIndex((p) => parseInt(p.name, 10) >= y);
      return later === -1 ? list.length - 1 : later;
    };
    const last = list.length - 1;
    let a = Math.max(0, last - 9);
    let b = last;
    if (wantedYears && (wantedYears.from !== null || wantedYears.to !== null)) {
      b = indexOfYear(wantedYears.to, last);
      a = indexOfYear(wantedYears.from, Math.max(0, b - 9));
      if (a > b) [a, b] = [b, a];
    }
    setFrom(list[a].id);
    setTo(list[b].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periods.items]);

  /** Regions grouped by province: the province itself first, then its regencies and cities. */
  const domainGroups = useMemo(() => {
    const shown = domains.items.filter((d) => d.id === domain || matches(d.name, domainFilter));
    const provinces = domains.items.filter((d) => d.id.endsWith('00') && d.id !== '0000');
    return {
      national: shown.find((d) => d.id === '0000'),
      groups: provinces
        .map((p) => ({ province: p, items: shown.filter((d) => d.id.slice(0, 2) === p.id.slice(0, 2)) }))
        .filter((g) => g.items.length > 0),
    };
  }, [domains.items, domainFilter, domain]);

  const shownVariables = useMemo(
    () => variables.items.filter((v) => v.id === variable || matches(v.name, variableFilter)),
    [variables.items, variableFilter, variable]
  );

  const selectedPeriods = useMemo(() => {
    const list = periods.items;
    const a = list.findIndex((p) => p.id === from);
    const b = list.findIndex((p) => p.id === to);
    return a === -1 || b === -1 ? [] : list.slice(Math.min(a, b), Math.max(a, b) + 1);
  }, [periods.items, from, to]);

  const ask = async () => {
    if (question.trim().length < 3 || asking) return;
    setAsking(true);
    setAdvice(null);
    try {
      setAdvice(await api.bps.recommend(question.trim(), providerId, domain));
    } catch (err) {
      onError(err);
    } finally {
      setAsking(false);
    }
  };

  const apply = (item: BpsRecommendation['items'][number]) => {
    if (!advice) return;
    setDomainFilter('');
    setVariableFilter('');
    setWantedYears({ from: advice.yearFrom, to: advice.yearTo });
    setDomain(advice.domain.id);
    setSubject(item.subjectId);
    setVariable(item.variableId);
  };

  const tooMany = selectedPeriods.length > MAX_PERIODS;
  const canFetch = Boolean(variable) && selectedPeriods.length > 0 && !tooMany && !loading;
  const hint = (busy: boolean, empty: string) => (busy ? 'Memuat…' : empty);

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 text-left space-y-5">
      {providerId && (
        <div className="bg-indigo-50/60 border border-indigo-100 rounded-lg p-4">
          <label htmlFor="bps-question" className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            Belum tahu variabelnya? Minta rekomendasi AI
          </label>
          <form
            className="mt-2 flex flex-col sm:flex-row gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              ask();
            }}
          >
            <input
              id="bps-question"
              type="text"
              maxLength={500}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="mis. tingkat kemiskinan di Sulawesi Selatan 2015–2023"
              className="flex-1 text-sm border border-slate-300 rounded-md bg-white py-2 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={question.trim().length < 3 || asking}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-medium rounded-md px-4 py-2 flex items-center justify-center min-w-[130px]"
            >
              {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Beri rekomendasi'}
            </button>
          </form>
          <p className="mt-2 text-xs text-slate-500">
            AI hanya memilih variabel dari katalog BPS; angkanya tetap diambil langsung dari BPS. Sebutkan nama
            provinsi atau kabupaten/kota bila perlu.
          </p>

          {asking && <p role="status" className="mt-3 text-sm text-slate-600">Mencocokkan permintaan dengan katalog BPS…</p>}

          {advice && (
            <div className="mt-3">
              {advice.items.length === 0 ? (
                <p className="text-sm text-slate-700">
                  Tidak ada variabel yang cocok di katalog BPS {advice.domain.name}. Coba kalimat lain atau wilayah lain.
                </p>
              ) : (
                <>
                  <p className="text-sm text-slate-700">
                    Saran untuk wilayah <span className="font-medium">{advice.domain.name}</span>
                    {(advice.yearFrom || advice.yearTo) && `, tahun ${advice.yearFrom ?? '…'}–${advice.yearTo ?? '…'}`}:
                  </p>
                  <ul className="mt-2 space-y-2">
                    {advice.items.map((item) => (
                      <li key={item.variableId} className="flex items-start justify-between gap-3 bg-white border border-slate-200 rounded-md p-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900">
                            {item.variableName}
                            {item.unit && <span className="font-normal text-slate-500"> ({item.unit})</span>}
                          </p>
                          <p className="text-xs text-slate-500">{item.subjectName}</p>
                          {item.reason && <p className="mt-1 text-xs text-slate-700">{item.reason}</p>}
                        </div>
                        <button
                          type="button"
                          onClick={() => apply(item)}
                          className={`shrink-0 text-sm font-medium rounded-md px-3 py-1.5 border ${
                            variable === item.variableId && domain === advice.domain.id
                              ? 'bg-indigo-600 border-indigo-600 text-white'
                              : 'bg-white border-indigo-300 text-indigo-700 hover:bg-indigo-50'
                          }`}
                        >
                          {variable === item.variableId && domain === advice.domain.id ? 'Dipilih' : 'Pakai'}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      )}

      <form
        className="grid grid-cols-1 sm:grid-cols-2 gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (canFetch) onFetch(() => api.bps.dataset(domain, variable, selectedPeriods.map((p) => p.id)));
        }}
      >
        <div>
          <label className="text-sm font-medium text-slate-700" htmlFor="bps-domain">Wilayah</label>
          <input
            type="search"
            aria-label="Cari wilayah"
            placeholder="Cari provinsi atau kabupaten/kota"
            className={selectClass}
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.target.value)}
          />
          <select id="bps-domain" className={selectClass} value={domain} onChange={(e) => chooseDomain(e.target.value)} disabled={domains.items.length === 0}>
            {domains.items.length === 0 && <option value="0000">{hint(domains.busy, 'Indonesia (nasional)')}</option>}
            {domainGroups.national && <option value="0000">{domainGroups.national.name}</option>}
            {domainGroups.groups.map((g) => (
              <optgroup key={g.province.id} label={g.province.name}>
                {g.items.map((d) => (
                  <option key={d.id} value={d.id}>{d.id === g.province.id ? `Provinsi ${d.name}` : d.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <label className="text-sm font-medium text-slate-700 sm:self-end">
          Subjek
          <select className={selectClass} value={subject} onChange={(e) => chooseSubject(e.target.value)} disabled={subjects.items.length === 0}>
            <option value="">{hint(subjects.busy, subjects.items.length ? 'Pilih subjek' : 'Tidak ada subjek')}</option>
            {subjects.items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>

        <div className="sm:col-span-2">
          <label className="text-sm font-medium text-slate-700" htmlFor="bps-variable">Variabel</label>
          {variables.items.length > 15 && (
            <input
              type="search"
              aria-label="Saring variabel"
              placeholder="Saring daftar variabel, mis. kemiskinan"
              className={selectClass}
              value={variableFilter}
              onChange={(e) => setVariableFilter(e.target.value)}
            />
          )}
          <select id="bps-variable" className={selectClass} value={variable} onChange={(e) => { setWantedYears(null); setVariable(e.target.value); }} disabled={!subject || variables.items.length === 0}>
            <option value="">
              {!subject ? 'Pilih subjek dulu' : hint(variables.busy, variables.items.length ? `Pilih variabel (${shownVariables.length})` : 'Tidak ada variabel untuk subjek ini')}
            </option>
            {shownVariables.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>

        <label className="text-sm font-medium text-slate-700">
          Dari tahun
          <select className={selectClass} value={from} onChange={(e) => setFrom(e.target.value)} disabled={periods.items.length === 0}>
            {periods.items.length === 0 && <option value="">{!variable ? 'Pilih variabel dulu' : hint(periods.busy, 'Tidak ada data')}</option>}
            {periods.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Sampai tahun
          <select className={selectClass} value={to} onChange={(e) => setTo(e.target.value)} disabled={periods.items.length === 0}>
            {periods.items.length === 0 && <option value="">–</option>}
            {periods.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>

        <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500 max-w-md">
            {tooMany
              ? `Paling banyak ${MAX_PERIODS} tahun sekali ambil. Persempit rentangnya.`
              : periods.items.length > 0
                ? `Tersedia ${periods.items[0].name}–${periods.items[periods.items.length - 1].name}. Angka diambil langsung dari WebAPI BPS dan tidak mengurangi jatah pencarian.`
                : 'Angka diambil langsung dari WebAPI BPS, tanpa AI, dan tidak mengurangi jatah pencarian.'}
          </p>
          <button
            type="submit"
            disabled={!canFetch}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium rounded-lg px-6 py-2 transition-colors flex items-center justify-center min-w-[120px]"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Ambil data'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default BpsPanel;
