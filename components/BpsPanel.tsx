import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '../services/api';
import { BpsOption, SPSSDataset } from '../types';

interface Props {
  loading: boolean;
  onFetch: (load: () => Promise<SPSSDataset>) => void;
  onError: (err: unknown) => void;
}

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

const BpsPanel: React.FC<Props> = ({ loading, onFetch, onError }) => {
  const [domain, setDomain] = useState('0000');
  const [subject, setSubject] = useState('');
  const [variable, setVariable] = useState('');
  const [filter, setFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const domains = useOptions(() => api.bps.domains(), 'domains', onError);
  const subjects = useOptions(() => api.bps.subjects(domain), `s:${domain}`, onError);
  const variables = useOptions(subject ? () => api.bps.variables(domain, subject) : null, `v:${domain}:${subject}`, onError);
  const periods = useOptions(variable ? () => api.bps.periods(domain, variable) : null, `p:${domain}:${variable}`, onError);

  useEffect(() => { setSubject(''); }, [domain]);
  useEffect(() => { setVariable(''); setFilter(''); }, [domain, subject]);
  useEffect(() => {
    // Default to the most recent ten periods.
    const list = periods.items;
    setFrom(list[Math.max(0, list.length - 10)]?.id ?? '');
    setTo(list[list.length - 1]?.id ?? '');
  }, [periods.items]);

  const shownVariables = useMemo(() => {
    const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
    return variables.items.filter((v) => words.every((w) => v.name.toLowerCase().includes(w)));
  }, [variables.items, filter]);

  const selectedPeriods = useMemo(() => {
    const list = periods.items;
    const a = list.findIndex((p) => p.id === from);
    const b = list.findIndex((p) => p.id === to);
    return a === -1 || b === -1 ? [] : list.slice(Math.min(a, b), Math.max(a, b) + 1);
  }, [periods.items, from, to]);

  const tooMany = selectedPeriods.length > 60;
  const canFetch = Boolean(variable) && selectedPeriods.length > 0 && !tooMany && !loading;
  const hint = (busy: boolean, empty: string) => (busy ? 'Memuat…' : empty);

  return (
    <form
      className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 text-left grid grid-cols-1 sm:grid-cols-2 gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (canFetch) onFetch(() => api.bps.dataset(domain, variable, selectedPeriods.map((p) => p.id)));
      }}
    >
      <label className="text-sm font-medium text-slate-700">
        Wilayah
        <select className={selectClass} value={domain} onChange={(e) => setDomain(e.target.value)} disabled={domains.items.length === 0}>
          {domains.items.length === 0 && <option value="0000">{hint(domains.busy, 'Indonesia (nasional)')}</option>}
          {domains.items.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </label>

      <label className="text-sm font-medium text-slate-700">
        Subjek
        <select className={selectClass} value={subject} onChange={(e) => setSubject(e.target.value)} disabled={subjects.items.length === 0}>
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
            className={`${selectClass} mb-2`}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        )}
        <select id="bps-variable" className={selectClass} value={variable} onChange={(e) => setVariable(e.target.value)} disabled={!subject || variables.items.length === 0}>
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
        <p className="text-xs text-slate-500">
          {tooMany
            ? 'Paling banyak 60 tahun sekali ambil. Persempit rentangnya.'
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
  );
};

export default BpsPanel;
