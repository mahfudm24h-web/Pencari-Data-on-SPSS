import React, { useMemo } from 'react';
import { summarize } from '../services/stats';
import { SPSSDataset } from '../types';

interface Props {
  dataset: SPSSDataset;
}

// Adding 0 turns a rounded -0 into 0.
const num = (n: number, digits = 2) => (Number(n.toFixed(digits)) + 0).toLocaleString('id-ID', { maximumFractionDigits: digits });

const DescriptiveStats: React.FC<Props> = ({ dataset }) => {
  const stats = useMemo(
    () =>
      dataset.variables
        .filter((v) => v.type === 'Numeric')
        .map((v) => {
          const values = dataset.data.map((row) => row[v.name]).filter((c): c is number => typeof c === 'number');
          const summary = summarize(values);
          return summary ? { name: v.name, label: v.label, missing: dataset.data.length - values.length, ...summary } : null;
        })
        .filter((s): s is NonNullable<typeof s> => s !== null),
    [dataset]
  );

  if (stats.length === 0) return null;

  const th = 'px-4 py-3 text-right font-semibold text-slate-600 whitespace-nowrap';
  const td = 'px-4 py-3 text-right text-slate-600 whitespace-nowrap';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-slate-800">Statistik Deskriptif</h3>
        <span className="text-xs text-slate-500 bg-white border border-slate-200 px-2 py-1 rounded shrink-0">Variabel numerik</span>
      </div>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50/50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Variabel</th>
              <th className={th}>N</th>
              <th className={th}>Kosong</th>
              <th className={th}>Rata-rata</th>
              <th className={th}>Median</th>
              <th className={th}>Simp. baku</th>
              <th className={th}>Min</th>
              <th className={th}>Maks</th>
              <th className={th}>Skewness</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600 whitespace-nowrap">Bentuk sebaran</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {stats.map((s) => {
              const symmetric = s.skewness !== null && Math.abs(s.skewness) <= 1;
              return (
                <tr key={s.name} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-700">
                    <div className="flex flex-col">
                      <span className="font-mono text-blue-600">{s.name}</span>
                      <span className="text-xs text-slate-500 font-normal truncate max-w-[150px]" title={s.label}>{s.label}</span>
                    </div>
                  </td>
                  <td className={td}>{s.n}</td>
                  <td className={td}>{s.missing}</td>
                  <td className={td}>{num(s.mean)}</td>
                  <td className={td}>{num(s.median)}</td>
                  <td className={td}>{num(s.stdDev)}</td>
                  <td className={td}>{num(s.min, 6)}</td>
                  <td className={td}>{num(s.max, 6)}</td>
                  <td className={td}>{s.skewness === null ? '–' : num(s.skewness)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {s.skewness === null ? (
                      <span className="text-slate-400">–</span>
                    ) : (
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${symmetric ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                        {symmetric ? 'Cukup simetris' : s.skewness > 0 ? 'Menceng ke kanan' : 'Menceng ke kiri'}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="px-6 py-3 border-t border-slate-200 text-xs text-slate-500">
        Bentuk sebaran hanya petunjuk awal dari nilai skewness (cukup simetris bila di antara −1 dan 1). Sebaran yang
        menceng mengarah ke uji non-parametrik, tetapi pastikan dulu dengan uji normalitas di SPSS (Analyze → Descriptive
        Statistics → Explore).
      </p>
    </div>
  );
};

export default DescriptiveStats;
