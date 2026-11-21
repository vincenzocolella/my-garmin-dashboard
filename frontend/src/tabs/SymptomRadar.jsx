import { Activity, HeartCrack, History, Microscope, Stethoscope } from 'lucide-react';
import { C, TimeChart } from '../components/charts/Charts';
import { AIBox, Card, Kpi, Legend, TONE } from '../components/ui';
import { EPISODE_TYPES, SENSITIVITY } from '../lib/illness';
import { illnessText } from '../lib/insights';
import { fmt, fmtDay, fmtH, signed } from '../lib/util';

const TONE_HEX = { bad: C.crimson, warn: C.amber, info: C.cyan, good: C.emerald };

function NowCard({ a, sensitivity, onSensitivity, history }) {
  const il = a.illness;
  const t = il.current.today;
  const active = il.current.active;
  // index above threshold without the concordant RHR↑ + HRV↓ pattern: worth watching, not an alarm
  const watch = !active && (t?.index ?? 0) >= 50;
  const st = active ? { cls: 'border-crimson/50 bg-crimson/10', txt: 'text-crimson', label: 'Segnali attivi' }
    : watch ? { cls: 'border-amber/50 bg-amber/10', txt: 'text-amber', label: 'Da monitorare' }
    : { cls: 'border-emerald/40 bg-emerald/10', txt: 'text-emerald', label: 'Nella norma' };
  return (
    <Card title="Radar sintomi · oggi" subtitle="Segnali di malessere oggi rispetto alla tua normalità" icon={Stethoscope} insightKey="illnessNow">
      <div className={`mb-4 rounded-lg border p-4 text-center ${st.cls}`}>
        <div className={`num text-4xl font-bold ${st.txt}`}>{fmt(t?.index)}</div>
        <div className="text-[10px] uppercase tracking-[0.2em] text-gray-400">indice malessere · soglia 50</div>
        <div className={`mt-2 text-sm font-semibold ${st.txt}`}>{st.label}</div>
        {watch && <p className="mt-1 text-[11px] text-gray-400">Alcuni segnali sono fuori norma ma manca il quadro tipico di malessere (FC a riposo ↑ insieme a HRV ↓). Ricontrolla domani.</p>}
      </div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {(t?.signals?.length ? t.signals : ['nessuna deviazione rilevante']).map((s) => (
          <span key={s} className="rounded border border-edge px-2 py-0.5 text-[11px] text-gray-300">{s}</span>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Kpi label="FC riposo vs base" value={signed(t?.rhrDelta, 1)} unit="bpm" tone={(t?.rhrDelta ?? 0) >= 3 ? 'bad' : undefined} />
        <Kpi label="HRV vs base" value={signed(t?.hrvPct)} unit="%" tone={(t?.hrvPct ?? 0) <= -12 ? 'bad' : undefined} />
        <Kpi label="Giorni nella norma" value={il.stats.healthyStreak} />
        <Kpi label="Ultimo episodio" value={il.stats.lastEpisodeAgo != null ? `${il.stats.lastEpisodeAgo} gg fa` : '—'} />
      </div>
      <div className="mt-4 border-t border-edge pt-3">
        <div className="mb-1.5 text-[10px] uppercase tracking-[0.16em] text-gray-500">Sensibilità</div>
        <div className="flex gap-1">
          {Object.keys(SENSITIVITY).map((k) => (
            <button key={k} type="button" onClick={() => onSensitivity(k)}
              className={`flex-1 rounded-md border px-2 py-1 text-xs capitalize ${sensitivity === k ? 'border-cyan/60 bg-cyan/10 text-cyan' : 'border-edge text-gray-400 hover:text-gray-200'}`}>{k}</button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-gray-500">
          Storico: {il.stats.daysScanned} giorni analizzati{il.stats.firstDate ? ` dal ${fmtDay(il.stats.firstDate)}` : ''}.
          {history?.loading && <span className="text-amber"> Scarico lo storico… {history.done}/{history.total} blocchi</span>}
        </p>
      </div>
    </Card>
  );
}

function TimelineCard({ a }) {
  const il = a.illness;
  const rows = il.series.filter((d) => d.index != null);
  const idx = new Map(rows.map((r, i) => [r.date, i]));
  const windows = il.episodes
    .map((e) => ({ from: idx.get(e.start), to: idx.get(e.end), color: TONE_HEX[e.tone] }))
    .filter((w) => w.from != null && w.to != null);
  return (
    <Card title="Radar sintomi · timeline" subtitle="Indice giornaliero e scarti dalla baseline · episodi evidenziati" icon={History} insightKey="illnessTimeline" className="lg:col-span-2">
      <TimeChart rows={rows} height={180} left={{ min: 0, max: 100, label: 'indice' }} windows={windows}
        refLines={[{ y: 50, color: C.crimson, label: 'soglia' }]}
        series={[{ key: 'index', label: 'Indice malessere', type: 'bar', color: C.slate }]}
        barColor={(r) => (r.flagged ? C.crimson : r.index >= 35 ? C.amber : '#334155')}
        tooltipExtra={(r) => r.signals?.length ? <div className="mt-1 text-[10px] text-gray-400">{r.signals.join(' · ')}</div> : null} />
      <div className="mt-4 text-[10px] uppercase tracking-[0.16em] text-gray-500">Scarti dalla baseline</div>
      <TimeChart rows={rows} height={150} left={{ label: 'bpm' }} right={{ label: 'HRV %' }} windows={windows}
        refLines={[{ y: 0, color: C.slate }]}
        series={[
          { key: 'rhrDelta', label: 'FC riposo', color: C.crimson, width: 1.5, format: (v) => `${signed(v, 1)} bpm` },
          { key: 'hrvPct', label: 'HRV', axis: 'right', color: C.cyan, width: 1.5, format: (v) => `${signed(v)}%` },
        ]} />
      <Legend items={[{ label: 'Giorno anomalo', color: C.crimson }, { label: 'Vicino alla soglia', color: C.amber }, { label: 'FC riposo Δ', color: C.crimson }, { label: 'HRV Δ%', color: C.cyan }]} />
    </Card>
  );
}

function EpisodesCard({ a }) {
  const eps = a.illness.episodes;
  return (
    <Card title="Radar sintomi · episodi" subtitle="Periodi in cui il tuo fisico stava probabilmente male" icon={HeartCrack} info="illnessEpisodes" className="lg:col-span-2">
      {!eps.length && <p className="py-6 text-center text-sm text-gray-500">Nessun episodio con la sensibilità attuale. Prova “alta” per vedere anche i segnali deboli.</p>}
      <div className="scrollbar-thin max-h-[34rem] space-y-3 overflow-y-auto pr-1">
        {eps.map((e) => {
          const t = TONE[e.tone];
          return (
            <article key={e.start} className={`rounded-lg border-l-2 ${t.border} bg-void/60 p-3`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="num text-sm font-semibold text-gray-100">{fmtDay(e.start)}{e.end !== e.start ? ` → ${fmtDay(e.end)}` : ''}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${t.text}`} style={{ background: `${t.hex}1f` }}>{e.label}</span>
                  {e.ongoing && <span className="rounded bg-crimson/20 px-1.5 py-0.5 text-[10px] font-semibold text-crimson">IN CORSO</span>}
                </div>
                <span className="num text-[11px] text-gray-500">{e.days} {e.days === 1 ? 'giorno' : 'giorni'} · confidenza {e.confidence}%</span>
              </div>
              <div className="mt-1 h-1 w-full rounded-full bg-edge"><div className="h-1 rounded-full" style={{ width: `${e.confidence}%`, background: t.hex }} /></div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-4">
                <span className="text-gray-500">FC riposo <b className="num text-gray-200">{signed(e.markers.rhr, 1)} bpm</b></span>
                <span className="text-gray-500">HRV <b className="num text-gray-200">{signed(e.markers.hrv)}%</b></span>
                <span className="text-gray-500">Stress <b className="num text-gray-200">{signed(e.markers.stress)}</b></span>
                <span className="text-gray-500">Rientro <b className="num text-gray-200">{e.recoveryDays != null ? `${e.recoveryDays} gg` : e.ongoing ? '—' : '> 14 gg'}</b></span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {e.signals.map((s) => <span key={s} className="rounded border border-edge px-1.5 py-0.5 text-[10px] text-gray-400">{s}</span>)}
                {(e.loadRatio ?? 0) >= 1.3 && <span className="rounded border border-amber/40 px-1.5 py-0.5 text-[10px] text-amber">carico prima ×{fmt(e.loadRatio, 1)}</span>}
                {(e.sleepBefore ?? 0) <= -0.5 && <span className="rounded border border-violet/40 px-1.5 py-0.5 text-[10px] text-violet">sonno prima {fmtH(e.sleepBefore, { signed: true })}</span>}
                {e.trainingStopped && <span className="rounded border border-edge px-1.5 py-0.5 text-[10px] text-gray-400">allenamento sospeso</span>}
              </div>
              {e.hardDuring.length > 0 && (
                <p className="mt-2 text-[11px] text-amber">Sedute dure durante l’episodio: {e.hardDuring.map((h) => `${fmtDay(h.date)} ${h.name}`).join(', ')}</p>
              )}
              <p className="mt-2 text-[11px] leading-relaxed text-gray-400">{EPISODE_TYPES[e.type].advice}</p>
            </article>
          );
        })}
      </div>
    </Card>
  );
}

function PatternsCard({ a }) {
  const st = a.illness.stats;
  const byType = Object.entries(EPISODE_TYPES).map(([k, v]) => ({ ...v, key: k, n: a.illness.episodes.filter((e) => e.type === k).length }));
  return (
    <Card title="Radar sintomi · trigger" subtitle="Cosa precede i tuoi episodi" icon={Microscope} insightKey="illnessPatterns">
      <div className="grid grid-cols-2 gap-4">
        <Kpi label="Episodi" value={st.count} />
        <Kpi label="Durata media" value={fmt(st.avgDays, 1)} unit="gg" />
        <Kpi label="Rientro medio" value={fmt(st.avgRecovery, 1)} unit="gg" />
        <Kpi label="Allenato forte da malato" value={st.trainedHard} tone={st.trainedHard ? 'warn' : 'good'} />
        <Kpi label="Dopo picchi di carico" value={st.afterHighLoad} />
        <Kpi label="Dopo notti corte" value={st.afterShortSleep} />
      </div>
      <div className="mt-4 space-y-1.5 border-t border-edge pt-3">
        {byType.map((t) => (
          <div key={t.key} className="flex items-center justify-between text-xs">
            <span className={TONE[t.tone].text}>{t.label}</span>
            <span className="num text-gray-300">{t.n}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] leading-relaxed text-gray-600">Analisi statistica dei dati dell’orologio, non una diagnosi medica.</p>
    </Card>
  );
}

/** "Radar sintomi": illness / malaise scan, shown at the bottom of the health tab. */
export function SymptomRadar({ a, sensitivity, onSensitivity, history }) {
  return (
    <>
      <div className="flex items-center gap-3 pt-4 lg:col-span-3">
        <Stethoscope size={16} className="text-cyan" />
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-200">Radar sintomi</h2>
        <span className="text-xs text-gray-500">periodi in cui il tuo fisico stava probabilmente male</span>
        <div className="h-px flex-1 bg-edge" />
      </div>
      <NowCard a={a} sensitivity={sensitivity} onSensitivity={onSensitivity} history={history} />
      <TimelineCard a={a} />
      <EpisodesCard a={a} />
      <PatternsCard a={a} />
      <AIBox title="AI Radar sintomi" icon={Activity} task="illness" heuristic={illnessText} className="lg:col-span-3" info="illnessEpisodes" />
    </>
  );
}
