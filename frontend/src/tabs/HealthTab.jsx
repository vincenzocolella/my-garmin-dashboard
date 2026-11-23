import { useEffect, useMemo, useState } from 'react';
import { BatteryCharging, BrainCircuit, Cpu, HeartPulse, Hourglass, Loader2, Moon, RotateCcw, ShieldPlus, Sparkles, Sun } from 'lucide-react';
import { C, RingGauge, TimeChart } from '../components/charts/Charts';
import { AIBox, Button, Card, Kpi, Legend, TONE, useAI } from '../components/ui';
import { sleepCoachText } from '../lib/insights';
import { dailySummary } from '../lib/summary';
import { SymptomRadar } from './SymptomRadar';
import { fmt, fmtDay, fmtH, fmtHours, fmtWeekday, isNum, signed } from '../lib/util';

const STRESS_COLOR = (v) => (v <= 25 ? '#3B82F6' : v <= 50 ? '#F59E0B99' : v <= 75 ? C.amber : C.crimson);
const toneFor = (v, good = 65, warn = 45) => (!isNum(v) ? 'neutral' : v >= good ? 'good' : v >= warn ? 'warn' : 'bad');
const scoreTone = (v) => toneFor(v, 65, 50);

// --------------------------------------------------------------------- Come stai
function SummaryCard({ a }) {
  const ai = useAI();
  const s = useMemo(() => dailySummary(a), [a]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setResult(null), [a.latestDate, ai.persona]);
  const t = TONE[s.tone] ?? TONE.neutral;
  const run = async () => {
    setLoading(true);
    setError('');
    try {
      setResult(await ai.generate('summary'));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  const actions = (
    <>
      {result && <Button onClick={() => setResult(null)} title="Torna al motore euristico"><Cpu size={12} />Euristica</Button>}
      <Button variant={ai.available ? 'primary' : 'ghost'} onClick={run} disabled={!ai.available || loading} title={ai.available ? 'Riscrivi il riepilogo con l’AI' : 'Configura un provider AI nelle impostazioni'}>
        {loading ? <Loader2 size={12} className="animate-spin" /> : result ? <RotateCcw size={12} /> : <Sparkles size={12} />}
        {loading ? 'Analisi…' : result ? 'Rigenera' : 'Racconta con AI'}
      </Button>
    </>
  );
  return (
    <Card title="Come stai" subtitle={`Ieri, stanotte${s.todayAvailable ? ', oggi finora' : ''} e ultimi 7 giorni · ${fmtWeekday(a.today)}`} icon={Sun} info="summary" actions={actions} className="lg:col-span-3">
      <div className={`mb-4 flex flex-col gap-2 rounded-lg border-l-2 ${t.border} bg-void/60 px-4 py-3 sm:flex-row sm:items-center sm:gap-4`}>
        <span className={`shrink-0 self-start rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider sm:self-center ${t.text}`} style={{ background: `${t.hex}1f` }}>{s.chip}</span>
        <p className="text-[15px] leading-snug text-gray-100">{s.headline}</p>
        {isNum(s.score) && <span className="num ml-auto hidden shrink-0 text-right text-[11px] text-gray-500 sm:block">readiness<br /><b className={`text-lg ${TONE[scoreTone(s.score)].text}`}>{s.score}</b></span>}
      </div>
      {error && <p className="mb-2 text-xs text-crimson">{error}</p>}
      {result ? (
        <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-gray-300">{result}</div>
      ) : (
        <>
          <div className={`grid gap-4 md:grid-cols-2 ${s.sections.length >= 4 ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
            {s.sections.map((sec) => (
              <div key={sec.key} className="min-w-0 rounded-lg border border-edge bg-void/40 p-3">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan">{sec.title}</div>
                {sec.facts.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {sec.facts.map((f) => (
                      <span key={f.label} className="rounded border border-edge px-1.5 py-0.5 text-[10px] text-gray-400">
                        {f.label} <b className={`num ${f.tone ? TONE[f.tone].text : 'text-gray-200'}`}>{f.value}</b>
                      </span>
                    ))}
                  </div>
                )}
                <div className="space-y-1.5 text-[13px] leading-relaxed text-gray-300">
                  {sec.text.map((x, i) => <p key={i}>{x}</p>)}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg border border-edge bg-void/40 p-3">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan">Per oggi</div>
            <ul className="space-y-1 text-[13px] leading-relaxed text-gray-300">
              {s.advice.map((x) => <li key={x}>• {x}</li>)}
            </ul>
          </div>
        </>
      )}
      <div className="mt-3 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-gray-600">
        {result ? <><Sparkles size={10} className="text-cyan" /> raccontato dall’AI · verifica sempre i consigli</> : <><Cpu size={10} /> motore euristico · confronti con la tua normalità degli ultimi 30 giorni</>}
      </div>
    </Card>
  );
}

// --------------------------------------------------------------------- readiness
function ReadinessCard({ a }) {
  const r = a.readiness;
  const hrv7Txt = !isNum(r.hrv7Z) ? '' : r.hrv7Z <= -1 ? 'HRV 7gg sotto norma' : r.hrv7Z >= 1 ? 'HRV 7gg sopra norma' : 'HRV 7gg nella norma';
  const rings = [
    { label: 'Sistema nervoso', value: r.autonomic, color: C.cyan, w: '40%', sub: [hrv7Txt, isNum(r.rhrDelta) ? `FC riposo ${signed(r.rhrDelta, 1)}` : ''].filter(Boolean).join(' · ') },
    { label: 'Sonno', value: r.sleep, color: C.violet, w: '30%', sub: a.sleep.lastNight ? `${fmtH(a.sleep.lastNight.hours)} · score ${fmt(a.sleep.lastNight.score)}` : '' },
    { label: 'Stress di ieri', value: r.stress, color: C.amber, w: '15%', sub: isNum(r.stressYesterday) ? `${fmt(r.stressYesterday)} vs solito ${fmt(r.stressBase)}` : '' },
    { label: 'Carico allenamento', value: r.load, color: C.emerald, w: '15%', sub: isNum(r.loadRatio) ? `fatica/forma ${fmt(r.loadRatio, 2)}` : 'nessun dato' },
  ];
  const deltaTone = !isNum(r.delta) ? 'neutral' : r.delta >= 0 ? 'good' : r.delta > -10 ? 'warn' : 'bad';
  return (
    <Card title="Readiness" subtitle={`Quanto sei recuperato stamattina rispetto alla tua normalità · ${fmtDay(a.latestDate)}`} icon={ShieldPlus} insightKey="readiness">
      <div className="flex flex-col items-center gap-4">
        <RingGauge rings={rings} size={190} center={{ value: r.score, label: 'READINESS', sub: r.band.label.replace('Sopra la tua norma', 'sopra la norma').replace('Nella tua norma', 'nella norma').toLowerCase(), subColor: TONE[r.band.tone].hex }} />
        <div className="w-full space-y-2">
          {rings.map((g) => (
            <div key={g.label} className="flex items-start justify-between gap-3 text-xs">
              <span className="flex min-w-0 items-start gap-2 text-gray-400">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: g.color }} />
                <span className="min-w-0">{g.label} <span className="text-[10px] text-gray-600">{g.w}</span>{g.sub && <span className="block truncate text-[10px] text-gray-600">{g.sub}</span>}</span>
              </span>
              <span className={`num ${TONE[scoreTone(g.value)]?.text ?? 'text-gray-100'}`}>{fmt(g.value)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-3 border-t border-edge pt-3">
        <Kpi label="vs media 30gg" value={signed(r.delta)} tone={deltaTone} />
        <Kpi label="Media periodo" value={fmt(r.periodMean)} tone={scoreTone(r.periodMean)} />
        <Kpi label="Giorni < 50" value={r.lowDays} tone={r.lowDays >= 3 ? 'warn' : undefined} />
        <Kpi label="Giorni ≥ 85" value={r.highDays} />
      </div>
      <div className="mt-3">
        <TimeChart rows={r.series} height={90} left={{ min: 0, max: 100 }}
          series={[{ key: 'score', label: 'Readiness', type: 'area', color: C.cyan }]}
          refLines={[{ y: 75, color: C.slate, label: 'tua norma' }]} />
      </div>
    </Card>
  );
}

// --------------------------------------------------------------------- longevity
function LongevityCard({ a }) {
  const L = a.longevity;
  const ageTxt = L.assumed.age ? 'età non impostata (uso 40)' : `${L.age} anni`;
  const sexTxt = L.assumed.sex ? 'sesso non impostato' : L.sex === 'F' ? 'donna' : 'uomo';
  return (
    <Card title="Longevity index" subtitle={`Abitudini e fitness confrontate con la popolazione · ${L.window} giorni`} icon={Hourglass} insightKey="longevity">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <div className={`num text-4xl font-bold ${TONE[toneFor(L.score, 70, 50)].text}`}>{fmt(L.score)}</div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-gray-500">su 100 · {ageTxt}, {sexTxt}</div>
        </div>
        <div className="text-right text-[10px] text-gray-500">copertura dati<br /><span className="num text-sm text-gray-300">{L.coverage}%</span></div>
      </div>
      <div className="space-y-2">
        {L.parts.map((p) => (
          <div key={p.key} title={p.why}>
            <div className="flex items-baseline justify-between gap-2 text-[11px]">
              <span className="truncate text-gray-400">{p.label} <span className="text-[10px] text-gray-600">{p.weight}%</span></span>
              <span className="num shrink-0 text-gray-300">{p.value ?? '—'}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-edge">
                {isNum(p.score) && <div className="h-1.5 rounded-full" style={{ width: `${Math.max(3, p.score)}%`, background: TONE[toneFor(p.score, 70, 40)].hex }} />}
              </div>
              <span className="num w-7 text-right text-[10px] text-gray-500">{fmt(p.score)}</span>
            </div>
          </div>
        ))}
      </div>
      {L.levers.length > 0 && (
        <p className="mt-3 rounded-md border-l-2 border-cyan bg-void/60 px-3 py-2 text-[11px] leading-relaxed text-gray-300">
          Dove guadagni di più: {L.levers.map((p) => `${p.label} (${p.value ?? '—'}, riferimento ${p.ref})`).join(' e ')}.
        </p>
      )}
      <p className="mt-2 text-[10px] text-gray-600">Indice non clinico basato su studi di popolazione. Passa il mouse su una voce per la fonte.{(L.assumed.age || L.assumed.sex) && ' Imposta età e sesso nelle impostazioni per norme precise.'}</p>
    </Card>
  );
}

// --------------------------------------------------------------------- HRV
function HrvCard({ a }) {
  const r = a.readiness;
  const p = a.hrvTrend.period;
  const z7 = r.hrv7Z;
  const state7 = !isNum(z7) ? '—' : z7 <= -1 ? 'sotto' : z7 >= 1 ? 'sopra' : 'nella norma';
  return (
    <Card title="HRV & FC a riposo" subtitle="HRV notturno, media mobile 7 giorni e la tua zona normale (baseline 60gg ± ½ DS) · FC a riposo" icon={HeartPulse} insightKey="hrvRhr" className="lg:col-span-2">
      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Kpi label="HRV stanotte" value={fmt(a.latest.hrv)} unit="ms" tone={(r.hrvZ ?? 0) <= -1 ? 'bad' : (r.hrvZ ?? 0) >= 1 ? 'good' : undefined} sub={isNum(r.hrvPct) ? `${signed(r.hrvPct)}% vs norma` : undefined} />
        <Kpi label="HRV media 7gg" value={fmt(r.hrv7ms)} unit="ms" tone={state7 === 'sotto' ? 'bad' : state7 === 'sopra' ? 'good' : undefined} sub={`${state7} · norma ${fmt(r.hrvBase.swcLo)}–${fmt(r.hrvBase.swcHi)}`} />
        <Kpi label="FC riposo" value={fmt(a.latest.rhr)} unit="bpm" tone={(r.rhrDelta ?? 0) >= 3 ? 'bad' : undefined} sub={`${signed(r.rhrDelta, 1)} vs baseline`} />
        <Kpi label="HRV nel periodo" value={fmt(p.hrv)} unit="ms" sub={isNum(p.hrvChangePct) ? `tendenza ${signed(p.hrvChangePct)}%` : undefined} tone={(p.hrvChangePct ?? 0) <= -8 ? 'warn' : (p.hrvChangePct ?? 0) >= 8 ? 'good' : undefined} />
        <Kpi label="FC nel periodo" value={fmt(p.rhr, 1)} unit="bpm" sub={isNum(p.rhrChange) ? `tendenza ${signed(p.rhrChange, 1)} bpm` : undefined} tone={(p.rhrChange ?? 0) >= 2 ? 'warn' : (p.rhrChange ?? 0) <= -2 ? 'good' : undefined} />
      </div>
      <TimeChart rows={a.hrvRhr} height={250}
        left={{ label: 'HRV ms' }} right={{ label: 'FC bpm' }}
        bands={[{ lo: 'lo', hi: 'hi', color: C.cyan, opacity: 0.12 }]}
        series={[
          { key: 'hrv', label: 'HRV notte', color: `${C.cyan}88`, dots: a.rangeDays <= 30, width: 1 },
          { key: 'hrv7', label: 'HRV media 7gg', color: C.cyan, width: 2.5 },
          { key: 'rhr', label: 'FC riposo', color: C.crimson, axis: 'right' },
          { key: 'rhrBase', label: 'Baseline FC', color: C.crimson, axis: 'right', dash: '3 4', width: 1 },
        ]}
        tooltipExtra={(row) => row.status && <div className="mt-1 text-[10px] text-gray-500">Stato Garmin: {row.status}</div>} />
      <Legend items={[{ label: 'HRV notte', color: `${C.cyan}88` }, { label: 'HRV media 7gg', color: C.cyan }, { label: 'Zona normale', color: `${C.cyan}33` }, { label: 'FC riposo (bpm)', color: C.crimson }]} />
    </Card>
  );
}

// --------------------------------------------------------------------- sleep
function SleepCard({ a }) {
  const s = a.sleep;
  const pd = s.period;
  const debtTone = s.debt7 >= 6 ? 'bad' : s.debt7 >= 3 ? 'warn' : 'good';
  return (
    <Card title="Sonno" subtitle={`Fasi, punteggio e regolarità · ${a.rangeLabel} · bisogno ${fmtH(s.need)} a notte`} icon={Moon} insightKey="sleep" className="lg:col-span-2">
      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-6">
        <Kpi label="Debito 7gg" value={fmtH(s.debt7)} tone={debtTone} big sub={s.surplus7 ? `surplus ${fmtH(s.surplus7)}` : undefined} />
        <Kpi label="Stanotte" value={fmtHours(s.lastNight?.total)} sub={`score ${fmt(s.lastNight?.score)}`} />
        <Kpi label="Media periodo" value={fmtH(pd.avg)} sub={`score ${fmt(pd.score)}`} />
        <Kpi label="Efficienza" value={fmt(pd.efficiency, 1)} unit="%" tone={(pd.efficiency ?? 100) < 87 ? 'warn' : undefined} />
        <Kpi label="Profondo" value={fmt(pd.deepPct, 0)} unit="%" tone={(pd.deepPct ?? 20) < 13 ? 'warn' : undefined} />
        <Kpi label="REM" value={fmt(pd.remPct, 0)} unit="%" />
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
        <Kpi label="A letto (media)" value={s.bedtimeAvg ?? '—'} sub={isNum(s.bedtimeSdMin) ? `± ${s.bedtimeSdMin} min` : undefined} tone={(s.bedtimeSdMin ?? 0) > 45 ? 'warn' : undefined} />
        <Kpi label="Sveglia (media)" value={s.wakeAvg ?? '—'} sub={isNum(s.wakeSdMin) ? `± ${s.wakeSdMin} min` : undefined} tone={(s.wakeSdMin ?? 0) > 45 ? 'warn' : undefined} />
        <Kpi label="Sonno ↔ HRV" value={isNum(s.sleepHrvCorr) ? `r ${fmt(s.sleepHrvCorr, 2)}` : '—'} sub={isNum(s.hrvPerHour) && (s.sleepHrvCorr ?? 0) >= 0.3 ? `+${fmt(s.hrvPerHour, 1)} ms HRV / ora` : 'legame debole'} />
        <Kpi label="Notti < 6 h" value={`${pd.shortNights}/${pd.nights}`} tone={pd.nights && pd.shortNights / pd.nights >= 0.2 ? 'warn' : undefined} />
      </div>
    </Card>
  );
}

// --------------------------------------------------------------------- stress & body battery
function AnsCard({ a }) {
  const intr = a.ans.intraday;
  const toneColor = { good: C.emerald, warn: C.amber, bad: C.crimson };
  return (
    <Card title="Stress & Body Battery · oggi" subtitle="Stress fisiologico e Body Battery a intervalli di 15’" icon={BrainCircuit} insightKey="ans" className="lg:col-span-2">
      {intr ? (
        <>
          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Kpi label="Body Battery ora" value={fmt(intr.current?.bb)} unit="/100" tone={toneFor(intr.current?.bb, 50, 25)} />
            <Kpi label="Ricarica notte" value={signed(intr.bbGain)} tone={isNum(intr.bbGain) ? (intr.bbGain >= 40 ? 'good' : intr.bbGain >= 25 ? 'warn' : 'bad') : undefined} />
            <Kpi label="Stress notte" value={fmt(intr.nightStress)} tone={(intr.nightStress ?? 0) > 22 ? 'warn' : 'good'} />
            <Kpi label="Stress da sveglio" value={fmt(intr.dayMean)} tone={toneFor(100 - (intr.dayMean ?? 0), 65, 50)} />
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
  const p = a.ans.period;
  return (
    <Card title="Ricarica vs consumo" subtitle={`Body Battery caricata / consumata e stress medio giornaliero · ${a.rangeLabel}`} icon={BatteryCharging} info="dailyAns" className="lg:col-span-3">
      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Kpi label="Stress medio" value={fmt(p.stress)} tone={(p.stress ?? 0) > 40 ? 'warn' : undefined} />
        <Kpi label="Ricarica media" value={fmt(p.charged)} unit="/giorno" />
        <Kpi label="Consumo medio" value={fmt(p.drained)} unit="/giorno" tone={(p.drained ?? 0) > (p.charged ?? 0) + 5 ? 'warn' : undefined} />
        <Kpi label="Body Battery max media" value={fmt(p.bbMax)} tone={toneFor(p.bbMax, 75, 50)} />
        <Kpi label="Giorni in deficit" value={`${p.deficitDays}/${p.days}`} tone={p.days && p.deficitDays / p.days >= 0.4 ? 'warn' : undefined} sub="consumo > ricarica" />
      </div>
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
      <SummaryCard a={a} />
      <ReadinessCard a={a} />
      <HrvCard a={a} />
      <SleepCard a={a} />
      <AIBox title="AI Sleep Coach" icon={Moon} task="sleep" heuristic={sleepCoachText} info="sleepCoach" />
      <AnsCard a={a} />
      <LongevityCard a={a} />
      <DailyAnsCard a={a} />
      <SymptomRadar a={a} sensitivity={sensitivity} onSensitivity={onSensitivity} history={history} />
    </div>
  );
}
