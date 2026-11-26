import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, BrainCircuit, Check, Database, Download, FileCode, FileSpreadsheet, FolderOpen,
  Loader2, LogOut, MessageSquare, Save, Search, Sparkles, Table as TableIcon,
} from 'lucide-react';
import { api, ApiError } from './services/api';
import { downloadCsv, downloadSpssSyntax } from './services/export';
import { DatasetSummary, ProviderInfo, Quota, SearchMode, SPSSDataset, User } from './types';
import BpsPanel from './components/BpsPanel';
import ChatAssistant from './components/ChatAssistant';
import SearchLoader from './components/SearchLoader';
import AuthScreen from './components/AuthScreen';
import VariableView from './components/VariableView';
import DataView from './components/DataView';
import Charts from './components/Charts';
import DescriptiveStats from './components/DescriptiveStats';
import SavedDatasetsModal from './components/SavedDatasetsModal';

const PROVIDER_KEY = 'datascout_provider';

function readStoredProvider(): string {
  try {
    return localStorage.getItem(PROVIDER_KEY) ?? '';
  } catch {
    return '';
  }
}

const messageOf = (err: unknown) =>
  err instanceof Error ? err.message : 'Terjadi kesalahan. Silakan coba lagi.';

const App: React.FC = () => {
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [allowRegistration, setAllowRegistration] = useState(true);

  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [providerId, setProviderId] = useState(readStoredProvider);
  const [mode, setMode] = useState<SearchMode>('fast');
  const [bpsEnabled, setBpsEnabled] = useState(false);
  const [source, setSource] = useState<'ai' | 'bps'>('ai');

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataset, setDataset] = useState<SPSSDataset | null>(null);
  const [activeTab, setActiveTab] = useState<'data' | 'variable'>('data');

  const [savedDatasets, setSavedDatasets] = useState<DatasetSummary[]>([]);
  const [isSavedModalOpen, setIsSavedModalOpen] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

  // A 401 on any call means the session ended; drop back to the sign-in screen.
  const handleError = useCallback((err: unknown) => {
    if (err instanceof ApiError && err.status === 401) setUser(null);
    setError(messageOf(err));
  }, []);

  const refreshProviders = useCallback(async () => {
    const result = await api.providers();
    setProviders(result.providers);
    setQuota(result.quota);
    setBpsEnabled(result.bps);
    setProviderId((current) =>
      result.providers.some((p) => p.id === current) ? current : result.providers[0]?.id ?? ''
    );
  }, []);

  useEffect(() => {
    api
      .me()
      .then((result) => {
        setUser(result.user);
        setAllowRegistration(result.allowRegistration);
      })
      .catch(handleError)
      .finally(() => setAuthChecked(true));
  }, [handleError]);

  useEffect(() => {
    if (!user) return;
    setError(null);
    refreshProviders().catch(handleError);
    api.listDatasets().then((r) => setSavedDatasets(r.datasets)).catch(handleError);
  }, [user, refreshProviders, handleError]);

  const chooseProvider = (id: string) => {
    setProviderId(id);
    try {
      localStorage.setItem(PROVIDER_KEY, id);
    } catch {
      // The choice simply will not be remembered.
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || loading || !providerId) return;

    setLoading(true);
    setError(null);
    setDataset(null);
    setSaveState('idle');
    try {
      setDataset(await api.search(query, providerId, mode));
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
      refreshProviders().catch(() => undefined);
    }
  };

  const handleBpsFetch = async (load: () => Promise<SPSSDataset>) => {
    if (loading) return;
    setLoading(true);
    setError(null);
    setDataset(null);
    setSaveState('idle');
    try {
      setDataset(await load());
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDataset = async () => {
    if (!dataset || saveState !== 'idle') return;
    setSaveState('saving');
    try {
      // A dataset that was saved before is updated in place; a new one is added.
      const known = dataset.id !== undefined && savedDatasets.some((d) => d.id === dataset.id);
      const { dataset: summary } = known
        ? await api.updateDataset(dataset.id!, dataset)
        : await api.saveDataset(dataset);
      setSavedDatasets((list) => [summary, ...list.filter((d) => d.id !== summary.id)]);
      setDataset({ ...dataset, id: summary.id, savedAt: summary.savedAt });
      setSaveState('saved');
    } catch (err) {
      setSaveState('idle');
      handleError(err);
    }
  };

  const handleUpdateDataset = (updated: SPSSDataset) => {
    setDataset(updated);
    setSaveState('idle');
  };

  const handleDeleteDataset = async (id: number) => {
    try {
      await api.deleteDataset(id);
      setSavedDatasets((list) => list.filter((d) => d.id !== id));
      if (dataset?.id === id) setSaveState('idle');
    } catch (err) {
      handleError(err);
    }
  };

  const handleLoadDataset = async (id: number) => {
    setIsSavedModalOpen(false);
    setError(null);
    try {
      setDataset(await api.getDataset(id));
      setSaveState('saved');
    } catch (err) {
      handleError(err);
    }
  };

  const handleLogout = async () => {
    await api.logout().catch(() => undefined);
    setUser(null);
    setDataset(null);
    setSavedDatasets([]);
    setQuery('');
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        {error && (
          <div className="bg-red-50 border-b border-red-200 text-red-700 px-4 py-3 text-center text-sm">{error}</div>
        )}
        <AuthScreen allowRegistration={allowRegistration} onSignedIn={setUser} />
      </>
    );
  }

  const provider = providers.find((p) => p.id === providerId);
  const searchesLeft = quota && !quota.unlimited ? Math.max(quota.limit - quota.used, 0) : null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Database className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-indigo-700">
              <span className="hidden sm:inline">SPSS </span>DataScout
            </h1>
          </div>
          <div className="flex items-center space-x-4 text-sm text-slate-500">
            <button
              onClick={() => setIsSavedModalOpen(true)}
              className="flex items-center space-x-1 hover:text-blue-600 transition-colors"
              aria-label="Dataset saya"
            >
              <FolderOpen className="w-4 h-4" />
              <span className="hidden sm:inline">Dataset Saya ({savedDatasets.length})</span>
            </button>
            <span className="hidden md:inline border-l border-slate-200 pl-4 max-w-[160px] truncate">{user.name}</span>
            <button
              onClick={handleLogout}
              className="flex items-center space-x-1 hover:text-red-600 transition-colors"
              aria-label="Keluar"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-3xl mx-auto mb-12 text-center">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">Cari Data Nyata untuk Analisis</h2>
          <p className="text-slate-600 mb-8">
            {bpsEnabled && source === 'bps'
              ? 'Pilih wilayah, subjek, dan variabel. Angkanya diambil langsung dari Badan Pusat Statistik dan disusun untuk SPSS.'
              : 'Tuliskan data ekonomi, sosial, atau ilmiah yang Anda butuhkan. Model AI mencarinya di web lalu menyusunnya untuk SPSS (Variable View & Data View).'}
          </p>

          {bpsEnabled && (
            <div className="inline-flex mb-6 p-1 bg-slate-200/70 rounded-lg" role="tablist" aria-label="Sumber data">
              {([['ai', 'Pencarian AI'], ['bps', 'BPS langsung']] as const).map(([id, label]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={source === id}
                  disabled={loading}
                  onClick={() => setSource(id)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    source === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {bpsEnabled && source === 'bps' ? (
            <BpsPanel loading={loading} providerId={providerId} onFetch={handleBpsFetch} onError={handleError} />
          ) : (
          <>
          <form onSubmit={handleSearch} className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
            </div>
            <input
              type="text"
              className="block w-full pl-11 pr-32 py-4 bg-white border border-slate-200 rounded-xl shadow-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              placeholder="mis. PDB dan tingkat pengangguran Indonesia 2010–2023"
              value={query}
              maxLength={2000}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              type="submit"
              disabled={loading || !provider}
              className="absolute right-2 top-2 bottom-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg px-6 transition-colors disabled:bg-blue-400 flex items-center justify-center min-w-[100px]"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Cari'}
            </button>
          </form>

          {providers.length === 0 ? (
            <p className="mt-6 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              Belum ada model AI yang disiapkan. Administrator perlu mengisi kunci API di server.
            </p>
          ) : (
            <div className="mt-6 flex flex-col md:flex-row items-center justify-center gap-4 md:gap-8">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
                <Sparkles className="w-4 h-4 text-yellow-500" />
                Model AI
                <select
                  value={providerId}
                  onChange={(e) => chooseProvider(e.target.value)}
                  disabled={loading}
                  className="text-sm border border-slate-300 rounded-md bg-white py-1.5 px-3 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="relative inline-flex items-center cursor-pointer group">
                <input
                  type="checkbox"
                  checked={mode === 'deep'}
                  disabled={loading}
                  onChange={(e) => setMode(e.target.checked ? 'deep' : 'fast')}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                <span className="ml-3 text-sm font-medium text-slate-600 group-hover:text-slate-900 transition-colors flex items-center gap-1.5">
                  <BrainCircuit className={`w-4 h-4 ${mode === 'deep' ? 'text-indigo-600' : 'text-slate-400'}`} />
                  Pencarian mendalam
                </span>
              </label>
            </div>
          )}

          {provider && (
            <p className="mt-3 text-xs text-slate-500">
              {mode === 'deep'
                ? 'Pencarian mendalam membaca lebih banyak sumber. Lebih lambat dan bisa makan beberapa menit.'
                : 'Pencarian cepat biasanya selesai dalam satu menit.'}
              {searchesLeft !== null && ` Sisa ${searchesLeft} dari ${quota!.limit} pencarian hari ini.`}
            </p>
          )}
          </>
          )}
        </div>

        {loading && (
          <SearchLoader
            label={source === 'bps' && bpsEnabled ? 'Mengambil data dari WebAPI BPS…' : `Mencari di web dengan ${provider?.label ?? 'AI'}…`}
            slowHint={source === 'bps' && bpsEnabled ? 'Server BPS sedang lambat. Permintaan dihentikan otomatis setelah 30 detik.' : mode === 'deep' ? 'Pencarian mendalam bisa makan sampai tujuh menit.' : 'Ini lebih lama dari biasanya. Pencarian dihentikan otomatis setelah tiga menit.'}
            slowAfterSeconds={source === 'bps' && bpsEnabled ? 15 : mode === 'deep' ? 180 : 60}
          />
        )}

        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-8 text-center animate-fade-in-up">
            {error}
          </div>
        )}

        {dataset && (
          <div className="space-y-8 animate-fade-in-up">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-2xl font-bold text-slate-900">{dataset.title}</h2>
                <p className="text-slate-600 mt-1 max-w-2xl">{dataset.description}</p>
                <p className="text-xs text-slate-500 mt-2">
                  {dataset.provider === 'bps' ? 'Diambil langsung dari' : 'Dikumpulkan oleh'} {dataset.providerLabel}
                  {dataset.model && ` (${dataset.model})`} pada{' '}
                  {new Date(dataset.retrievedAt).toLocaleDateString('id-ID', { dateStyle: 'long' })}
                </p>
                {dataset.suggestedAnalysis && (
                  <div className="mt-3 flex items-start gap-2 text-sm text-indigo-700 bg-indigo-50 px-3 py-2 rounded-md border border-indigo-100 max-w-2xl">
                    <Sparkles className="w-4 h-4 mt-0.5 shrink-0" />
                    <span className="font-medium">Saran analisis: {dataset.suggestedAnalysis}</span>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-3 shrink-0">
                <button
                  onClick={handleSaveDataset}
                  disabled={saveState !== 'idle'}
                  className="flex items-center space-x-2 bg-white border border-slate-300 hover:bg-slate-50 disabled:hover:bg-white disabled:text-slate-400 text-slate-700 px-4 py-2 rounded-lg transition-colors shadow-sm"
                >
                  {saveState === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> : saveState === 'saved' ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                  <span>{saveState === 'saved' ? 'Tersimpan' : 'Simpan'}</span>
                </button>
                {provider && (
                  <button
                    onClick={() => setIsAssistantOpen(true)}
                    className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors shadow-sm"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>Asisten riset</span>
                  </button>
                )}
                <button
                  onClick={() => downloadSpssSyntax(dataset)}
                  title="Sintaks SPSS yang mengimpor CSV beserta label dan tingkat pengukuran"
                  className="flex items-center space-x-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg transition-colors shadow-sm"
                >
                  <FileCode className="w-4 h-4" />
                  <span>Sintaks SPSS (.sps)</span>
                </button>
                <button
                  onClick={() => downloadCsv(dataset)}
                  className="flex items-center space-x-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg transition-colors shadow-md"
                >
                  <Download className="w-4 h-4" />
                  <span>Unduh .CSV</span>
                </button>
              </div>
            </div>

            {dataset.provider === 'bps' ? (
              <div className="flex items-start gap-3 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                <Check className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Angka resmi dari Badan Pusat Statistik, diambil tanpa AI.</p>
                  <p className="mt-0.5">Sel kosong berarti BPS tidak menerbitkan nilai untuk wilayah dan tahun itu.</p>
                  {dataset.warnings.length > 0 && (
                    <ul className="mt-2 list-disc pl-5 space-y-0.5">
                      {dataset.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : (
            <div className="flex items-start gap-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Cocokkan angka-angka ini dengan sumbernya sebelum dipakai.</p>
                <p className="mt-0.5">Data ini dikumpulkan oleh model AI dan bisa mengandung kesalahan.</p>
                {dataset.warnings.length > 0 && (
                  <ul className="mt-2 list-disc pl-5 space-y-0.5">
                    {dataset.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6 min-w-0">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="border-b border-slate-200">
                    <nav className="flex space-x-8 px-6" aria-label="Tabs">
                      {([
                        ['data', 'Data View', FileSpreadsheet],
                        ['variable', 'Variable View', TableIcon],
                      ] as const).map(([id, label, Icon]) => (
                        <button
                          key={id}
                          onClick={() => setActiveTab(id)}
                          className={`py-4 px-1 inline-flex items-center border-b-2 font-medium text-sm ${
                            activeTab === id
                              ? 'border-blue-500 text-blue-600'
                              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                          }`}
                        >
                          <Icon className="w-4 h-4 mr-2" />
                          {label}
                        </button>
                      ))}
                    </nav>
                  </div>

                  {activeTab === 'data' ? (
                    <DataView key={dataset.retrievedAt} dataset={dataset} />
                  ) : (
                    <VariableView dataset={dataset} onUpdateDataset={handleUpdateDataset} />
                  )}
                  <div className="bg-slate-50 px-6 py-2 border-t border-slate-200 text-xs text-slate-500 text-right">
                    {dataset.data.length} baris &bull; {dataset.variables.length} variabel
                  </div>
                </div>

                <DescriptiveStats dataset={dataset} />
              </div>

              <div className="space-y-6 min-w-0">
                <Charts dataset={dataset} />

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center">
                    <Search className="w-4 h-4 mr-2 text-slate-400" />
                    Sumber Data
                  </h3>
                  <ul className="space-y-2">
                    {dataset.sources.length > 0 ? (
                      dataset.sources.map((source) => (
                        <li key={source.url} className="text-xs">
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={source.url}
                            className="text-blue-600 hover:underline block truncate"
                          >
                            {source.title || new URL(source.url).hostname}
                          </a>
                        </li>
                      ))
                    ) : (
                      <li className="text-xs text-slate-500">AI tidak menyertakan tautan sumber.</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {dataset && provider && (
        <ChatAssistant
          dataset={dataset}
          providerId={provider.id}
          providerLabel={provider.label}
          isOpen={isAssistantOpen}
          onClose={() => setIsAssistantOpen(false)}
        />
      )}

      <SavedDatasetsModal
        isOpen={isSavedModalOpen}
        onClose={() => setIsSavedModalOpen(false)}
        datasets={savedDatasets}
        onLoad={handleLoadDataset}
        onDelete={handleDeleteDataset}
      />
    </div>
  );
};

export default App;
