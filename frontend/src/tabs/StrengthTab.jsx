import { AlertTriangle, Dumbbell, GitCompareArrows, Radar as RadarIcon, Scale } from 'lucide-react';
import { C, Radar, TimeChart } from '../components/charts/Charts';
import { AIBox, Card, Kpi, Legend } from '../components/ui';
import { FOCUS_OPTIONS } from '../lib/analytics';
import { hybridText } from '../lib/insights';
import { fmt, fmtDay, fmtDuration } from '../lib/util';


function HybridCard({ a }) {
  const conflicts = a.strength.conflicts;
  return (
    <Card title="Hybrid Interference Monitor" subtitle="Carico cardiovascolare (TRIMP) vs neuromuscolare (sRPE/4) per settimana · conflitti di recupero" icon={GitCompareArrows} insightKey="hybrid" className="lg:col-span-2">
      <TimeChart rows={a.strength.weekly} height={210} xFormat={(d) => `sett ${fmtDay(d)}`} right={{ label: 'km' }}
        series={[
          { key: 'cardio', label: 'Carico cardio', type: 'bar', color: C.cyan },
          { key: 'nm', label: 'Carico neuromuscolare', type: 'bar', color: C.violet },
          { key: 'km', label: 'km corsa', axis: 'right', color: C.amber, dots: true },
        ]} />
      <Legend items={[{ label: 'Cardio (TRIMP)', color: C.cyan }, { label: 'Neuromuscolare (sRPE/4)', color: C.violet }, { label: 'km/settimana', color: C.amber }]} />
      <div className="mt-4">
        <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-gray-500"><AlertTriangle size={12} className="text-amber" />Conflitti di recupero ({conflicts.length})</div>
        {conflicts.length ? (
          <ul className="scrollbar-thin max-h-44 space-y-1.5 overflow-y-auto text-xs">
            {conflicts.slice(0, 12).map((c, i) => (
              <li key={i} className={`flex flex-wrap items-center gap-x-2 rounded border-l-2 bg-void/50 px-3 py-1.5 ${c.severity === 'high' ? 'border-crimson' : 'border-amber'}`}>
                <span className="num text-gray-500">{fmtDay(c.date)}</span>
                {c.kind === 'leg→run' ? (
                  <span className="text-gray-300"><b className="text-violet">{c.strength.name}</b> → {c.gapH} h dopo → <b className="text-cyan">{c.run.name}</b> {c.run.hard ? '(qualità)' : '(lungo)'}</span>
                ) : (
                  <span className="text-gray-300"><b className="text-cyan">{c.run.name}</b> → {c.gapH} h dopo → <b className="text-violet">{c.strength.name}</b></span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-emerald">Nessun leg day seguito da qualità/lungo entro 48 h. Ottima pianificazione.</p>
        )}
      </div>
    </Card>
  );
}

function BalanceCard({ a }) {
  return (
    <Card title="Hybrid Balance · 7 giorni" subtitle="50 = in linea con la media delle ultime 4 settimane" icon={RadarIcon} info="balance">
      <div className="flex justify-center"><Radar axes={a.strength.radar} size={290} /></div>
      <p className="mt-2 text-[11px] leading-relaxed text-gray-500">Carichi normalizzati sul cronico (×50), intensità = % tempo Z4-5 ×2.5, freschezza = 50 + 1.5×TSB.</p>
    </Card>
  );
}

function VolumeCard({ a, setOverrides }) {
  const s = a.strength;
  const setOverride = (id, patch) => setOverrides((o) => ({ ...o, [id]: { ...o[id], ...patch } }));
  return (
    <Card title="Volume & Tonnellaggio" subtitle="Sessioni di forza registrate dall’orologio · RPE e focus modificabili" icon={Scale} insightKey="volume" className="lg:col-span-3">
      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Kpi label="Sessioni" value={a.totals.strength} sub={`${fmt(s.perWeek, 1)}/settimana`} />
        <Kpi label="Tonnellaggio" value={fmt(s.tonnage)} unit="kg" />
        <Kpi label="RPE medio" value={fmt(s.avgRpe, 1)} tone={(s.avgRpe ?? 0) >= 8.5 ? 'warn' : undefined} />
        <Kpi label="Quota NM" value={fmt(s.nmShare)} unit="%" sub="del carico totale" />
        <Kpi label="Conflitti" value={s.conflicts.length} tone={s.conflicts.length ? 'warn' : 'good'} />
      </div>
      <TimeChart rows={s.weekly} height={170} xFormat={(d) => `sett ${fmtDay(d)}`} left={{ label: 'kg' }} right={{ min: 0, label: 'sedute' }}
        series={[
          { key: 'tonnage', label: 'Tonnellaggio', type: 'bar', color: C.violet, format: (v) => `${fmt(v)} kg` },
          { key: 'sessions', label: 'Sedute', axis: 'right', color: C.emerald, dots: true },
        ]} />
      <div className="scrollbar-thin mt-4 max-h-80 overflow-auto">
        <table className="w-full min-w-[680px] text-xs">
          <thead className="sticky top-0 bg-panel text-left text-[10px] uppercase tracking-wider text-gray-500">
            <tr><th className="py-2">Data</th><th>Sessione</th><th>Durata</th><th>FC</th><th>kcal</th><th>Volume</th><th>RPE</th><th>Focus</th></tr>
          </thead>
          <tbody className="num text-gray-300">
            {s.sessions.map((x) => (
              <tr key={x.id} className="border-t border-edge">
                <td className="py-1.5">{fmtDay(x.date)}</td>
                <td className="font-sans">{x.name}</td>
                <td>{fmtDuration(x.duration)}</td>
                <td>{fmt(x.avgHr)}</td>
                <td>{fmt(x.calories)}</td>
                <td>{x.strength?.volumeKg ? `${fmt(x.strength.volumeKg)} kg` : '—'}</td>
                <td>
                  <select className="rounded border border-edge bg-void px-1 py-0.5" value={x.rpe ?? ''} onChange={(e) => setOverride(x.id, { rpe: e.target.value ? Number(e.target.value) : undefined })}>
                    <option value="">—</option>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </td>
                <td>
                  <select className="rounded border border-edge bg-void px-1 py-0.5 font-sans" value={x.strength?.focus ?? ''} onChange={(e) => setOverride(x.id, { focus: e.target.value || undefined })}>
                    <option value="">N/D</option>
                    {FOCUS_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </td>
              </tr>
            ))}
            {!s.sessions.length && <tr><td colSpan={8} className="py-6 text-center font-sans text-gray-600">Nessuna sessione di forza nel periodo</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function StrengthTab({ a, setOverrides, overrides }) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <HybridCard a={a} />
      <BalanceCard a={a} />
      <VolumeCard a={a} overrides={overrides} setOverrides={setOverrides} />
      <AIBox title="AI Hybrid Strategist" icon={Dumbbell} task="hybrid" heuristic={hybridText} className="lg:col-span-3" />
    </div>
  );
}
