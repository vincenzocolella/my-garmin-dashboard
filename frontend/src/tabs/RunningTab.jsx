import { useMemo, useState } from 'react';
import { ArrowDownUp, Flag, Gauge, Layers, LineChart, ListOrdered, Timer } from 'lucide-react';
import { C, ScatterChart, SplitBar, TimeChart } from '../components/charts/Charts';
import { AIBox, Card, Kpi, Legend } from '../components/ui';
import { tsbZone } from '../lib/analytics';
import { hrZones, overtrainingRisk, runningCoachText, sessionCritique } from '../lib/insights';
import { fmt, fmtDay, fmtDuration, fmtPace, isNum, signed } from '../lib/util';

const ZONE_COLORS = { transition: C.blue, fresh: C.cyan, neutral: C.slate, optimal: C.emerald, risk: C.crimson };

function PmcCard({ a }) {
  const p = a.pmc.latest ?? {};
  const z = a.pmc.zone;
  const risk = overtrainingRisk(a);
  return (
    <Card title="Fitness, Fatigue & Form (PMC)" subtitle="CTL 42gg · ATL 7gg · TSB = CTL − ATL · ACWR rolling 7/28 · carico = TRIMP (corsa) + sRPE (forza)" icon={LineChart} insightKey="pmc" className="lg:col-span-2">
      <div className="mb-4 grid grid-cols-3 gap-4 sm:grid-cols-6">
        <Kpi label="Fitness CTL" value={fmt(p.ctl, 1)} sub={`${signed(a.pmc.ctlChange, 1)} nel periodo`} />
        <Kpi label="Fatica ATL" value={fmt(p.atl, 1)} />
        <Kpi label="Forma TSB" value={signed(p.tsb, 1)} tone={z?.tone === 'bad' ? 'bad' : z?.key === 'optimal' || z?.key === 'fresh' ? 'good' : undefined} sub={z?.label} />
        <Kpi label="ACWR" value={fmt(p.acwr, 2)} tone={(p.acwr ?? 1) > 1.5 ? 'bad' : (p.acwr ?? 1) > 1.3 ? 'warn' : 'good'} sub="sweet spot 0.8–1.3" />
        <Kpi label="Ramp rate" value={signed(a.pmc.rampRate, 1)} unit="/sett" tone={(a.pmc.rampRate ?? 0) > 7 ? 'warn' : undefined} />
        <Kpi label="Rischio OT" value={risk} unit="/100" tone={risk >= 60 ? 'bad' : risk >= 35 ? 'warn' : 'good'} />
      </div>
      <TimeChart rows={a.pmc.rows} height={210} left={{ label: 'CTL / ATL' }} right={{ label: 'carico' }}
        series={[
          { key: 'load', label: 'Carico giornaliero', type: 'bar', axis: 'right', color: C.slate, opacity: 0.45 },
          { key: 'ctl', label: 'Fitness (CTL)', type: 'area', color: C.cyan, width: 2.5 },
          { key: 'atl', label: 'Fatica (ATL)', color: C.crimson },
        ]} />
      <div className="mt-2">
        <TimeChart rows={a.pmc.rows} height={170} left={{ label: 'TSB' }} right={{ min: 0, max: 2.2, label: 'ACWR', format: (v) => fmt(v, 1) }}
          zones={[
            { from: 20, to: 100, color: ZONE_COLORS.transition, label: 'Transizione' },
            { from: 5, to: 20, color: ZONE_COLORS.fresh, label: 'Freschezza' },
            { from: -10, to: 5, color: ZONE_COLORS.neutral, label: 'Zona grigia' },
            { from: -30, to: -10, color: ZONE_COLORS.optimal, label: 'Ottimale' },
            { from: -200, to: -30, color: ZONE_COLORS.risk, label: 'Alto rischio' },
          ]}
          refLines={[{ y: 1.3, axis: 'right', color: C.amber, label: 'ACWR 1.3' }, { y: 1.5, axis: 'right', color: C.crimson, label: '1.5' }]}
          series={[
            { key: 'tsb', label: 'Forma (TSB)', type: 'bar', color: C.emerald, format: (v) => signed(v, 1) },
            { key: 'acwr', label: 'ACWR', axis: 'right', color: C.amber, width: 1.5, format: (v) => fmt(v, 2) },
          ]}
          barColor={(row) => ZONE_COLORS[tsbZone(row.tsb)?.key] ?? C.slate} />
      </div>
      <Legend items={[{ label: 'CTL', color: C.cyan }, { label: 'ATL', color: C.crimson }, { label: 'Carico', color: C.slate }, { label: 'TSB (colore = zona)', color: C.emerald }, { label: 'ACWR', color: C.amber }]} />
    </Card>
  );
}

function EfficiencyCard({ a }) {
  const e = a.efficiency;
  const pts = e.points.map((p) => ({ ...p, color: p.long ? C.violet : p.hard ? C.crimson : C.cyan, r: p.long ? 6.5 : 5 }));
  const dec = [...a.runs].reverse().filter((r) => isNum(r.decoupling)).map((r) => ({ date: r.date, decoupling: r.decoupling, name: r.name }));
  return (
    <Card title="Efficienza Aerobica & Cardiac Drift" subtitle="Efficiency Factor = velocità (m/min) / FC media · trend sulle corse facili" icon={Gauge} insightKey="ef" className="lg:col-span-2">
      <div className="mb-4 grid grid-cols-3 gap-4">
        <Kpi label="Trend EF (facili)" value={signed(e.trendPct, 1)} unit="%" tone={(e.trendPct ?? 0) >= 2 ? 'good' : (e.trendPct ?? 0) <= -2 ? 'bad' : undefined} />
        <Kpi label="Decoupling medio" value={fmt(e.avgDecoupling, 1)} unit="%" tone={(e.avgDecoupling ?? 0) > 5 ? 'warn' : 'good'} sub="ultime 8 corse · < 5% = ok" />
        <Kpi label="Corse > 5% drift" value={e.highDecoupling} />
      </div>
      <ScatterChart points={pts} height={230} yLabel="EF" xFormat={(t) => fmtDay(new Date(t).toISOString().slice(0, 10))} yFormat={(v) => fmt(v, 2)} trendFilter={(p) => !p.hard && !p.long}
        tooltip={(p) => (
          <>
            <div className="mb-1 font-semibold text-gray-200">{p.name} · {fmtDay(p.date)}</div>
            <div className="num text-gray-400">EF {fmt(p.y, 3)} · {fmtPace(p.pace)}/km · {fmt(p.hr)} bpm</div>
          </>
        )} />
      <Legend items={[{ label: 'Facile', color: C.cyan }, { label: 'Qualità', color: C.crimson }, { label: 'Lungo', color: C.violet }, { label: 'Trend facili', color: C.cyan, dashed: true }]} />
      {dec.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-gray-500">Decoupling Pa:HR per corsa (%)</div>
          <TimeChart rows={dec} height={110} left={{ min: 0 }} refLines={[{ y: 5, color: C.amber, label: '5%' }]}
            series={[{ key: 'decoupling', label: 'Decoupling', type: 'bar', color: C.cyan, format: (v) => `${fmt(v, 1)}%` }]}
            barColor={(row) => (row.decoupling > 5 ? C.amber : C.emerald)}
            tooltipExtra={(row) => <div className="text-[10px] text-gray-500">{row.name}</div>} />
        </div>
      )}
    </Card>
  );
}

function ZonesCard({ a }) {
  const zn = a.zones;
  const tot = zn.totals.reduce((s, x) => s + x, 0);
  const zoneHr = hrZones(a);
  const names = ['Z1 recupero', 'Z2 aerobico', 'Z3 tempo (grigia)', 'Z4 soglia', 'Z5 VO2max'];
  const colors = ['#1D4ED8', C.cyan, C.amber, '#F97316', C.crimson];
  return (
    <Card title="Polarized Check 80/20" subtitle={`Distribuzione del tempo in zona FC (FC max ${a.profile.maxHr}, ${a.profile.maxHrSource})`} icon={Layers} insightKey="zones">
      {zn.pct ? (
        <>
          <div className="mb-1 flex justify-between text-[11px] text-gray-400">
            <span>Z1-2 <b className="num text-cyan">{zn.pct.low}%</b></span>
            <span>Z3 <b className="num text-amber">{zn.pct.mid}%</b></span>
            <span>Z4-5 <b className="num text-crimson">{zn.pct.high}%</b></span>
          </div>
          <SplitBar parts={[{ label: 'Z1-2', value: zn.pct.low, color: C.cyan }, { label: 'Z3', value: zn.pct.mid, color: C.amber }, { label: 'Z4-5', value: zn.pct.high, color: C.crimson }]} />
          <div className="relative mt-1 h-3 text-[9px] text-gray-500">
            <span className="absolute -translate-x-1/2" style={{ left: '80%' }}>▲ target 80%</span>
          </div>
          <div className="mt-3 space-y-1.5">
            {zn.totals.map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <span className="w-28 text-gray-400">{names[i]}</span>
                <div className="h-1.5 flex-1 rounded-full bg-edge"><div className="h-1.5 rounded-full" style={{ width: `${tot ? (s / tot) * 100 : 0}%`, background: colors[i] }} /></div>
                <span className="num w-14 text-right text-gray-300">{fmt(s / 3600, 1)} h</span>
              </div>
            ))}
          </div>
          <div className="mt-4 text-[10px] uppercase tracking-[0.16em] text-gray-500">Ore per settimana</div>
          <TimeChart rows={zn.weekly} height={140} xFormat={(d) => fmtDay(d)}
            series={[
              { key: 'low', label: 'Z1-2', type: 'stack', color: C.cyan, format: (v) => `${fmt(v, 1)} h` },
              { key: 'mid', label: 'Z3', type: 'stack', color: C.amber, format: (v) => `${fmt(v, 1)} h` },
              { key: 'high', label: 'Z4-5', type: 'stack', color: C.crimson, format: (v) => `${fmt(v, 1)} h` },
            ]} />
          <p className="mt-2 text-[11px] text-gray-500">Tetto easy run: <span className="num text-cyan">{zoneHr.z2Top} bpm</span> · soglia ~<span className="num text-gray-300">{zoneHr.threshold} bpm</span></p>
        </>
      ) : (
        <p className="py-8 text-center text-sm text-gray-600">Nessuna corsa con FC nel periodo.</p>
      )}
    </Card>
  );
}

function RaceCard({ a }) {
  const rc = a.race;
  return (
    <Card title="Race Predictor & VO2max" subtitle={`Modello VDOT (Daniels) da ${rc.vdotSource}, penalizzato per volume < 40 km/sett`} icon={Flag} insightKey="race">
      <div className="mb-3 grid grid-cols-2 gap-4">
        <Kpi label="VO2max" value={fmt(rc.vo2max, 1)} unit="ml/kg/min" big tone="info" />
        <Kpi label="Volume 4 sett" value={fmt(rc.weeklyKm, 1)} unit="km/sett" tone={rc.weeklyKm < 25 ? 'warn' : undefined} />
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wider text-gray-500"><th className="py-1">Gara</th><th>Stima</th><th>Passo</th><th>Garmin</th></tr>
        </thead>
        <tbody className="num">
          {rc.predictions.map((p) => (
            <tr key={p.key} className="border-t border-edge">
              <td className="py-1.5 font-sans text-gray-300">{p.label}</td>
              <td className={`font-bold ${p.key === 'half' ? 'text-cyan' : 'text-gray-100'}`}>{fmtDuration(p.model)}</td>
              <td className="text-gray-400">{fmtPace(p.pace)}</td>
              <td className="text-gray-500">{p.garmin ? fmtDuration(p.garmin) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rc.vo2Series.length > 1 && (
        <div className="mt-4">
          <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-gray-500">Trend VO2max</div>
          <TimeChart rows={rc.vo2Series} height={100} series={[{ key: 'vo2max', label: 'VO2max', color: C.violet, dots: true }]} />
        </div>
      )}
    </Card>
  );
}

const COLS = [
  { key: 'date', label: 'Data', get: (r) => r.startTs, render: (r) => fmtDay(r.date) },
  { key: 'name', label: 'Sessione', get: (r) => r.name, render: (r) => <span className="font-sans">{r.name}{r.easyTooHard && <span className="ml-1 text-amber" title="Easy run troppo intensa">⚠</span>}</span> },
  { key: 'km', label: 'km', get: (r) => r.distance, render: (r) => fmt(r.distance / 1000, 1) },
  { key: 'dur', label: 'Durata', get: (r) => r.duration, render: (r) => fmtDuration(r.duration) },
  { key: 'pace', label: 'Passo', get: (r) => r.pace, render: (r) => fmtPace(r.pace) },
  { key: 'hr', label: 'FC med/max', get: (r) => r.avgHr, render: (r) => `${fmt(r.avgHr)}/${fmt(r.maxHr)}` },
  { key: 'cad', label: 'Cad.', get: (r) => r.cadence, render: (r) => fmt(r.cadence) },
  { key: 'te', label: 'TE A/An', get: (r) => r.aerobicTE, render: (r) => `${fmt(r.aerobicTE, 1)}/${fmt(r.anaerobicTE, 1)}` },
  { key: 'dec', label: 'Decoup.', get: (r) => r.decoupling, render: (r) => (isNum(r.decoupling) ? <span className={r.decoupling > 5 ? 'text-amber' : 'text-emerald'}>{fmt(r.decoupling, 1)}%</span> : '—') },
  { key: 'ef', label: 'EF', get: (r) => r.ef, render: (r) => fmt(r.ef, 2) },
];

function RunsTable({ a, selected, onSelect }) {
  const [sort, setSort] = useState({ key: 'date', dir: -1 });
  const col = COLS.find((c) => c.key === sort.key);
  const rows = useMemo(() => [...a.runs].sort((x, y) => ((col.get(x) ?? -Infinity) > (col.get(y) ?? -Infinity) ? 1 : -1) * sort.dir), [a.runs, col, sort.dir]);
  return (
    <Card title="Ultime corse" subtitle="Clicca una corsa per la critica della sessione · intestazioni ordinabili" icon={ListOrdered} insightKey="runs" className="lg:col-span-2">
      <div className="scrollbar-thin max-h-[26rem] overflow-auto">
        <table className="w-full min-w-[720px] text-xs">
          <thead className="sticky top-0 bg-panel">
            <tr className="text-left text-[10px] uppercase tracking-wider text-gray-500">
              {COLS.map((c) => (
                <th key={c.key} className="cursor-pointer whitespace-nowrap py-2 pr-3 hover:text-cyan" onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? -s.dir : -1 }))}>
                  {c.label}{sort.key === c.key && <ArrowDownUp size={10} className="ml-1 inline" />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="num">
            {rows.map((r) => (
              <tr key={r.id} onClick={() => onSelect(selected?.id === r.id ? null : r)}
                className={`cursor-pointer border-t border-edge transition ${selected?.id === r.id ? 'bg-cyan/10 text-cyan' : 'text-gray-300 hover:bg-white/5'}`}>
                {COLS.map((c) => <td key={c.key} className="whitespace-nowrap py-1.5 pr-3">{c.render(r)}</td>)}
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={COLS.length} className="py-6 text-center font-sans text-gray-600">Nessuna corsa nel periodo</td></tr>}
          </tbody>
        </table>
      </div>
      {selected && (
        <div className="mt-3 whitespace-pre-wrap rounded-md border border-cyan/30 bg-void/60 p-3 text-xs leading-relaxed text-gray-300">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-cyan"><Timer size={11} />Critica sessione (euristica) · usa l’AI Coach per l’analisi completa</div>
          {sessionCritique(a, selected)}
        </div>
      )}
    </Card>
  );
}

export function RunningTab({ a }) {
  const [selected, setSelected] = useState(null);
  const run = selected && a.runs.find((r) => r.id === selected.id);
  const coach = useMemo(() => (an, persona) => runningCoachText(an, persona, run), [run]);
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <PmcCard a={a} />
      <AIBox title={run ? `AI Running Coach · ${run.name}` : 'AI Running Coach'} task="runningCoach" heuristic={coach} extra={run ? { run } : undefined} />
      <EfficiencyCard a={a} />
      <ZonesCard a={a} />
      <RaceCard a={a} />
      <RunsTable a={a} selected={run} onSelect={setSelected} />
    </div>
  );
}
