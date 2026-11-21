import { Activity, BatteryCharging, BrainCircuit, HeartPulse, Moon, ShieldPlus } from 'lucide-react';
import { C, RingGauge, TimeChart } from '../components/charts/Charts';
import { AIBox, Card, Kpi, Legend, TONE } from '../components/ui';
import { bioAuditText, sleepCoachText } from '../lib/insights';
import { SymptomRadar } from './SymptomRadar';
import { fmt, fmtH, fmtHours, isNum, signed } from '../lib/util';

const STRESS_COLOR = (v) => (v <= 25 ? '#3B82F6' : v <= 50 ? '#F59E0B99' : v <= 75 ? C.amber : C.crimson);
const toneFor = (v, good = 65, warn = 45) => (!isNum(v) ? 'neutral' : v >= good ? 'good' : v >= warn ? 'warn' : 'bad');

function ReadinessCard({ a }) {
  const r = a.readiness;
  const rings = [
    { label: 'HRV + FC riposo', value: r.autonomic, color: C.cyan },
    { label: 'Sonno', value: r.sleep, color: C.violet },
    { label: 'Stress (inverso)', value: r.stress, color: C.amber },
    { label: 'Body Battery', value: r.bb, color: C.emerald },
  ];
  const deltaTone = !isNum(r.delta) ? 'neutral' : r.delta >= 0 ? 'good' : r.delta > -10 ? 'warn' : 'bad';
  return (
    <Card title="Readiness & Longevity" subtitle={`Sintesi di HRV, sonno, stress e Body Battery vs baseline 30gg · ${a.latestDate}`} icon={ShieldPlus} insightKey="readiness">
      <div className="flex flex-col items-center gap-5 sm:flex-row lg:flex-col xl:flex-row">
        <RingGauge rings={rings} size={200} center={{ value: r.score, label: 'READINESS', sub: `${signed(r.delta)} vs μ30`, subColor: TONE[deltaTone].hex }} />
        <div className="w-full space-y-2">
          {rings.map((g) => (
            <div key={g.label} className="flex items-center justify-between gap-3 text-xs">
              <span className="flex items-center gap-2 text-gray-400"><span className="h-2 w-2 rounded-full" style={{ background: g.color }} />{g.label}</span>
              <span className="num text-gray-100">{fmt(g.value)}</span>
            </div>
          ))}
          <div className="mt-3 rounded-lg border border-edge bg-void/50 p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] uppercase tracking-[0.16em] text-gray-500">Longevity index</span>
              <span className={`num text-2xl font-bold ${TONE[toneFor(a.longevity.score, 70, 50)].text}`}>{fmt(a.longevity.score)}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
              {[['FC riposo', a.longevity.parts.rhr], ['HRV', a.longevity.parts.hrv], ['Sonno', a.longevity.parts.sleep], ['Passi', a.longevity.parts.steps], ['VO2max', a.longevity.parts.vo2max], ['Stress', a.longevity.parts.stress]].map(([l, v]) => (
                <div key={l} className="flex justify-between"><span className="text-gray-500">{l}</span><span className="num text-gray-300">{fmt(v)}</span></div>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-gray-600">Indice sintetico non clinico, medie 30 giorni.</p>
          </div>
        </div>
      </div>
      <div className="mt-4">
        <TimeChart rows={a.readiness.series} height={90} left={{ min: 0, max: 100 }}
          series={[{ key: 'score', label: 'Readiness', type: 'area', color: C.cyan }]}
          refLines={isNum(r.baselineMean) ? [{ y: r.baselineMean, color: C.slate, label: 'μ30' }] : []} />
      </div>
    </Card>
  );
}

function HrvCard({ a }) {
  const r = a.readiness;
  return (
    <Card title="HRV & RHR Matrix" subtitle="HRV notturno con banda di normalità (baseline 30gg ± 1 SD) e FC a riposo" icon={HeartPulse} insightKey="hrvRhr" className="lg:col-span-2">
      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Kpi label="HRV notte" value={fmt(a.latest.hrv)} unit="ms" tone={(r.hrvZ ?? 0) <= -1 ? 'bad' : (r.hrvZ ?? 0) >= 1 ? 'good' : undefined} sub={`z ${fmt(r.hrvZ, 2)}`} />
        <Kpi label="Baseline HRV" value={fmt(r.hrvBase.mean, 1)} unit="ms" sub={`± ${fmt(r.hrvBase.sd, 1)}`} />
        <Kpi label="FC riposo" value={fmt(a.latest.rhr)} unit="bpm" tone={(r.rhrDelta ?? 0) >= 3 ? 'bad' : undefined} sub={`${signed(r.rhrDelta, 1)} vs baseline`} />
        <Kpi label="Stato HRV" value={a.latest.hrvStatus ? a.latest.hrvStatus.toLowerCase() : '—'} tone={a.latest.hrvStatus === 'BALANCED' ? 'good' : a.latest.hrvStatus ? 'warn' : undefined} />
        <Kpi label="Trend 3gg" value={signed(a.hrvTrend.pct3d, 0)} unit="%" tone={a.hrvTrend.consecutiveBelow >= 3 ? 'bad' : undefined} />
      </div>
      <TimeChart rows={a.hrvRhr} height={250}
        left={{ label: 'HRV ms' }} right={{ label: 'FC bpm' }}
        bands={[{ lo: 'lo', hi: 'hi', color: C.cyan, opacity: 0.1 }]}
        series={[
          { key: 'hrv', label: 'HRV', color: C.cyan, dots: a.rangeDays <= 30, width: 2.5 },
          { key: 'base', label: 'Baseline HRV', color: C.cyan, dash: '3 4', width: 1 },
          { key: 'rhr', label: 'FC riposo', color: C.crimson, axis: 'right' },
          { key: 'rhrBase', label: 'Baseline FC', color: C.crimson, axis: 'right', dash: '3 4', width: 1 },
        ]}
        tooltipExtra={(row) => row.status && <div className="mt-1 text-[10px] text-gray-500">Stato Garmin: {row.status}</div>} />
      <Legend items={[{ label: 'HRV (ms)', color: C.cyan }, { label: 'Banda ±1 SD', color: `${C.cyan}33` }, { label: 'FC riposo (bpm)', color: C.crimson }]} />
    </Card>
  );
}

function SleepCard({ a }) {
  const s = a.sleep;
  const debtTone = s.debt7 >= 6 ? 'bad' : s.debt7 >= 3 ? 'warn' : 'good';
  return (
    <Card title="Sleep Architecture & Debt" subtitle={`Fasi del sonno e punteggio · bisogno ${fmtH(s.need)} a notte`} icon={Moon} insightKey="sleep" className="lg:col-span-2">
      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-6">
        <Kpi label="Debito 7gg" value={fmtH(s.debt7)} tone={debtTone} big sub={s.surplus7 ? `surplus ${fmtH(s.surplus7)}` : undefined} />
        <Kpi label="Stanotte" value={fmtHours(s.lastNight?.total)} sub={`score ${fmt(s.lastNight?.score)}`} />
        <Kpi label="Media 7gg" value={fmtH(s.avg7)} />
        <Kpi label="Efficienza" value={fmt(s.efficiency7, 1)} unit="%" tone={(s.efficiency7 ?? 100) < 87 ? 'warn' : undefined} />
        <Kpi label="Deep" value={fmt(s.deepPct7, 0)} unit="%" tone={(s.deepPct7 ?? 20) < 13 ? 'warn' : undefined} />
        <Kpi label="REM" value={fmt(s.remPct7, 0)} unit="%" />
      </div>
      <TimeChart rows={s.rows} height={240} left={{ label: 'ore', format: (v) => fmtH(v) }} right={{ min: 0, max: 100, label: 'score' }}
        series={[
          { key: 'deep', label: 'Profondo', type: 'stack', color: '#4F46E5', format: (v) => fmtH(v) },
          { key: 'rem', label: 'REM', type: 'stack', color: C.cyan, format: (v) => fmtH(v) },
          { key: 'light', label: 'Leggero', type: 'stack', color: '#1D4ED8', format: (v) => fmtH(v) },
          { key: 'awake', label: 'Veglia', type: 'stack', color: C.amber, format: (v) => fmtH(v) },
          { key: 'score', label: 'Score', axis: 'right', color: C.emerald, width: 1.5 },
        ]}
        refLines={[{ y: s.need, color: C.violet, label: `bisogno ${fmtH(s.need)}` }]}
        tooltipExtra={(row) => <div className="mt-1 text-[10px] text-gray-500">Totale {fmtH(row.total)} · efficienza {fmt(row.efficiency, 1)}%</div>} />
      <Legend items={[{ label: 'Profondo', color: '#4F46E5' }, { label: 'REM', color: C.cyan }, { label: 'Leggero', color: '#1D4ED8' }, { label: 'Veglia', color: C.amber }, { label: 'Score', color: C.emerald }]} />
      <div className="mt-4 grid grid-cols-2 gap-4 border-t border-edge pt-3 sm:grid-cols-4">
        <Kpi label="A letto (media 14gg)" value={s.bedtimeAvg ?? '—'} sub={isNum(s.bedtimeSdMin) ? `± ${s.bedtimeSdMin} min` : undefined} tone={(s.bedtimeSdMin ?? 0) > 45 ? 'warn' : undefined} />
        <Kpi label="Sveglia (media)" value={s.wakeAvg ?? '—'} sub={isNum(s.wakeSdMin) ? `± ${s.wakeSdMin} min` : undefined} tone={(s.wakeSdMin ?? 0) > 45 ? 'warn' : undefined} />
        <Kpi label="Sonno ↔ HRV" value={isNum(s.sleepHrvCorr) ? `r ${fmt(s.sleepHrvCorr, 2)}` : '—'} sub={isNum(s.hrvPerHour) && (s.sleepHrvCorr ?? 0) >= 0.3 ? `+${fmt(s.hrvPerHour, 1)} ms HRV / ora` : 'legame debole'} />
        <Kpi label="Notti < 6 h (14gg)" value={s.shortNights14} tone={s.shortNights14 >= 3 ? 'warn' : undefined} />
      </div>
    </Card>
  );
}

function AnsCard({ a }) {
  const intr = a.ans.intraday;
  const toneColor = { good: C.emerald, warn: C.amber, bad: C.crimson };
  return (
    <Card title="Autonomic Nervous System" subtitle="Stress fisiologico vs Body Battery · oggi a intervalli di 15’" icon={BrainCircuit} insightKey="ans" className="lg:col-span-2">
      {intr ? (
        <>
          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Kpi label="Body Battery ora" value={fmt(intr.current?.bb)} unit="/100" tone={toneFor(intr.current?.bb, 50, 25)} />
            <Kpi label="Ricarica notte" value={signed(intr.bbGain)} tone={isNum(intr.bbGain) ? (intr.bbGain >= 40 ? 'good' : intr.bbGain >= 25 ? 'warn' : 'bad') : undefined} />
            <Kpi label="Stress notte" value={fmt(intr.nightStress)} tone={(intr.nightStress ?? 0) > 22 ? 'warn' : 'good'} />
            <Kpi label="Stress veglia" value={fmt(intr.dayMean)} tone={toneFor(100 - (intr.dayMean ?? 0), 65, 50)} />
          </div>
          <TimeChart rows={intr.rows} xKey="label" xFormat={(v) => v} height={230} left={{ min: 0, max: 100 }}
            series={[
              { key: 'stress', label: 'Stress', type: 'bar', color: C.amber },
              { key: 'bb', label: 'Body Battery', type: 'area', color: C.emerald, width: 2.5 },
            ]}
            barColor={(row) => STRESS_COLOR(row.stress)}
            windows={intr.windows.map((w) => ({ ...w, color: toneColor[w.tone] }))} />
          <div className="mt-3 flex flex-wrap gap-2">
            {intr.windows.map((w, i) => (
              <span key={i} className="rounded border px-2 py-0.5 text-[11px]" style={{ borderColor: `${toneColor[w.tone]}66`, color: toneColor[w.tone] }}>
                {intr.rows[w.from].label}–{intr.rows[w.to].label} · {w.label}
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="py-10 text-center text-sm text-gray-600">Nessun dato intraday per oggi.</p>
      )}
    </Card>
  );
}

function DailyAnsCard({ a }) {
  return (
    <Card title="Ricarica vs Consumo" subtitle="Body Battery caricata / consumata e stress medio giornaliero" icon={BatteryCharging} info="dailyAns" className="lg:col-span-3">
      <TimeChart rows={a.ans.daily} height={230} left={{ label: 'BB' }} right={{ min: 0, max: 100, label: 'stress' }}
        series={[
          { key: 'bbCharged', label: 'BB caricata', type: 'bar', color: C.emerald, opacity: 0.7 },
          { key: 'bbDrained', label: 'BB consumata', type: 'bar', color: C.crimson, opacity: 0.55 },
          { key: 'stress', label: 'Stress medio', axis: 'right', color: C.amber },
        ]} />
      <Legend items={[{ label: 'Caricata', color: C.emerald }, { label: 'Consumata', color: C.crimson }, { label: 'Stress', color: C.amber }]} />
    </Card>
  );
}

export function HealthTab({ a, sensitivity, onSensitivity, history }) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <ReadinessCard a={a} />
      <HrvCard a={a} />
      <SleepCard a={a} />
      <AIBox title="AI Sleep Coach" icon={Moon} task="sleep" heuristic={sleepCoachText} info="sleepCoach" />
      <AnsCard a={a} />
      <AIBox title="AI Recupero" icon={Activity} task="bioAudit" heuristic={bioAuditText} />
      <DailyAnsCard a={a} />
      <SymptomRadar a={a} sensitivity={sensitivity} onSensitivity={onSensitivity} history={history} />
    </div>
  );
}
