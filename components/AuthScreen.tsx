import React, { useState } from 'react';
import { Database, Loader2 } from 'lucide-react';
import { api } from '../services/api';
import { User } from '../types';

interface Props {
  allowRegistration: boolean;
  onSignedIn: (user: User) => void;
}

const AuthScreen: React.FC<Props> = ({ allowRegistration, onSignedIn }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } =
        mode === 'login' ? await api.login(email, password) : await api.register(name, email, password);
      onSignedIn(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan. Silakan coba lagi.');
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    'block w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center space-x-3 mb-8">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Database className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">SPSS DataScout</h1>
        </div>

        <form onSubmit={submit} className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">
            {mode === 'login' ? 'Masuk' : 'Buat akun'}
          </h2>

          {mode === 'register' && (
            <label className="block text-sm font-medium text-slate-700">
              Nama
              <input className={`${inputClass} mt-1`} value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
            </label>
          )}
          <label className="block text-sm font-medium text-slate-700">
            Email
            <input type="email" className={`${inputClass} mt-1`} value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Kata sandi
            <input
              type="password"
              className={`${inputClass} mt-1`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === 'register' ? 8 : undefined}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
            {mode === 'register' && <span className="block mt-1 text-xs font-normal text-slate-500">Minimal 8 karakter.</span>}
          </label>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}

          <button
            type="submit"
            disabled={busy}
            className="w-full flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg px-4 py-2 transition-colors"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : mode === 'login' ? 'Masuk' : 'Buat akun'}
          </button>
        </form>

        {allowRegistration && (
          <p className="text-center text-sm text-slate-600 mt-4">
            {mode === 'login' ? 'Belum punya akun?' : 'Sudah punya akun?'}{' '}
            <button
              type="button"
              className="text-blue-600 hover:underline font-medium"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError(null);
              }}
            >
              {mode === 'login' ? 'Daftar' : 'Masuk'}
            </button>
          </p>
        )}
      </div>
    </div>
  );
};

export default AuthScreen;
