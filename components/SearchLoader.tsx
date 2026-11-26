import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface Props {
  label: string;
  /** Shown once the wait is longer than usual. */
  slowHint: string;
  slowAfterSeconds?: number;
}

/** Shows that work is in progress and how long it has taken. It does not invent progress steps. */
const SearchLoader: React.FC<Props> = ({ label, slowHint, slowAfterSeconds = 60 }) => {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  const elapsed = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <div role="status" className="max-w-3xl mx-auto mb-8 bg-white border border-slate-200 rounded-lg px-4 py-3">
      <div className="flex items-center justify-between gap-3 text-sm text-slate-700">
        <span className="flex items-center gap-3 min-w-0">
          <Loader2 className="h-4 w-4 animate-spin text-blue-600 shrink-0" />
          <span>{label}</span>
        </span>
        <span className="font-mono tabular-nums text-slate-500 shrink-0">{elapsed}</span>
      </div>
      <p className="mt-1 pl-7 text-xs text-slate-500">
        {seconds >= slowAfterSeconds ? slowHint : 'Biarkan halaman ini tetap terbuka.'}
      </p>
    </div>
  );
};

export default SearchLoader;
