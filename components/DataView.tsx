import React, { useState, useMemo } from 'react';
import { SPSSDataset } from '../types';
import { Filter, Search, X, Plus } from 'lucide-react';

interface Props {
  dataset: SPSSDataset;
}

interface FilterItem {
  column: string;
  value: string;
}

const DataView: React.FC<Props> = ({ dataset }) => {
  // Pending filter state (input controls)
  const [pendingColumn, setPendingColumn] = useState<string>('');
  const [pendingValue, setPendingValue] = useState<string>('');

  // Active filters applied to the dataset
  const [activeFilters, setActiveFilters] = useState<FilterItem[]>([]);

  // Filter logic: AND condition across all active filters
  const filteredData = useMemo(() => {
    if (activeFilters.length === 0) return dataset.data;

    return dataset.data.filter((row) => {
      // Every filter must match for the row to be included
      return activeFilters.every((filter) => {
        const cellValue = row[filter.column];
        if (cellValue === undefined || cellValue === null) return false;
        return String(cellValue).toLowerCase().includes(filter.value.toLowerCase());
      });
    });
  }, [dataset.data, activeFilters]);

  const handleAddFilter = () => {
    if (pendingColumn && pendingValue) {
      setActiveFilters(prev => [...prev, { column: pendingColumn, value: pendingValue }]);
      setPendingValue(''); // Clear value input but keep column for convenience
    }
  };

  const handleRemoveFilter = (index: number) => {
    setActiveFilters(prev => prev.filter((_, i) => i !== index));
  };

  const handleClearAll = () => {
    setActiveFilters([]);
    setPendingColumn('');
    setPendingValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddFilter();
    }
  };

  // Helper to highlight text based on active filters for a specific column
  const renderCellContent = (columnName: string, cellValue: any) => {
    if (cellValue === undefined || cellValue === null) return <span className="text-slate-300 italic">.</span>;
    
    const stringValue = String(cellValue);
    
    // Find filters that apply to this column
    const relevantFilters = activeFilters.filter(f => f.column === columnName);
    
    if (relevantFilters.length === 0) return stringValue;

    // specific logic to highlight the first matching filter value (simplified for performance)
    const match = relevantFilters.find(f => stringValue.toLowerCase().includes(f.value.toLowerCase()));

    if (match) {
      // Split on the match and render the pieces as React elements, so cell text is never parsed as HTML.
      const needle = match.value.toLowerCase();
      const haystack = stringValue.toLowerCase();
      const parts: React.ReactNode[] = [];
      let from = 0;
      for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, from)) {
        if (at > from) parts.push(stringValue.slice(from, at));
        parts.push(
          <mark key={at} className="bg-yellow-200 font-medium">
            {stringValue.slice(at, at + needle.length)}
          </mark>
        );
        from = at + needle.length;
      }
      parts.push(stringValue.slice(from));
      return <>{parts}</>;
    }

    return stringValue;
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Filter Controls Area */}
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/30 flex flex-col gap-3">
        
        {/* Top Row: Inputs */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center text-slate-500 text-sm font-medium">
            <Filter className="w-4 h-4 mr-2" />
            Filters:
          </div>

          <select
            value={pendingColumn}
            onChange={(e) => setPendingColumn(e.target.value)}
            className="text-sm border border-slate-300 rounded-md focus:border-blue-500 focus:ring-blue-500 bg-white py-1.5 px-3 shadow-sm outline-none"
          >
            <option value="">Select Column...</option>
            {dataset.variables.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name}
              </option>
            ))}
          </select>

          <div className="relative flex-grow max-w-xs">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="text"
              value={pendingValue}
              onChange={(e) => setPendingValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={pendingColumn ? "Value..." : "Select column first"}
              disabled={!pendingColumn}
              className="block w-full pl-10 pr-3 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 shadow-sm outline-none disabled:bg-slate-100 disabled:text-slate-400"
            />
          </div>

          <button
            onClick={handleAddFilter}
            disabled={!pendingColumn || !pendingValue}
            className="flex items-center px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Filter
          </button>

           <div className="ml-auto text-xs text-slate-400 font-medium">
            Showing <span className="text-slate-700">{filteredData.length}</span> of {dataset.data.length} rows
          </div>
        </div>

        {/* Bottom Row: Active Filter Chips */}
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {activeFilters.map((filter, index) => (
              <div 
                key={`${filter.column}-${index}`}
                className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100"
              >
                <span className="font-bold mr-1">{filter.column}:</span> 
                "{filter.value}"
                <button
                  onClick={() => handleRemoveFilter(index)}
                  className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-blue-400 hover:bg-blue-200 hover:text-blue-600 transition-colors focus:outline-none"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}

            <button
              onClick={handleClearAll}
              className="ml-2 text-xs text-slate-500 hover:text-red-600 hover:underline transition-colors font-medium"
            >
              Clear All Filters
            </button>
          </div>
        )}
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto max-h-[75vh] scrollbar-thin">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="px-4 py-3 text-center font-bold text-slate-400 w-12 bg-slate-50 border-r border-slate-200">
                #
              </th>
              {dataset.variables.map((v) => (
                <th key={v.name} className="px-4 py-3 text-left font-semibold text-slate-700 whitespace-nowrap min-w-[100px]">
                  <div className="flex flex-col">
                    <span>{v.name}</span>
                    <div className="flex items-center gap-1">
                      {v.measure === 'Scale' && <span className="text-[10px] text-slate-400 font-normal">📏 Scale</span>}
                      {v.measure === 'Ordinal' && <span className="text-[10px] text-slate-400 font-normal">📊 Ordinal</span>}
                      {v.measure === 'Nominal' && <span className="text-[10px] text-slate-400 font-normal">🔵 Nominal</span>}
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {filteredData.length > 0 ? (
              filteredData.map((row, rowIdx) => (
                <tr key={rowIdx} className="hover:bg-blue-50 transition-colors">
                  <td className="px-4 py-2 text-center text-slate-400 border-r border-slate-200 bg-slate-50 text-xs">
                    {rowIdx + 1}
                  </td>
                  {dataset.variables.map((v) => (
                    <td key={`${rowIdx}-${v.name}`} className="px-4 py-2 whitespace-nowrap text-slate-700">
                      {renderCellContent(v.name, row[v.name])}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={dataset.variables.length + 1} className="px-4 py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center">
                    <Search className="w-8 h-8 mb-2 opacity-50" />
                    <p>No rows match your combined filters.</p>
                    <button 
                      onClick={handleClearAll}
                      className="mt-2 text-blue-600 hover:underline text-xs"
                    >
                      Clear all filters
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DataView;
