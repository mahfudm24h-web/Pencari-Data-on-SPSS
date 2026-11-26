import React from 'react';
import { Trash2, Calendar, Database, X, ChevronRight } from 'lucide-react';
import { DatasetSummary } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  datasets: DatasetSummary[];
  onLoad: (id: number) => void;
  onDelete: (id: number) => void;
}

const SavedDatasetsModal: React.FC<Props> = ({ isOpen, onClose, datasets, onLoad, onDelete }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-slate-900/75 transition-opacity" aria-hidden="true" onClick={onClose}></div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg leading-6 font-medium text-slate-900 flex items-center" id="modal-title">
                <Database className="w-5 h-5 mr-2 text-blue-600" />
                Dataset Tersimpan
              </h3>
              <button onClick={onClose} aria-label="Tutup" className="text-slate-400 hover:text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="mt-2 max-h-[60vh] overflow-y-auto pr-1 scrollbar-thin">
              {datasets.length === 0 ? (
                <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-lg">
                  <Database className="mx-auto h-10 w-10 text-slate-300" />
                  <p className="mt-2 text-sm text-slate-500">Belum ada dataset tersimpan.</p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {datasets.map((ds) => (
                    <li key={ds.id} className="py-4 hover:bg-slate-50 rounded-lg px-2 -mx-2 transition-colors group">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onLoad(ds.id)}>
                          <p className="text-sm font-medium text-blue-600 truncate group-hover:underline">
                            {ds.title}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5 truncate">
                            {ds.description}
                          </p>
                          {ds.savedAt && (
                            <div className="flex items-center mt-1.5 text-xs text-slate-400">
                              <Calendar className="flex-shrink-0 mr-1 h-3 w-3" />
                              <span>{new Date(ds.savedAt).toLocaleDateString('id-ID')} &bull; {new Date(ds.savedAt).toLocaleTimeString('id-ID')}</span>
                              <span className="ml-2 px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                                {ds.rowCount} baris
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="ml-4 flex items-center space-x-2">
                           <button
                            onClick={() => onLoad(ds.id)}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                            title="Buka dataset" aria-label={`Buka ${ds.title}`}
                          >
                            <ChevronRight className="w-5 h-5" />
                          </button>
                          <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete(ds.id);
                            }}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                            title="Hapus" aria-label={`Hapus ${ds.title}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SavedDatasetsModal;