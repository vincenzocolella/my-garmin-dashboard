import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Cpu, Gavel, Loader2, Sparkles } from 'lucide-react';
import { judgeText, PERSONAS } from '../lib/insights';
import { Button, useAI } from './ui';

const CACHE_KEY = 'bio-os-judge-v1';
const readCache = () => {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
  } catch {
    return null;
  }
};

/**
 * Global "AI Life & Body Judge" with selectable personality. `trigger` increments on "Sync & Judge Now";
 * `ready` turns true once fresh data has loaded, and the judgement is regenerated once per app opening.
 * Meanwhile the last saved judgement is shown, marked as such.
 */
export function JudgePanel({ trigger, onPersona, ready }) {
  const ai = useAI();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState(() => {
    const c = readCache();
    return c?.persona === ai.persona ? c.text : null;
  });
  const [stale, setStale] = useState(() => Boolean(readCache()));
  const autoDone = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const persona = ai.persona;
  const heuristic = ai.analytics ? judgeText(ai.analytics, persona) : '';
  const lastTrigger = useRef(trigger);

  const run = async ({ silent = false } = {}) => {
    if (!silent) setOpen(true);
    if (!ai.available) {
      setResult(null);
      setStale(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const text = await ai.generate('judge', { persona });
      setResult(text);
      setStale(false);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ text, persona, at: new Date().toISOString() }));
      } catch {
        /* quota: not important */
      }
    } catch (e) {
      setError(e.message);
      if (!silent) setResult(null);
    } finally {
      setLoading(false);
    }
  };

  // every time the app is opened: judge again as soon as fresh data and the AI provider are available
  useEffect(() => {
    if (autoDone.current || !ready || !ai.analytics) return undefined;
    if (ai.available) {
      autoDone.current = true;
      run({ silent: true });
      return undefined;
    }
    const giveUp = () => {
      autoDone.current = true;
      setResult(null); // no AI: the heuristic judgement is always up to date
      setStale(false);
    };
    if (ai.settings.aiProvider !== 'backend') {
      giveUp();
      return undefined;
    }
    const t = setTimeout(giveUp, 20000); // the backend (Render free tier) may need a while to wake up and report AI
    return () => clearTimeout(t);
  }, [ready, ai.analytics, ai.available]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (trigger !== lastTrigger.current) {
      lastTrigger.current = trigger;
      run();
    }
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const firstPersona = useRef(persona);
  useEffect(() => {
    if (persona === firstPersona.current) return;
    firstPersona.current = persona;
    setResult(null);
    setStale(false);
  }, [persona]);

  const firstLine = (result ?? heuristic).split('\n').find((l) => l.trim()) ?? '';
  return (
    <section className="glass relative overflow-hidden rounded-xl">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-cyan via-violet to-crimson" />
      <div className="flex flex-wrap items-center gap-3 px-5 py-3">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <Gavel size={16} className="shrink-0 text-cyan" />
          <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.18em] text-gray-200">AI Life & Body Judge</span>
          {!open && <span className="truncate text-xs text-gray-500">{loading ? <span className="inline-flex items-center gap-1 text-cyan"><Loader2 size={11} className="animate-spin" />aggiorno il giudizio…</span> : firstLine}</span>}
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
            {loading && !result ? 'Analisi dei dati in corso…' : result ?? heuristic}
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-gray-600">
            {result ? <><Sparkles size={10} className="text-cyan" />AI · {PERSONAS[persona].label}{stale && ' · giudizio precedente, aggiornamento in corso'}</> : <><Cpu size={10} />motore euristico · {PERSONAS[persona].label}</>}
          </div>
        </div>
      )}
    </section>
  );
}
