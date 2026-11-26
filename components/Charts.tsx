import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { SPSSDataset } from '../types';

interface Props {
  dataset: SPSSDataset;
}

const Charts: React.FC<Props> = ({ dataset }) => {
  // Logic to determine best visualization
  const visualizationData = useMemo(() => {
    // Find first nominal/ordinal variable for X-Axis, first scale variable for Y-Axis
    const xVar = dataset.variables.find(v => v.measure === 'Nominal' || v.measure === 'Ordinal' || v.name.toLowerCase().includes('year') || v.name.toLowerCase().includes('date'));
    const yVar = dataset.variables.find(v => v.measure === 'Scale' && v.name !== xVar?.name);

    if (!xVar || !yVar) return null;

    const plottable = dataset.data.filter(row => typeof row[yVar.name] === 'number');

    return {
      x: xVar.name,
      y: yVar.name,
      labelX: xVar.label,
      labelY: yVar.label,
      data: plottable.slice(0, 60),
      total: plottable.length
    };
  }, [dataset]);

  if (!visualizationData) {
    return (
      <div className="flex items-center justify-center h-64 bg-slate-50 rounded-lg border border-slate-200 border-dashed text-slate-400">
        Not enough scale/categorical data to visualize automatically.
      </div>
    );
  }

  // Choose Line Chart for time series, Bar for others
  const isTimeSeries = visualizationData.x.toLowerCase().includes('year') || visualizationData.x.toLowerCase().includes('date');

  return (
    <div className="bg-white p-4 rounded-lg border border-slate-200">
      <h3 className="text-lg font-semibold text-slate-800 mb-4">
        Quick Analysis: {visualizationData.labelY} by {visualizationData.labelX}
      </h3>
      {visualizationData.total > visualizationData.data.length && (
        <p className="text-xs text-slate-500 -mt-2 mb-3">
          Showing the first {visualizationData.data.length} of {visualizationData.total} rows.
        </p>
      )}
      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {isTimeSeries ? (
             <LineChart data={visualizationData.data}>
             <CartesianGrid strokeDasharray="3 3" vertical={false} />
             <XAxis dataKey={visualizationData.x} tick={{fontSize: 12}} />
             <YAxis tick={{fontSize: 12}} />
             <Tooltip 
               contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
             />
             <Legend />
             <Line type="monotone" dataKey={visualizationData.y} stroke="#2563eb" strokeWidth={2} dot={{r: 4}} />
           </LineChart>
          ) : (
            <BarChart data={visualizationData.data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey={visualizationData.x} tick={{fontSize: 12}} />
              <YAxis tick={{fontSize: 12}} />
              <Tooltip 
                cursor={{fill: '#f1f5f9'}}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Legend />
              <Bar dataKey={visualizationData.y} fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default Charts;
