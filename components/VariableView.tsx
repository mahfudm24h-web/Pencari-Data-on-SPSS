import React from 'react';
import { SPSSVariable } from '../types';

interface Props {
  variables: SPSSVariable[];
}

const VariableView: React.FC<Props> = ({ variables }) => {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left font-semibold text-slate-600">Name</th>
            <th className="px-4 py-3 text-left font-semibold text-slate-600">Type</th>
            <th className="px-4 py-3 text-left font-semibold text-slate-600">Width</th>
            <th className="px-4 py-3 text-left font-semibold text-slate-600">Decimals</th>
            <th className="px-4 py-3 text-left font-semibold text-slate-600">Label</th>
            <th className="px-4 py-3 text-left font-semibold text-slate-600">Measure</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {variables.map((v, idx) => (
            <tr key={v.name + idx} className="hover:bg-slate-50 transition-colors">
              <td className="px-4 py-2 font-mono text-blue-600">{v.name}</td>
              <td className="px-4 py-2">{v.type}</td>
              <td className="px-4 py-2">{v.width}</td>
              <td className="px-4 py-2">{v.decimals}</td>
              <td className="px-4 py-2 text-slate-700">{v.label}</td>
              <td className="px-4 py-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium
                  ${v.measure === 'Scale' ? 'bg-green-100 text-green-800' : 
                    v.measure === 'Ordinal' ? 'bg-blue-100 text-blue-800' : 
                    'bg-yellow-100 text-yellow-800'}`}>
                  {v.measure}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default VariableView;
