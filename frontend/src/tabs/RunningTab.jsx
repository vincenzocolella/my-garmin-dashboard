import { useMemo, useState } from 'react';
import { Activity, ArrowDownUp, HeartPulse, BarChart3, Flag, Gauge, Layers, LineChart, ListOrdered, X } from 'lucide-react';
import { C, ScatterChart, SplitBar, TimeChart } from '../components/charts/Charts';
import { AIBox, Card, Kpi, Legend, TONE } from '../components/ui';
import { tsbZone } from '../lib/analytics';
import { hrZones, overtrainingRisk, runningCoachText } from '../lib/insights';
import { CLASS_LABEL, hrPaceTrend, runDetail, runsOverview } from '../lib/runs';
import { ZONE_NAMES } from '../lib/zones';
import { fmt, fmtDay, fmtDuration, fmtPace, isNum, signed } from '../lib/util';

const ZONE_COLORS = { transition: C.blue, fresh: C.cyan, neutral: C.slate, optimal: C.emerald, risk: C.crimson };
const TSB_ZONES = [
  { from: 20, to: 100, color: ZONE_COLORS.transition, label: 'Transizione' },
  { from: 5, to: 20, color: ZONE_COLORS.fresh, label: 'Freschezza' },
  { from: -10, to: 5, color: ZONE_COLORS.neutral, label: 'Zona grigia' },
  { from: -30, to: -10, color: ZONE_COLORS.optimal, label: 'Ottimale' },
  { from: -200, to: -30, color: ZONE_COLORS.risk, label: 'Alto rischio' },
];

/** Horizontal TSB scale with a marker: readable at any width. */
function FormScale({ tsb }) {
  const lo = -45;
  const hi = 35;
  const pos = (v) => ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * 100;
  const segs = [...TSB_ZONES].reverse().map((z) => ({ ...z, a: pos(Math.max(lo, z.from)), b: pos(Math.min(hi, z.to)) }));
  return (
    <div className="mt-4">
      <div className="mb-1 flex items-baseline justify-between text-[10px] uppercase tracking-[0.16em] text-gray-500">
        <span>Forma oggi</span>
        <span className="num text-sm normal-case tracking-normal" style={{ color: ZONE_COLORS[tsbZone(tsb)?.key] }}>{signed(tsb, 1)} · {tsbZone(tsb)?.label}</span>
      </div>
      <div className="relative h-3 w-full overflow-hidden rounded-full">
        {segs.map((z) => <div key={z.label} className="absolute inset-y-0" style={{ left: `${z.a}%`, width: `${z.b - z.a}%`, background: z.color, opacity: 0.55 }} />)}
      </div>
      {isNum(tsb) && (
        <div className="relative h-4">
          <div className="absolute -translate-x-1/2 text-xs leading-none text-white" style={{ left: `${pos(tsb)}%` }}>▲</div>
        </div>
      )}
      <div className="relative h-3 text-[9px] text-gray-500 num">
        {[-30, -10, 5, 20].map((t) => <span key={t} className="absolute -translate-x-1/2" style={{ left: `${pos(t)}%` }}>{t > 0 ? `+${t}` : t}</span>)}
      </div>
    </div>
  );
}

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
      <FormScale tsb={p.tsb} />
      <div className="mt-4 text-[10px] uppercase tracking-[0.16em] text-gray-500">Forma (TSB) giorno per giorno</div>
      <TimeChart rows={a.pmc.rows} height={150} left={{ label: 'TSB' }}
        zones={TSB_ZONES}
        refLines={[{ y: 0, color: C.slate }]}
        series={[{ key: 'tsb', label: 'Forma (TSB)', type: 'bar', color: C.emerald, format: (v) => signed(v, 1) }]}
        barColor={(row) => ZONE_COLORS[tsbZone(row.tsb)?.key] ?? C.slate}
        tooltipExtra={(row) => <div className="text-[10px] text-gray-500">{tsbZone(row.tsb)?.label}</div>} />
      <Legend items={TSB_ZONES.map((z) => ({ label: z.label, color: z.color }))} />
      <div className="mt-4 text-[10px] uppercase tracking-[0.16em] text-gray-500">ACWR (carico acuto / cronico)</div>
      <TimeChart rows={a.pmc.rows} height={120} left={{ min: 0, max: 2.2, format: (v) => fmt(v, 1) }}
        zones={[{ from: 0.8, to: 1.3, color: C.emerald, label: 'sicuro' }, { from: 1.5, to: 2.2, color: C.crimson, label: 'rischio' }]}
        refLines={[{ y: 1.3, color: C.amber }, { y: 1.5, color: C.crimson }]}
        series={[{ key: 'acwr', label: 'ACWR', color: C.amber, width: 2, format: (v) => fmt(v, 2) }]} />
      <Legend items={[{ label: 'CTL fitness', color: C.cyan }, { label: 'ATL fatica', color: C.crimson }, { label: 'Carico', color: C.slate }, { label: 'ACWR 0,8–1,3 sicuro', color: C.emerald }, { label: '> 1,5 rischio', color: C.crimson }]} />
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
    <Card title="Ultime corse" subtitle="Clicca una corsa per l’analisi dettagliata · intestazioni ordinabili" icon={ListOrdered} insightKey="runs" className="lg:col-span-2">
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
    </Card>
  );
}

const ZONE_HEX = ['#6B8EFF', '#00C4A7', '#D4A017', '#FF4B00', '#E23B3B'];
const paceAxis = { invert: true, format: (v) => fmtPace(v), label: 'passo /km' };

function Notes({ notes }) {
  return (
    <ul className="space-y-1.5">
      {notes.map((n, i) => (
        <li key={i} className={`rounded-md border-l-2 ${TONE[n.tone]?.border ?? 'border-edge'} bg-void/60 px-3 py-1.5 text-xs leading-relaxed text-gray-300`}>{n.text}</li>
      ))}
    </ul>
  );
}

function RunDetail({ a, run, onClose }) {
  const d = useMemo(() => runDetail(a, run), [a, run]);
  const cfg = a.hrZoneCfg;
  const ctx = d.context;
  return (
    <Card title={`Analisi corsa · ${run.name}`} subtitle={`${fmtDay(run.date)} ${String(run.start ?? '').slice(11, 16)} · ${CLASS_LABEL[d.cls]}${d.session ? ` · sessione del piano: ${d.session.title} (sett. ${d.session.week})` : ''}`}
      icon={Activity} info="runDetail" className="lg:col-span-3"
      actions={<button type="button" onClick={onClose} className="rounded-md border border-edge p-1 text-gray-500 hover:text-white" aria-label="Chiudi analisi"><X size={13} /></button>}>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
        <Kpi label="Distanza" value={fmt(run.distance / 1000, 2)} unit="km" />
        <Kpi label="Tempo" value={fmtDuration(run.duration)} />
        <Kpi label="Passo medio" value={fmtPace(run.pace)} unit="/km" />
        <Kpi label="FC media / max" value={`${fmt(run.avgHr)}/${fmt(run.maxHr)}`} unit="bpm" sub={isNum(run.avgHr) ? `Z${Math.max(1, cfg.floors.filter((f) => run.avgHr >= f).length)} ${ZONE_NAMES[Math.max(0, cfg.floors.filter((f) => run.avgHr >= f).length - 1)]}` : undefined} />
        <Kpi label="Costo cardiaco" value={fmt(d.cardiacCost)} unit="batt/km" />
        <Kpi label="Cadenza" value={fmt(run.cadence)} unit="spm" sub={d.strideM ? `falcata ${fmt(d.strideM, 2)} m` : undefined} />
        <Kpi label="Training Effect" value={`${fmt(run.aerobicTE, 1)} / ${fmt(run.anaerobicTE, 1)}`} sub="aerobico / anaerobico" />
        <Kpi label="Carico" value={fmt(run.trimp ?? run.pmcLoad)} sub={`dislivello ${fmt(run.elevation)} m · ${fmt(run.calories)} kcal`} />
      </div>

      {d.lapRows.length > 1 ? (
        <div className="mt-5 grid gap-5 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-gray-500">Passo e FC per km</div>
            <TimeChart rows={d.lapRows} xKey="label" xFormat={(v) => `${v}`} height={230} left={paceAxis} right={{ label: 'FC bpm' }}
              zones={cfg.floors.map((f, i) => ({ axis: 'right', from: f, to: i < 4 ? cfg.floors[i + 1] : cfg.maxHr, color: ZONE_HEX[i] }))}
              refLines={isNum(run.pace) ? [{ y: run.pace, color: C.slate, label: 'media' }] : []}
              series={[
                { key: 'pace', label: 'Passo', color: C.cyan, width: 2.5, dots: true, format: (v) => `${fmtPace(v)}/km` },
                { key: 'hr', label: 'FC', axis: 'right', color: C.crimson, width: 1.5, format: (v) => `${fmt(v)} bpm` },
              ]}
              tooltipExtra={(r) => <div className="mt-1 text-[10px] text-gray-500">km {r.i} · Z{r.zone ?? '—'} · {r.delta > 0 ? '+' : ''}{r.delta} s vs media</div>} />
            <Legend items={[{ label: 'Passo (più in alto = più veloce)', color: C.cyan }, { label: 'FC', color: C.crimson }, { label: 'Sfondo = tue zone FC', color: '#334155' }]} />
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Kpi label="1ª metà" value={fmtPace(d.half?.first.pace)} unit="/km" sub={isNum(d.half?.first.hr) ? `FC ${fmt(d.half.first.hr)}` : undefined} />
              <Kpi label="2ª metà" value={fmtPace(d.half?.second.pace)} unit="/km" sub={isNum(d.half?.second.hr) ? `FC ${fmt(d.half.second.hr)}` : undefined}
                tone={d.blocks ? undefined : d.half?.kind === 'negative' ? 'good' : d.half?.kind === 'positive' ? 'warn' : undefined} />
              <Kpi label="Variabilità ritmo" value={fmt(d.cv, 1)} unit="%" tone={isNum(d.cv) && !run.hard ? (d.cv <= 5 ? 'good' : 'warn') : undefined} />
              <Kpi label="Deriva cardiaca" value={fmt(run.decoupling, 1)} unit="%" tone={isNum(run.decoupling) ? (run.decoupling <= 5 ? 'good' : 'warn') : undefined} />
              <Kpi label="Km più veloce" value={fmtPace(d.fastest?.pace)} sub={d.fastest ? `km ${d.fastest.i}` : undefined} />
              <Kpi label="Km più lento" value={fmtPace(d.slowest?.pace)} sub={d.slowest ? `km ${d.slowest.i}` : undefined} />
              <Kpi label="Efficienza (EF)" value={fmt(run.ef, 2)} sub={d.comparison?.efPercentile != null ? `meglio del ${d.comparison.efPercentile}% delle simili` : undefined} />
              <Kpi label="Potenza" value={fmt(run.avgPower)} unit="W" />
            </div>
          </div>
          <div className="lg:col-span-2">
            <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-gray-500">Parziali</div>
            <div className="scrollbar-thin max-h-80 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-panel text-left text-[10px] uppercase text-gray-500"><tr><th className="py-1">Km</th><th>Tempo</th><th>Passo</th><th>Δ media</th><th>FC</th><th>Zona</th></tr></thead>
                <tbody className="num">
                  {d.lapRows.map((r) => (
                    <tr key={r.i} className={`border-t border-edge ${d.fastest?.i === r.i ? 'text-emerald' : d.slowest?.i === r.i ? 'text-amber' : 'text-gray-300'}`}>
                      <td className="py-1">{r.dist >= 950 ? r.i : `${r.i} (${r.dist} m)`}</td>
                      <td>{fmtDuration(r.time)}</td>
                      <td className="font-semibold">{fmtPace(r.pace)}</td>
                      <td>{r.delta > 0 ? `+${r.delta}` : r.delta} s</td>
                      <td>{fmt(r.hr)}</td>
                      <td>{r.zone ? <span className="rounded px-1 text-[10px] font-bold" style={{ color: ZONE_HEX[r.zone - 1], background: `${ZONE_HEX[r.zone - 1]}22` }}>Z{r.zone}</span> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-xs text-gray-500">Parziali non disponibili per questa corsa (servono i lap automatici da 1 km).</p>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-gray-500">Tempo in zona</div>
          {d.zonePct ? (
            <div className="space-y-1.5">
              {d.zonePct.map((pc, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <span className="w-24 text-gray-400"><b style={{ color: ZONE_HEX[i] }}>Z{i + 1}</b> {ZONE_NAMES[i]}</span>
                  <div className="h-1.5 flex-1 rounded-full bg-edge"><div className="h-1.5 rounded-full" style={{ width: `${pc}%`, background: ZONE_HEX[i] }} /></div>
                  <span className="num w-20 text-right text-gray-300">{pc}% · {fmtDuration(run.zones[i])}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-gray-500">Non disponibile.</p>}
        </div>
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-gray-500">Il tuo corpo · prima e dopo</div>
          {ctx ? (
            <div className="grid grid-cols-2 gap-3">
              <Kpi label="Readiness quel giorno" value={fmt(ctx.readiness)} tone={isNum(ctx.readiness) ? (ctx.readiness >= 80 ? 'good' : ctx.readiness >= 65 ? 'warn' : 'bad') : undefined} />
              <Kpi label="Sonno notte prima" value={fmt(ctx.sleepH, 1)} unit="h" sub={isNum(ctx.sleepScore) ? `score ${ctx.sleepScore}` : undefined} tone={isNum(ctx.sleepH) && ctx.sleepH < 6.5 ? 'warn' : undefined} />
              <Kpi label="HRV mattina" value={signed(ctx.hrvPct)} unit="% vs base" tone={(ctx.hrvPct ?? 0) <= -12 ? 'bad' : undefined} />
              <Kpi label="Forma (TSB) prima" value={signed(ctx.tsbBefore, 1)} />
              <Kpi label="HRV giorno dopo" value={signed(ctx.nextHrvPct)} unit="% vs base" tone={isNum(ctx.nextHrvPct) ? (ctx.nextHrvPct <= -12 ? 'bad' : 'good') : undefined} />
              <Kpi label="FC riposo giorno dopo" value={signed(ctx.nextRhrDelta, 1)} unit="bpm" tone={(ctx.nextRhrDelta ?? 0) >= 3 ? 'warn' : undefined} />
            </div>
          ) : <p className="text-xs text-gray-500">Dati giornalieri non disponibili.</p>}
        </div>
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-gray-500">Rispetto alle uscite simili ({d.comparison?.n ?? 0}, 90 gg)</div>
          {d.comparison ? (
            <table className="w-full text-xs">
              <thead><tr className="text-left text-[10px] uppercase text-gray-500"><th /><th>Questa</th><th>Media simili</th></tr></thead>
              <tbody className="num text-gray-300">
                <tr className="border-t border-edge"><td className="py-1 font-sans text-gray-500">Distanza</td><td>{fmt(run.distance / 1000, 1)} km</td><td>{fmt(d.comparison.km, 1)} km</td></tr>
                <tr className="border-t border-edge"><td className="py-1 font-sans text-gray-500">Passo</td><td>{fmtPace(run.pace)}</td><td>{fmtPace(d.comparison.pace)}</td></tr>
                <tr className="border-t border-edge"><td className="py-1 font-sans text-gray-500">FC media</td><td>{fmt(run.avgHr)}</td><td>{fmt(d.comparison.hr)}</td></tr>
                <tr className="border-t border-edge"><td className="py-1 font-sans text-gray-500">Deriva</td><td>{isNum(run.decoupling) ? `${fmt(run.decoupling, 1)}%` : '—'}</td><td>{isNum(d.comparison.decoupling) ? `${fmt(d.comparison.decoupling, 1)}%` : '—'}</td></tr>
              </tbody>
            </table>
          ) : <p className="text-xs text-gray-500">Nessuna uscita simile negli ultimi 90 giorni.</p>}
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-gray-500">Valutazione</div>
        <Notes notes={d.notes} />
      </div>
    </Card>
  );
}

function RunsOverview({ a }) {
  const o = useMemo(() => runsOverview(a), [a]);
  const t = o.totals;
  const dl = o.deltas;
  const sub = (v, unit = '%') => (isNum(v) ? `${v > 0 ? '+' : ''}${v}${unit} vs periodo prec.` : 'nessun periodo prec.');
  return (
    <Card title={`Analisi complessiva corse · ultimi ${a.rangeDays} giorni`} subtitle="Totali, andamento settimanale, tipi di uscita, record e tendenze" icon={BarChart3} info="runsOverview" className="lg:col-span-3">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
        <Kpi label="Corse" value={t.count} sub={`${fmt(t.perWeek, 1)}/settimana`} />
        <Kpi label="Km totali" value={fmt(t.km, 1)} sub={sub(dl.km)} tone={isNum(dl.km) && dl.km > 30 ? 'warn' : undefined} />
        <Kpi label="Km/settimana" value={fmt(t.kmPerWeek, 1)} />
        <Kpi label="Tempo" value={fmtDuration(t.time)} />
        <Kpi label="Passo medio" value={fmtPace(t.pace)} unit="/km" sub={isNum(dl.pace) ? `${dl.pace > 0 ? '+' : ''}${dl.pace} s vs prec.` : undefined} />
        <Kpi label="FC media" value={fmt(t.hr)} unit="bpm" sub={isNum(dl.hr) ? `${dl.hr > 0 ? '+' : ''}${dl.hr} vs prec.` : undefined} />
        <Kpi label="Più lunga" value={fmt(t.longest, 1)} unit="km" sub={isNum(dl.longest) ? `${dl.longest > 0 ? '+' : ''}${fmt(dl.longest, 1)} km vs prec.` : undefined} />
        <Kpi label="Dislivello" value={fmt(t.elevation)} unit="m" sub={`cadenza media ${fmt(t.cadence)}`} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-gray-500">Volume settimanale</div>
          <TimeChart rows={o.weekly} height={200} xFormat={(d) => fmtDay(d)} left={{ label: 'km' }} right={paceAxis}
            series={[
              { key: 'km', label: 'Km', type: 'bar', color: C.cyan, format: (v) => `${fmt(v, 1)} km` },
              { key: 'longest', label: 'Uscita più lunga', type: 'bar', color: C.violet, format: (v) => `${fmt(v, 1)} km` },
              { key: 'pace', label: 'Passo medio', axis: 'right', color: C.amber, dots: true, format: (v) => `${fmtPace(v)}/km` },
            ]}
            tooltipExtra={(r) => <div className="mt-1 text-[10px] text-gray-500">{r.runs} {r.runs === 1 ? 'corsa' : 'corse'}</div>} />
          <Legend items={[{ label: 'Km della settimana', color: C.cyan }, { label: 'Uscita più lunga', color: C.violet }, { label: 'Passo medio (in alto = più veloce)', color: C.amber }]} />
        </div>
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-gray-500">Per tipo di uscita</div>
          <SplitBar parts={o.byClass.map((c, i) => ({ label: c.label, value: c.km ?? 0, color: [C.cyan, C.violet, C.crimson][i] }))} />
          <table className="mt-2 w-full text-xs">
            <thead><tr className="text-left text-[10px] uppercase text-gray-500"><th className="py-1">Tipo</th><th>N</th><th>Km</th><th>Passo</th><th>FC</th></tr></thead>
            <tbody className="num text-gray-300">
              {o.byClass.map((c, i) => (
                <tr key={c.key} className="border-t border-edge">
                  <td className="py-1 font-sans" style={{ color: [C.cyan, C.violet, C.crimson][i] }}>{c.label}</td>
                  <td>{c.count}</td><td>{fmt(c.km, 1)}</td><td>{fmtPace(c.pace)}</td><td>{fmt(c.hr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 mb-2 text-[10px] uppercase tracking-[0.16em] text-gray-500">Record (ultimi 6 mesi, dai lap)</div>
          <div className="grid grid-cols-2 gap-3">
            <Kpi label="Km più veloce" value={fmtPace(o.bests.km1?.pace)} sub={o.bests.km1 ? fmtDay(o.bests.km1.date) : undefined} />
            <Kpi label="Miglior 5 km" value={fmtDuration(o.bests.k5?.time)} sub={o.bests.k5 ? fmtDay(o.bests.k5.date) : undefined} />
            <Kpi label="Miglior 10 km" value={fmtDuration(o.bests.k10?.time)} sub={o.bests.k10 ? fmtDay(o.bests.k10.date) : undefined} />
            <Kpi label="Più lunga" value={fmt(o.bests.longest?.km, 1)} unit="km" sub={o.bests.longest ? fmtDay(o.bests.longest.date) : undefined} />
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-gray-500">Tendenze uscite facili (ogni 30 gg)</div>
          <div className="grid grid-cols-3 gap-3">
            <Kpi label="FC" value={signed(o.trends.easyHr, 1)} unit="bpm" tone={isNum(o.trends.easyHr) ? (o.trends.easyHr <= -1 ? 'good' : o.trends.easyHr >= 2 ? 'warn' : undefined) : undefined} />
            <Kpi label="Passo" value={signed(o.trends.easyPace, 0)} unit="s/km" />
            <Kpi label="Cadenza" value={signed(o.trends.cadence, 1)} unit="spm" />
          </div>
        </div>
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-gray-500">Costanza</div>
          <div className="grid grid-cols-3 gap-3">
            <Kpi label="Settimane attive" value={`${o.consistency.weeksWithRuns}/${o.consistency.weeks}`} />
            <Kpi label="Pausa più lunga" value={o.consistency.longestGap} unit="gg" tone={o.consistency.longestGap >= 10 ? 'warn' : undefined} />
            <Kpi label="Ultima corsa" value={o.consistency.daysSinceLast ?? '—'} unit="gg fa" />
          </div>
        </div>
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-gray-500">Valutazione</div>
          <Notes notes={o.notes} />
        </div>
      </div>
    </Card>
  );
}

function HrPaceCard({ a }) {
  const t = useMemo(() => hrPaceTrend(a), [a]);
  if (!t) {
    return (
      <Card title="Cuore vs ritmo" subtitle="Stai migliorando? Battiti a parità di ritmo nel tempo" icon={HeartPulse} info="hrPace" className="lg:col-span-3">
        <p className="py-6 text-center text-sm text-gray-500">Servono almeno 8 km di corsa con FC e lap per costruire il grafico.</p>
      </Card>
    );
  }
  const ch = t.change;
  const [es, ee] = (t.scatter.earlySpan ?? '|').split('|');
  const [ls, le] = (t.scatter.lateSpan ?? '|').split('|');
  const scatter = [
    ...t.scatter.early.map((p) => ({ x: p.pace, y: p.hr, color: C.slate, r: 3.5, period: 'early', date: p.date })),
    ...t.scatter.late.map((p) => ({ x: p.pace, y: p.hr, color: C.cyan, r: 3.5, period: 'late', date: p.date })),
  ];
  return (
    <Card title="Cuore vs ritmo · stai migliorando?" subtitle={`Ogni km di ogni corsa normalizzato a ritmo e FC di riferimento · ${t.points} km analizzati negli ultimi 6 mesi`} icon={HeartPulse} info="hrPace" className="lg:col-span-3">
      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi label={`FC a ${fmtPace(t.refPace)}/km · ora`} value={fmt(t.series.at(-1)?.hrAtPace, 0)} unit="bpm" big />
        <Kpi label="vs 2 mesi fa" value={ch ? signed(ch.hr, 1) : '—'} unit="bpm" tone={ch ? (ch.hr <= -2 ? 'good' : ch.hr >= 2 ? 'bad' : undefined) : undefined} sub="meno = cuore più efficiente" />
        <Kpi label={`Passo a ${t.refHr} bpm · ora`} value={fmtPace(t.series.at(-1)?.paceAtHr)} unit="/km" big />
        <Kpi label="vs 2 mesi fa" value={ch ? `${ch.pace > 0 ? '+' : ''}${ch.pace}` : '—'} unit="s/km" tone={ch ? (ch.pace <= -5 ? 'good' : ch.pace >= 5 ? 'bad' : undefined) : undefined} sub="negativo = più veloce" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-gray-500">Battiti a ritmo costante ({fmtPace(t.refPace)}/km) · più in basso = meglio</div>
          <TimeChart rows={t.series} height={190} left={{ label: 'bpm' }}
            series={[
              { key: 'hrAtPace', label: `FC a ${fmtPace(t.refPace)}/km`, color: C.crimson, width: 2.5, dots: true, format: (v) => `${fmt(v, 1)} bpm` },
              { key: 'hrAtPaceTrend', label: 'Tendenza', color: '#F9FAFB', dash: '5 4', width: 1.5, format: (v) => `${fmt(v, 1)} bpm` },
            ]}
            tooltipExtra={(r) => <div className="mt-1 text-[10px] text-gray-500">media mobile 4 settimane · {r.n} km</div>} />
        </div>
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-gray-500">Ritmo a battiti costanti ({t.refHr} bpm, limite Z2) · più in alto = meglio</div>
          <TimeChart rows={t.series} height={190} left={paceAxis}
            series={[
              { key: 'paceAtHr', label: `Passo a ${t.refHr} bpm`, color: C.emerald, width: 2.5, dots: true, format: (v) => `${fmtPace(v)}/km` },
              { key: 'paceAtHrTrend', label: 'Tendenza', color: '#F9FAFB', dash: '5 4', width: 1.5, format: (v) => `${fmtPace(v)}/km` },
            ]} />
        </div>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-gray-500">Curva FC-ritmo: ogni punto è un km · se la nuvola recente scende o va a sinistra, migliori</div>
          <ScatterChart points={scatter} height={240} yLabel="FC" xFormat={(v) => fmtPace(v)} yFormat={(v) => fmt(v)}
            trends={[{ filter: (p) => p.period === 'early', color: C.slate }, { filter: (p) => p.period === 'late', color: C.cyan }]}
            tooltip={(p) => <div className="num text-gray-300">{fmtDay(p.date)} · {fmtPace(p.x)}/km · {fmt(p.y)} bpm</div>} />
          <Legend items={[{ label: `Periodo iniziale ${es ? `(${fmtDay(es)}–${fmtDay(ee)})` : ''}`, color: C.slate }, { label: `Periodo recente ${ls ? `(${fmtDay(ls)}–${fmtDay(le)})` : ''}`, color: C.cyan }, { label: 'Linee = relazione media FC/ritmo del periodo', color: '#F9FAFB' }]} />
        </div>
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-gray-500">Valutazione</div>
          <Notes notes={t.notes} />
          <p className="mt-3 text-[10px] leading-relaxed text-gray-600">Caldo, dislivello, disidratazione e malesseri alzano la FC: un singolo punto alto non è un passo indietro, conta la tendenza.</p>
        </div>
      </div>
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
      <HrPaceCard a={a} />
      <EfficiencyCard a={a} />
      <ZonesCard a={a} />
      <RaceCard a={a} />
      <RunsTable a={a} selected={run} onSelect={setSelected} />
      {run && <RunDetail a={a} run={run} onClose={() => setSelected(null)} />}
      <RunsOverview a={a} />
    </div>
  );
}
