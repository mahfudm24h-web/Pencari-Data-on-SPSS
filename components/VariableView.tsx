import React, { useState } from 'react';
import { Edit2, Plus, Save, Tags, Trash2, X } from 'lucide-react';
import { applyVariableEdits, EditedVariable, validateVariableNames } from '../services/variables';
import { MeasureType, SPSSDataset, ValueLabel, VariableType } from '../types';

interface Props {
  dataset: SPSSDataset;
  onUpdateDataset: (dataset: SPSSDataset) => void;
}

const TYPE_LABEL: Record<VariableType, string> = { Numeric: 'Numerik', String: 'Teks', Date: 'Tanggal' };
const MEASURES: MeasureType[] = ['Scale', 'Ordinal', 'Nominal'];

const measureClass = (m: MeasureType) =>
  m === 'Scale' ? 'bg-green-100 text-green-800' : m === 'Ordinal' ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800';

const input = 'w-full px-2 py-1 border border-slate-300 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500';

const VariableView: React.FC<Props> = ({ dataset, onUpdateDataset }) => {
  const [draft, setDraft] = useState<EditedVariable[] | null>(null);
  const [labelsFor, setLabelsFor] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startEdit = () => {
    setDraft(dataset.variables.map((v) => ({ ...v, values: v.values?.map((x) => ({ ...x })), originalName: v.name })));
    setError(null);
  };
  const cancel = () => {
    setDraft(null);
    setLabelsFor(null);
    setError(null);
  };
  const update = (index: number, patch: Partial<EditedVariable>) =>
    setDraft((d) => d && d.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  const updateLabels = (index: number, change: (values: ValueLabel[]) => ValueLabel[]) =>
    setDraft((d) => d && d.map((v, i) => (i === index ? { ...v, values: change(v.values ?? []) } : v)));

  const addVariable = () => {
    if (!draft) return;
    const taken = new Set(draft.map((v) => v.name.toLowerCase()));
    let n = draft.length + 1;
    while (taken.has(`var${n}`)) n++;
    setDraft([...draft, { name: `var${n}`, type: 'Numeric', width: 8, decimals: 0, label: '', measure: 'Scale' }]);
  };

  const save = () => {
    if (!draft) return;
    if (draft.length === 0) return setError('Dataset harus punya setidaknya satu variabel.');
    const problem = validateVariableNames(draft.map((v) => v.name));
    if (problem) return setError(problem);
    onUpdateDataset(applyVariableEdits(dataset, draft));
    cancel();
  };

  const rows = draft ?? dataset.variables;
  const th = 'px-4 py-3 text-left font-semibold text-slate-600 whitespace-nowrap';

  return (
    <div>
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/30 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {draft
            ? 'Ubah nama, tipe, label, dan tingkat pengukuran. Perubahan berlaku setelah disimpan.'
            : 'Nama, label, dan tingkat pengukuran ikut masuk ke berkas sintaks SPSS.'}
        </p>
        {draft ? (
          <div className="flex items-center gap-2">
            <button onClick={addVariable} className="flex items-center px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50">
              <Plus className="w-4 h-4 mr-1" /> Tambah variabel
            </button>
            <button onClick={cancel} className="flex items-center px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50">
              <X className="w-4 h-4 mr-1" /> Batal
            </button>
            <button onClick={save} className="flex items-center px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">
              <Save className="w-4 h-4 mr-1" /> Simpan perubahan
            </button>
          </div>
        ) : (
          <button onClick={startEdit} className="flex items-center px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50">
            <Edit2 className="w-4 h-4 mr-1" /> Edit variabel
          </button>
        )}
      </div>

      {error && <div role="alert" className="px-4 py-2 text-sm text-red-700 bg-red-50 border-b border-red-200">{error}</div>}

      <div className="overflow-x-auto max-h-[75vh] scrollbar-thin">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className={th}>Nama</th>
              <th className={th}>Tipe</th>
              <th className={th}>Lebar</th>
              <th className={th}>Desimal</th>
              <th className={th}>Label</th>
              <th className={th}>Label nilai</th>
              <th className={th}>Ukuran</th>
              {draft && <th className={th}><span className="sr-only">Hapus</span></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {rows.map((v, idx) => (
              <React.Fragment key={draft ? idx : v.name}>
                <tr className="hover:bg-slate-50 transition-colors align-top">
                  {draft ? (
                    <>
                      <td className="px-4 py-2 min-w-[150px]">
                        <input aria-label="Nama variabel" className={`${input} font-mono`} value={v.name} maxLength={32} onChange={(e) => update(idx, { name: e.target.value })} />
                      </td>
                      <td className="px-4 py-2">
                        <select aria-label="Tipe" className={input} value={v.type} onChange={(e) => update(idx, { type: e.target.value as VariableType })}>
                          {(Object.keys(TYPE_LABEL) as VariableType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-2 text-slate-500">{v.width}</td>
                      <td className="px-4 py-2">
                        {v.type === 'Numeric' ? (
                          <input aria-label="Desimal" type="number" min={0} max={6} className={`${input} w-16`} value={v.decimals}
                            onChange={(e) => update(idx, { decimals: Math.min(6, Math.max(0, Math.floor(Number(e.target.value) || 0))) })} />
                        ) : <span className="text-slate-400">0</span>}
                      </td>
                      <td className="px-4 py-2 min-w-[200px]">
                        <input aria-label="Label" className={input} value={v.label} maxLength={250} onChange={(e) => update(idx, { label: e.target.value })} />
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <button onClick={() => setLabelsFor(labelsFor === idx ? null : idx)} className="flex items-center text-blue-600 hover:underline text-xs font-medium py-1">
                          <Tags className="w-3.5 h-3.5 mr-1" /> {v.values?.length ? `${v.values.length} label` : 'Atur'}
                        </button>
                      </td>
                      <td className="px-4 py-2">
                        <select aria-label="Ukuran" className={input} value={v.measure} onChange={(e) => update(idx, { measure: e.target.value as MeasureType })}>
                          {MEASURES.filter((m) => v.type === 'Numeric' || m !== 'Scale').map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <button aria-label={`Hapus ${v.name}`} onClick={() => { setDraft(draft.filter((_, i) => i !== idx)); setLabelsFor(null); }}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2 font-mono text-blue-600">{v.name}</td>
                      <td className="px-4 py-2">{TYPE_LABEL[v.type]}</td>
                      <td className="px-4 py-2">{v.width}</td>
                      <td className="px-4 py-2">{v.decimals}</td>
                      <td className="px-4 py-2 text-slate-700">{v.label}</td>
                      <td className="px-4 py-2 text-slate-600 text-xs">
                        {v.values?.length ? v.values.map((x) => `${x.value} = ${x.label}`).join('; ') : <span className="text-slate-400">–</span>}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${measureClass(v.measure)}`}>{v.measure}</span>
                      </td>
                    </>
                  )}
                </tr>
                {draft && labelsFor === idx && (
                  <tr className="bg-slate-50">
                    <td colSpan={8} className="px-4 py-3">
                      <p className="text-xs text-slate-600 mb-2">
                        Label nilai untuk <span className="font-mono">{v.name}</span>, misalnya 1 = Laki-laki, 2 = Perempuan.
                      </p>
                      <div className="space-y-2 max-w-md">
                        {(v.values ?? []).map((item, k) => (
                          <div key={k} className="flex items-center gap-2">
                            <input aria-label="Nilai" placeholder="Nilai" className={`${input} w-24`} value={item.value}
                              onChange={(e) => updateLabels(idx, (vals) => vals.map((x, j) => (j === k ? { ...x, value: e.target.value } : x)))} />
                            <span className="text-slate-400">=</span>
                            <input aria-label="Label nilai" placeholder="Label" className={input} value={item.label} maxLength={120}
                              onChange={(e) => updateLabels(idx, (vals) => vals.map((x, j) => (j === k ? { ...x, label: e.target.value } : x)))} />
                            <button aria-label="Hapus label nilai" onClick={() => updateLabels(idx, (vals) => vals.filter((_, j) => j !== k))} className="p-1.5 text-slate-400 hover:text-red-600">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                        <button onClick={() => updateLabels(idx, (vals) => [...vals, { value: '', label: '' }])} className="flex items-center text-blue-600 hover:underline text-xs font-medium">
                          <Plus className="w-3.5 h-3.5 mr-1" /> Tambah label nilai
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default VariableView;
