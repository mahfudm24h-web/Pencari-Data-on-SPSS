import React, { useEffect, useMemo, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis,
} from 'recharts';
import { histogram } from '../services/stats';
import { SPSSDataset, SPSSVariable } from '../types';

interface Props {
  dataset: SPSSDataset;
}

type ChartType = 'bar' | 'line' | 'area' | 'pie' | 'scatter' | 'histogram';

const CHART_TYPES: { id: ChartType; label: string }[] = [
  { id: 'bar', label: 'Batang' },
  { id: 'line', label: 'Garis' },
  { id: 'area', label: 'Area' },
  { id: 'pie', label: 'Pai' },
  { id: 'scatter', label: 'Sebar' },
  { id: 'histogram', label: 'Histogram' },
];

// Categorical palette (Okabe-Ito), distinguishable with common colour-vision deficiencies.
const COLORS = ['#0072B2', '#E69F00', '#009E73', '#D55E00', '#CC79A7', '#56B4E9', '#F0E442', '#999999'];
const MAIN = '#2563eb';
const MAX_POINTS: Record<ChartType, number> = { bar: 60, line: 300, area: 300, pie: 8, scatter: 1000, histogram: 1000 };

const isTimeLike = (v: SPSSVariable) => v.type === 'Date' || /(year|tahun|date|tanggal|periode|bulan)/i.test(v.name);
const selectClass = 'w-full text-sm border border-slate-300 rounded-md bg-white py-1.5 px-2 focus:outline-none focus:ring-2 focus:ring-blue-500';
const tooltipStyle = { borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' };

const Charts: React.FC<Props> = ({ dataset }) => {
  const numericVars = useMemo(() => dataset.variables.filter((v) => v.type === 'Numeric'), [dataset.variables]);
  const [type, setType] = useState<ChartType>('bar');
  const [xName, setXName] = useState('');
  const [yName, setYName] = useState('');

  // Pick sensible defaults when the dataset (or its variables) changes.
  const variableKey = dataset.variables.map((v) => `${v.name}:${v.type}`).join('|');
  useEffect(() => {
    const vars = dataset.variables;
    const x = vars.find(isTimeLike) ?? vars.find((v) => v.type !== 'Numeric') ?? vars[0];
    const y = numericVars.find((v) => v.measure === 'Scale' && v.name !== x?.name) ?? numericVars.find((v) => v.name !== x?.name) ?? numericVars[0];
    setXName(x?.name ?? '');
    setYName(y?.name ?? '');
    setType(x && isTimeLike(x) ? 'line' : 'bar');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variableKey, dataset.retrievedAt]);

  const xVar = dataset.variables.find((v) => v.name === xName);
  const yVar = numericVars.find((v) => v.name === yName);

  const prepared = useMemo(() => {
    if (!yVar && type !== 'pie') return { rows: [] as Record<string, unknown>[], total: 0 };
    if (type === 'histogram') {
      const values = dataset.data.map((r) => r[yName]).filter((c): c is number => typeof c === 'number');
      return { rows: histogram(values) as unknown as Record<string, unknown>[], total: values.length };
    }
    if (type === 'pie') {
      const counts = new Map<string, number>();
      for (const row of dataset.data) {
        const raw = row[xName];
        const key = raw === null || raw === undefined ? '(kosong)' : String(raw);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      const top = sorted.slice(0, MAX_POINTS.pie - 1).map(([name, value]) => ({ name, value }));
      const rest = sorted.slice(MAX_POINTS.pie - 1).reduce((sum, [, n]) => sum + n, 0);
      if (rest > 0) top.push({ name: 'Lainnya', value: rest });
      return { rows: top as Record<string, unknown>[], total: dataset.data.length };
    }
    let rows = dataset.data.filter((r) => typeof r[yName] === 'number');
    if (type === 'scatter') rows = rows.filter((r) => typeof r[xName] === 'number');
    return { rows: rows.slice(0, MAX_POINTS[type]) as Record<string, unknown>[], total: rows.length };
  }, [dataset.data, type, xName, yName, yVar]);

  if (numericVars.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-slate-50 rounded-lg border border-slate-200 border-dashed text-slate-500 text-sm text-center px-4">
        Tidak ada variabel numerik untuk digambarkan.
      </div>
    );
  }

  const xNeedsNumeric = type === 'scatter';
  const xOptions = xNeedsNumeric ? numericVars : dataset.variables;
  const needsX = type !== 'histogram';
  const needsY = type !== 'pie';
  const xInvalid = needsX && xNeedsNumeric && xVar?.type !== 'Numeric';

  const title =
    type === 'histogram' ? `Sebaran ${yVar?.label || yName}`
    : type === 'pie' ? `Jumlah baris per ${xVar?.label || xName}`
    : `${yVar?.label || yName} menurut ${xVar?.label || xName}`;

  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
      <XAxis dataKey={xName} tick={{ fontSize: 11 }} stroke="#94a3b8" />
      <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" width={56} />
      <Tooltip contentStyle={tooltipStyle} />
    </>
  );

  const chart = () => {
    switch (type) {
      case 'bar':
        return <BarChart data={prepared.rows}>{axes}<Bar dataKey={yName} fill={MAIN} radius={[4, 4, 0, 0]} /></BarChart>;
      case 'line':
        return <LineChart data={prepared.rows}>{axes}<Line type="monotone" dataKey={yName} stroke={MAIN} strokeWidth={2} dot={prepared.rows.length <= 40} /></LineChart>;
      case 'area':
        return <AreaChart data={prepared.rows}>{axes}<Area type="monotone" dataKey={yName} stroke={MAIN} strokeWidth={2} fill={MAIN} fillOpacity={0.15} /></AreaChart>;
      case 'pie':
        return (
          <PieChart>
            <Pie data={prepared.rows} dataKey="value" nameKey="name" innerRadius="45%" outerRadius="75%" paddingAngle={1}>
              {prepared.rows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        );
      case 'scatter':
        return (
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis type="number" dataKey={xName} name={xName} tick={{ fontSize: 11 }} stroke="#94a3b8" domain={['auto', 'auto']} />
            <YAxis type="number" dataKey={yName} name={yName} tick={{ fontSize: 11 }} stroke="#94a3b8" width={56} domain={['auto', 'auto']} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ strokeDasharray: '3 3' }} />
            <Scatter data={prepared.rows} fill={MAIN} fillOpacity={0.7} />
          </ScatterChart>
        );
      case 'histogram':
        return (
          <BarChart data={prepared.rows} barCategoryGap={1}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#94a3b8" interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" width={40} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="count" name="Jumlah" fill={MAIN} />
          </BarChart>
        );
    }
  };

  const shown = type === 'pie' || type === 'histogram' ? prepared.total : prepared.rows.length;

  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
      <div className="flex flex-wrap gap-1 mb-3" role="tablist" aria-label="Jenis grafik">
        {CHART_TYPES.map((c) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={type === c.id}
            onClick={() => setType(c.id)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
              type === c.id ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {needsX && (
          <label className="text-xs font-medium text-slate-600">
            {type === 'pie' ? 'Kelompok' : 'Sumbu X'}
            <select className={`${selectClass} mt-1`} value={xInvalid ? '' : xName} onChange={(e) => setXName(e.target.value)}>
              {xInvalid && <option value="">Pilih variabel numerik</option>}
              {xOptions.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
            </select>
          </label>
        )}
        {needsY && (
          <label className="text-xs font-medium text-slate-600">
            {type === 'histogram' ? 'Variabel' : 'Sumbu Y'}
            <select className={`${selectClass} mt-1`} value={yName} onChange={(e) => setYName(e.target.value)}>
              {numericVars.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
            </select>
          </label>
        )}
      </div>

      <h3 className="text-sm font-semibold text-slate-800 mb-1">{title}</h3>
      {prepared.total > shown && (
        <p className="text-xs text-slate-500 mb-2">Menampilkan {shown} baris pertama dari {prepared.total}.</p>
      )}

      <div className="h-72 w-full">
        {xInvalid || prepared.rows.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-slate-500 text-center px-4">
            {xInvalid ? 'Grafik sebar butuh dua variabel numerik. Pilih variabel numerik untuk sumbu X.' : 'Tidak ada data yang bisa digambarkan untuk pilihan ini.'}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">{chart()}</ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default Charts;
