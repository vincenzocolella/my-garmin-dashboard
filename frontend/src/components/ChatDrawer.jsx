import { useEffect, useRef, useState } from 'react';
import { Bot, Cpu, Loader2, Send, X } from 'lucide-react';
import { chatAnswer } from '../lib/insights';
import { useAI } from './ui';

const SUGGESTIONS = [
  'Posso fare un lungo da 16 km domenica visto il mio sonno di questa settimana?',
  'Sto correndo troppo forte nei giorni facili?',
  'Quando conviene fare il leg day questa settimana?',
  'Che tempo posso fare in mezza maratona?',
  'Perché il mio HRV è sceso?',
];

export function ChatDrawer({ open, onClose }) {
  const ai = useAI();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' }); // returns a Promise in recent Chromium: never return it from an effect
  }, [messages, loading]);

  const send = async (text) => {
    const q = text.trim();
    if (!q || loading || !ai.analytics) return;
    setInput('');
    const history = messages;
    setMessages((m) => [...m, { role: 'user', text: q }]);
    let answer;
    let source = 'heuristic';
    if (ai.available) {
      setLoading(true);
      try {
        answer = await ai.generate('chat', { question: q, history });
        source = 'ai';
      } catch (e) {
        answer = `${chatAnswer(ai.analytics, q)}\n\n(AI non disponibile: ${e.message})`;
      } finally {
        setLoading(false);
      }
    } else {
      answer = chatAnswer(ai.analytics, q);
    }
    setMessages((m) => [...m, { role: 'assistant', text: answer, source }]);
  };

  return (
    <>
      <div className={`fixed inset-0 z-40 bg-black/50 transition-opacity ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`} onClick={onClose} />
      <aside className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-edge bg-void/95 backdrop-blur-xl transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}
        aria-hidden={!open}>
        <header className="flex items-center justify-between border-b border-edge px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-cyan"><Bot size={16} />Ask Your Telemetry</div>
            <div className="text-[11px] text-gray-500">{ai.available ? 'AI con accesso all’intero JSON biometrico attivo' : 'Motore euristico (configura un provider AI per domande libere)'}</div>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:text-white"><X size={18} /></button>
        </header>
        <div className="scrollbar-thin flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {!messages.length && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">Prova a chiedere:</p>
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)}
                  className="block w-full rounded-md border border-edge px-3 py-2 text-left text-xs text-gray-300 hover:border-cyan/50 hover:text-cyan">{s}</button>
              ))}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'ml-8' : 'mr-4'}>
              <div className={`whitespace-pre-wrap rounded-lg px-3 py-2 text-[13px] leading-relaxed ${m.role === 'user' ? 'bg-cyan/15 text-gray-100' : 'border border-edge bg-panel text-gray-300'}`}>{m.text}</div>
              {m.role === 'assistant' && (
                <div className="mt-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-gray-600">
                  {m.source === 'ai' ? <><Bot size={10} className="text-cyan" />AI</> : <><Cpu size={10} />euristico</>}
                </div>
              )}
            </div>
          ))}
          {loading && <div className="flex items-center gap-2 text-xs text-gray-500"><Loader2 size={12} className="animate-spin" />Analizzo i tuoi dati…</div>}
          <div ref={endRef} />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2 border-t border-edge p-4">
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Chiedi qualcosa sui tuoi dati…"
            className="flex-1 rounded-md border border-edge bg-panel px-3 py-2 text-sm text-gray-100 outline-none placeholder:text-gray-600 focus:border-cyan/60" />
          <button type="submit" disabled={loading || !input.trim()} className="rounded-md bg-cyan px-3 text-void disabled:opacity-40"><Send size={16} /></button>
        </form>
      </aside>
    </>
  );
}
