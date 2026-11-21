import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Cpu, Gavel, Loader2, Sparkles } from 'lucide-react';
import { judgeText, PERSONAS } from '../lib/insights';
import { Button, useAI } from './ui';

/** Global "AI Life & Body Judge" with selectable personality. `trigger` increments on "Sync & Judge Now". */
export function JudgePanel({ trigger, onPersona }) {
  const ai = useAI();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const persona = ai.persona;
  const heuristic = ai.analytics ? judgeText(ai.analytics, persona) : '';
  const lastTrigger = useRef(trigger);

  const run = async () => {
    setOpen(true);
    if (!ai.available) {
      setResult(null);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setResult(await ai.generate('judge', { persona }));
    } catch (e) {
      setError(e.message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (trigger !== lastTrigger.current) {
      lastTrigger.current = trigger;
      run();
    }
  }); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setResult(null);
  }, [persona]);

  const firstLine = (result ?? heuristic).split('\n').find((l) => l.trim()) ?? '';
  return (
    <section className="glass relative overflow-hidden rounded-xl">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-cyan via-violet to-crimson" />
      <div className="flex flex-wrap items-center gap-3 px-5 py-3">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <Gavel size={16} className="shrink-0 text-cyan" />
          <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.18em] text-gray-200">AI Life & Body Judge</span>
          {!open && <span className="truncate text-xs text-gray-500">{firstLine}</span>}
          <ChevronDown size={14} className={`ml-auto shrink-0 text-gray-500 transition ${open ? 'rotate-180' : ''}`} />
        </button>
        <div className="flex flex-wrap gap-1">
          {Object.entries(PERSONAS).map(([key, p]) => (
            <button key={key} type="button" title={p.desc} onClick={() => onPersona(key)}
              className={`rounded-md border px-2 py-1 text-[11px] transition ${persona === key ? 'border-cyan/60 bg-cyan/10 text-cyan' : 'border-edge text-gray-400 hover:text-gray-200'}`}>
              {p.label}
            </button>
          ))}
        </div>
        <Button variant="primary" onClick={run} disabled={loading}>
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {ai.available ? 'Giudica' : 'Giudica (euristico)'}
        </Button>
      </div>
      {open && (
        <div className="border-t border-edge px-5 py-4">
          {error && <p className="mb-2 text-xs text-crimson">{error} · mostro il motore euristico</p>}
          <div className="scrollbar-thin max-h-96 overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-gray-300">
            {loading ? 'Analisi dei dati in corso…' : result ?? heuristic}
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-gray-600">
            {result ? <><Sparkles size={10} className="text-cyan" />AI · {PERSONAS[persona].label}</> : <><Cpu size={10} />motore euristico · {PERSONAS[persona].label}</>}
          </div>
        </div>
      )}
    </section>
  );
}
