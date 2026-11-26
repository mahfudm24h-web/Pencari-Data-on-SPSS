import React, { useMemo } from 'react';
import { SPSSDataset } from '../types';

interface Props {
  dataset: SPSSDataset;
}

const DescriptiveStats: React.FC<Props> = ({ dataset }) => {
  const stats = useMemo(() => {
    const numericVars = dataset.variables.filter(v => v.type === 'Numeric');
    
    return numericVars.map(v => {
      // Extract valid numbers
      const values = dataset.data
        .map(row => row[v.name])
        .filter(val => typeof val === 'number' && !isNaN(val)) as number[];
      
      if (values.length === 0) return null;

      const n = values.length;
      const sum = values.reduce((a, b) => a + b, 0);
      const mean = sum / n;
      
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(n / 2);
      const median = n % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      
      const min = sorted[0];
      const max = sorted[n - 1];
      
      // Sample Standard Deviation
      const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / (n - 1 || 1);
      const stdDev = Math.sqrt(variance);

      return {
        name: v.name,
        label: v.label,
        n,
        missing: dataset.data.length - n,
        mean,
        median,
        stdDev,
        min,
        max
      };
    }).filter(item => item !== null);
  }, [dataset]);

  if (stats.length === 0) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-800">Descriptive Statistics</h3>
        <span className="text-xs text-slate-500 bg-white border border-slate-200 px-2 py-1 rounded">Numeric Variables Only</span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50/50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Variable</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-600">N</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-600">Missing</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-600">Mean</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-600">Median</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-600">Std. Dev</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-600">Min</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-600">Max</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {stats.map((s: any) => (
              <tr key={s.name} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-medium text-slate-700">
                  <div className="flex flex-col">
                    <span className="font-mono text-blue-600">{s.name}</span>
                    <span className="text-xs text-slate-400 font-normal truncate max-w-[150px]" title={s.label}>{s.label}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-slate-600">{s.n}</td>
                <td className="px-4 py-3 text-right text-slate-600">{s.missing}</td>
                <td className="px-4 py-3 text-right text-slate-600">{s.mean.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                <td className="px-4 py-3 text-right text-slate-600">{s.median.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                <td className="px-4 py-3 text-right text-slate-600">{s.stdDev.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                <td className="px-4 py-3 text-right text-slate-600">{s.min.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-slate-600">{s.max.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DescriptiveStats;
