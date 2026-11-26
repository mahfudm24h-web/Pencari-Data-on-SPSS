import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, BookOpen, Calculator, GraduationCap, Send, Sparkles, User as UserIcon, X } from 'lucide-react';
import { api } from '../services/api';
import { buildAssistantContext } from '../services/assistantContext';
import { SPSSDataset } from '../types';

interface Props {
  dataset: SPSSDataset;
  providerId: string;
  providerLabel: string;
  isOpen: boolean;
  onClose: () => void;
}

interface Message {
  role: 'user' | 'assistant';
  text: string;
  failed?: boolean;
}

const SUGGESTIONS = [
  { icon: Calculator, label: 'Uji statistik', text: 'Uji statistik SPSS apa yang paling cocok untuk variabel-variabel ini, dan asumsi apa yang perlu saya periksa dulu?' },
  { icon: GraduationCap, label: 'Ide judul', text: 'Beri saya 3 ide judul penelitian yang bisa dikerjakan dengan dataset ini, beserta metode analisisnya.' },
  { icon: BookOpen, label: 'Pola data', text: 'Ringkas pola utama dan hal yang janggal dari dataset ini.' },
];

// Models are asked for plain text; this removes Markdown marks if some slip through.
const plain = (text: string) => text.replace(/\*\*|__|`/g, '').replace(/^#{1,6}\s+/gm, '');

const ChatAssistant: React.FC<Props> = ({ dataset, providerId, providerLabel, isOpen, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const context = useMemo(() => buildAssistantContext(dataset), [dataset]);

  // A different dataset starts a new conversation.
  useEffect(() => {
    setMessages([]);
  }, [dataset.retrievedAt, dataset.title]);
  // Braces matter: newer browsers return a Promise from scrollIntoView, and an effect must not return one.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, busy, isOpen]);
  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    const history = [...messages.filter((m) => !m.failed), { role: 'user' as const, text: question }];
    setMessages(history);
    setInput('');
    setBusy(true);
    try {
      const reply = await api.askAssistant(providerId, context, history);
      setMessages([...history, { role: 'assistant', text: reply.text }]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Asisten tidak bisa menjawab saat ini.';
      setMessages([...history, { role: 'assistant', text: message, failed: true }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside
      aria-label="Asisten riset"
      aria-hidden={!isOpen}
      className={`fixed top-0 right-0 h-full w-full sm:w-[420px] bg-white shadow-2xl z-[60] flex flex-col border-l border-slate-200 transition-transform duration-300 ${
        isOpen ? 'translate-x-0' : 'translate-x-full invisible'
      }`}
    >
      <div className="bg-slate-900 p-4 flex items-center justify-between text-white">
        <div className="flex items-center gap-3 min-w-0">
          <div className="bg-indigo-500/20 p-2 rounded-lg border border-indigo-400/30">
            <Sparkles className="w-5 h-5 text-indigo-300" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-sm">Asisten Riset</h3>
            <p className="text-xs text-slate-300 truncate">{providerLabel} &bull; {dataset.title}</p>
          </div>
        </div>
        <button onClick={onClose} aria-label="Tutup asisten" className="p-2 rounded-full hover:bg-white/10 text-slate-300 hover:text-white">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 scrollbar-thin">
        {messages.length === 0 && (
          <div className="text-sm text-slate-600 bg-white border border-slate-200 rounded-xl p-4">
            <p className="font-medium text-slate-800">Tanyakan apa saja tentang dataset ini.</p>
            <p className="mt-1">
              Asisten melihat daftar variabel, statistik ringkas seluruh baris, dan 15 baris pertama. Ia bisa menyarankan
              uji statistik, ide penelitian, dan membaca pola data.
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border ${m.role === 'user' ? 'bg-blue-100 border-blue-200' : 'bg-white border-slate-200'}`}>
              {m.role === 'user' ? <UserIcon className="w-4 h-4 text-blue-600" /> : <Bot className="w-4 h-4 text-indigo-600" />}
            </div>
            <div
              className={`max-w-[85%] px-3.5 py-2.5 text-sm leading-relaxed rounded-2xl whitespace-pre-wrap break-words ${
                m.role === 'user'
                  ? 'bg-blue-600 text-white rounded-tr-sm'
                  : m.failed
                    ? 'bg-red-50 border border-red-200 text-red-700 rounded-tl-sm'
                    : 'bg-white border border-slate-200 text-slate-700 rounded-tl-sm'
              }`}
            >
              {m.role === 'assistant' ? plain(m.text) : m.text}
            </div>
          </div>
        ))}
        {busy && (
          <div role="status" className="flex gap-2 items-center text-sm text-slate-500">
            <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-indigo-600" />
            </div>
            <span className="animate-pulse">Sedang menyusun jawaban…</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="bg-white px-4 pt-3 flex gap-2 overflow-x-auto border-t border-slate-200">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.label}
            onClick={() => send(s.text)}
            disabled={busy}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full hover:bg-indigo-100 disabled:opacity-50 whitespace-nowrap"
          >
            <s.icon className="w-3.5 h-3.5" />
            {s.label}
          </button>
        ))}
      </div>

      <form
        className="p-4 bg-white"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <div className="relative">
          <textarea
            ref={inputRef}
            rows={2}
            value={input}
            maxLength={4000}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            aria-label="Pertanyaan untuk asisten"
            placeholder="Tulis pertanyaan…"
            className="w-full resize-none pl-3 pr-12 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm"
          />
          <button
            type="submit"
            aria-label="Kirim"
            disabled={!input.trim() || busy}
            className="absolute right-2 bottom-3 p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-slate-300"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Asisten tidak terhubung ke Scopus atau Google Scholar. Judul yang ia berikan adalah ide, bukan rujukan terbitan.
        </p>
      </form>
    </aside>
  );
};

export default ChatAssistant;
