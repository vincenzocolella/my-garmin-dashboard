import { Component, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Cpu, Info, Loader2, RotateCcw, Sparkles, X } from 'lucide-react';
import { INFO } from '../lib/info';
import { aiAvailable, callAI, cleanText, parseJson, systemFor, taskPrompt } from '../lib/ai';
import { cardInsights, PERSONAS } from '../lib/insights';

export const TONE = {
  good: { text: 'text-emerald', border: 'border-emerald', bg: 'bg-emerald', hex: '#10B981' },
  warn: { text: 'text-amber', border: 'border-amber', bg: 'bg-amber', hex: '#F59E0B' },
  bad: { text: 'text-crimson', border: 'border-crimson', bg: 'bg-crimson', hex: '#EF4444' },
  info: { text: 'text-cyan', border: 'border-cyan', bg: 'bg-cyan', hex: '#00F0FF' },
  neutral: { text: 'text-gray-400', border: 'border-gray-600', bg: 'bg-gray-500', hex: '#9CA3AF' },
};

// --------------------------------------------------------------------- AI context
const AICtx = createContext(null);

export function AIProvider({ settings, analytics, backendStatus, children }) {
  const available = aiAvailable(settings, backendStatus);
  const [aiInsights, setAiInsights] = useState(null);
  const [insLoading, setInsLoading] = useState(false);
  const [insError, setInsError] = useState('');
  const heuristics = useMemo(() => (analytics ? cardInsights(analytics) : {}), [analytics]);
  const dataKey = analytics ? `${analytics.source}:${analytics.scenario}:${analytics.rangeDays}:${analytics.latestDate}` : '';
  useEffect(() => {
    setAiInsights(null);
  }, [dataKey]);

  const generate = useCallback(
    async (task, extra = {}) => {
      const text = await callAI(settings, { system: systemFor(extra.persona ?? settings.persona), prompt: taskPrompt(task, analytics, extra) });
      return cleanText(text);
    },
    [settings, analytics],
  );

  const requestInsights = useCallback(async () => {
    if (!available || !analytics) return;
    setInsLoading(true);
    setInsError('');
    try {
      const text = await callAI(settings, { system: systemFor(settings.persona), prompt: taskPrompt('insights', analytics), json: true });
      setAiInsights(parseJson(text));
    } catch (e) {
      setInsError(e.message);
    } finally {
      setInsLoading(false);
    }
  }, [available, analytics, settings]);

  const value = { available, settings, analytics, heuristics, aiInsights, insLoading, insError, requestInsights, generate, persona: settings.persona };
  return <AICtx.Provider value={value}>{children}</AICtx.Provider>;
}
export const useAI = () => useContext(AICtx);

// --------------------------------------------------------------------- primitives
export function InfoPanel({ entry, onClose }) {
  if (!entry) return null;
  return (
    <div className="relative mb-4 rounded-lg border border-cyan/30 bg-void/80 p-3 pr-8 text-xs leading-relaxed text-gray-300">
      <button type="button" onClick={onClose} className="absolute right-2 top-2 text-gray-500 hover:text-white" aria-label="Chiudi"><X size={14} /></button>
      {entry.what && <p className="mb-1.5"><b className="text-cyan">Cos’è · </b>{entry.what}</p>}
      {entry.how && <p className="mb-1.5"><b className="text-cyan">Come si calcola · </b>{entry.how}</p>}
      {entry.read && <p><b className="text-cyan">Come leggerlo · </b>{entry.read}</p>}
      {entry.items?.length > 0 && (
        <div className="mt-3">
          <b className="text-cyan">Elemento per elemento</b>
          <div className="mt-1.5 overflow-x-auto">
            <table className="w-full min-w-[420px] text-[11px]">
              <thead><tr className="text-left text-[10px] uppercase tracking-wider text-gray-500"><th className="py-1 pr-2">Elemento</th><th className="pr-2">Cosa indica</th><th>Ideale</th></tr></thead>
              <tbody>
                {entry.items.map(([name, meaning, ideal]) => (
                  <tr key={name} className="border-t border-edge align-top">
                    <td className="py-1 pr-2 font-semibold text-gray-200">{name}</td>
                    <td className="py-1 pr-2 text-gray-400">{meaning}</td>
                    <td className="py-1 text-emerald">{ideal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export function InfoButton({ open, onClick }) {
  return (
    <button type="button" onClick={onClick} title="Cos’è questa metrica?" aria-label="Informazioni sulla metrica"
      className={`rounded-md border p-1 transition ${open ? 'border-cyan/60 bg-cyan/10 text-cyan' : 'border-edge text-gray-500 hover:border-cyan/50 hover:text-cyan'}`}>
      <Info size={13} />
    </button>
  );
}

export function Card({ title, subtitle, icon: Icon, insightKey, info, actions, children, className = '' }) {
  const ai = useAI();
  const [showInfo, setShowInfo] = useState(false);
  const infoEntry = INFO[info ?? insightKey];
  const h = insightKey ? ai.heuristics[insightKey] : null;
  const aiText = insightKey ? ai.aiInsights?.[insightKey] : null;
  return (
    <section className={`glass min-w-0 rounded-xl p-5 ${className}`}>
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-300">
            {Icon && <Icon size={15} className="shrink-0 text-cyan" />}
            {title}
          </h3>
          {subtitle && <p className="mt-1 text-xs text-gray-500">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {insightKey && ai.heuristics[insightKey] && <AIBadge />}
          {infoEntry && <InfoButton open={showInfo} onClick={() => setShowInfo((v) => !v)} />}
        </div>
      </header>
      {showInfo && <InfoPanel entry={infoEntry} onClose={() => setShowInfo(false)} />}
      {insightKey && h && <InsightLine text={typeof aiText === 'string' ? aiText : h.text} tone={h.tone} ai={typeof aiText === 'string'} />}
      {children}
    </section>
  );
}

function AIBadge() {
  const ai = useAI();
  const title = ai.available
    ? ai.aiInsights ? 'Micro-insight AI attivi. Clicca per rigenerare tutte le card.' : 'Genera micro-insight AI per tutte le card'
    : 'Motore euristico attivo. Configura un provider AI nelle impostazioni.';
  return (
    <button
      type="button"
      onClick={ai.requestInsights}
      disabled={!ai.available || ai.insLoading}
      title={ai.insError || title}
      className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold tracking-wider transition ${
        ai.aiInsights ? 'border-cyan/60 bg-cyan/10 text-cyan' : ai.available ? 'border-edge text-gray-400 hover:border-cyan/60 hover:text-cyan' : 'cursor-help border-edge text-gray-600'
      } ${ai.insError ? 'border-crimson/60 text-crimson' : ''}`}
    >
      {ai.insLoading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}AI
    </button>
  );
}

export function InsightLine({ text, tone = 'info', ai }) {
  const t = TONE[tone] ?? TONE.info;
  return (
    <div className={`mb-4 flex items-start gap-2 rounded-md border-l-2 ${t.border} bg-void/60 px-3 py-2 text-xs leading-relaxed text-gray-300`}>
      {ai ? <Sparkles size={13} className="mt-0.5 shrink-0 text-cyan" /> : <Cpu size={13} className={`mt-0.5 shrink-0 ${t.text}`} />}
      <span>{text}</span>
    </div>
  );
}

export function Kpi({ label, value, unit, sub, tone, big }) {
  const t = tone ? TONE[tone] : null;
  return (
    <div className="min-w-0">
      <div className="truncate text-[10px] uppercase tracking-[0.16em] text-gray-500">{label}</div>
      <div className={`num font-bold leading-tight ${big ? 'text-3xl' : 'text-xl'} ${t ? t.text : 'text-gray-100'}`}>
        {value ?? '—'}
        {unit && <span className="ml-1 text-xs font-normal text-gray-500">{unit}</span>}
      </div>
      {sub && <div className="truncate text-[11px] text-gray-500">{sub}</div>}
    </div>
  );
}

export function Legend({ items }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-400">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm" style={{ background: i.color, opacity: i.dashed ? 0.6 : 1 }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

export function Button({ children, onClick, disabled, variant = 'ghost', className = '', title, type = 'button' }) {
  const styles = {
    primary: 'bg-cyan text-void hover:bg-cyan/85 font-semibold',
    ghost: 'border border-edge text-gray-300 hover:border-cyan/50 hover:text-cyan',
    danger: 'border border-crimson/40 text-crimson hover:bg-crimson/10',
  };
  return (
    <button type={type} title={title} onClick={onClick} disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-40 ${styles[variant]} ${className}`}>
      {children}
    </button>
  );
}

/**
 * Long-form analysis box. Shows the heuristic engine's output immediately; "Genera con AI"
 * replaces it with the configured provider's answer for the current persona.
 */
export function AIBox({ title, icon: Icon = Sparkles, task, heuristic, extra, className = '', compact, info }) {
  const ai = useAI();
  const [showInfo, setShowInfo] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const persona = ai.persona;
  const heuristicText = useMemo(() => (ai.analytics ? heuristic(ai.analytics, persona) : ''), [ai.analytics, persona, heuristic]);
  const extraKey = extra?.run?.id ?? '';
  useEffect(() => {
    setResult(null);
  }, [ai.analytics?.latestDate, ai.analytics?.rangeDays, persona, extraKey]);

  const run = async () => {
    setLoading(true);
    setError('');
    try {
      setResult(await ai.generate(task, { ...extra, persona }));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className={`glass relative min-w-0 overflow-hidden rounded-xl p-5 ${className}`}>
      <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-cyan/10 blur-3xl" />
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan">
          <Icon size={15} /> {title}
        </h3>
        <div className="flex items-center gap-2">
          <span className="rounded border border-edge px-1.5 py-0.5 text-[10px] text-gray-500">{PERSONAS[persona]?.short}</span>
          {result && <Button onClick={() => setResult(null)} title="Torna al motore euristico"><Cpu size={12} />Euristica</Button>}
          <Button variant={ai.available ? 'primary' : 'ghost'} onClick={run} disabled={!ai.available || loading}
            title={ai.available ? '' : 'Configura un provider AI nelle impostazioni'}>
            {loading ? <Loader2 size={12} className="animate-spin" /> : result ? <RotateCcw size={12} /> : <Sparkles size={12} />}
            {loading ? 'Analisi…' : result ? 'Rigenera' : 'Genera con AI'}
          </Button>
          {info && INFO[info] && <InfoButton open={showInfo} onClick={() => setShowInfo((v) => !v)} />}
        </div>
      </header>
      {showInfo && <InfoPanel entry={INFO[info]} onClose={() => setShowInfo(false)} />}
      {error && <p className="mb-2 text-xs text-crimson">{error}</p>}
      <div className={`scrollbar-thin overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-gray-300 ${compact ? 'max-h-72' : 'max-h-[28rem]'}`}>
        {result ?? heuristicText}
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-gray-600">
        {result ? <><Sparkles size={10} className="text-cyan" /> generato da AI · verifica sempre i consigli</> : <><Cpu size={10} /> motore euristico deterministico</>}
      </div>
    </section>
  );
}

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error)
      return (
        <div className="glass m-8 rounded-xl p-6 text-sm">
          <p className="mb-2 font-semibold text-crimson">Errore di rendering</p>
          <pre className="whitespace-pre-wrap text-gray-400">{String(this.state.error?.message ?? this.state.error)}</pre>
          <Button className="mt-4" onClick={() => this.setState({ error: null })}>Riprova</Button>
        </div>
      );
    return this.props.children;
  }
}
