import { useState } from 'react';
import { BookOpen, CalendarCheck, ChevronDown, Flag, Gauge, ListChecks, Medal, Target } from 'lucide-react';
import { AIBox, Card, Kpi, TONE } from '../components/ui';
import { planCoachText } from '../lib/insights';
import { BASELINES, RACE_DATE, RACE_TIPS, RULES } from '../lib/plan';
import { HR_ZONES, PACE_TABLE, PASSAGES, RACE_GOALS, TYPE_COLORS, TYPE_LABELS, ZONE_COLORS } from '../lib/planData';
import { fmt, fmtDay, fmtDuration, fmtPace } from '../lib/util';

const STATE = {
  done: { icon: '✓', label: 'Fatta', cls: 'text-emerald border-emerald/50 bg-emerald/10' },
  partial: { icon: '◐', label: 'Parziale', cls: 'text-amber border-amber/50 bg-amber/10' },
  missed: { icon: '✗', label: 'Saltata', cls: 'text-crimson border-crimson/50 bg-crimson/10' },
  skipped: { icon: '–', label: 'Non fatta (facoltativa)', cls: 'text-gray-500 border-edge' },
  todo: { icon: '●', label: 'Da fare', cls: 'text-cyan border-cyan/50 bg-cyan/10' },
  future: { icon: '○', label: 'In programma', cls: 'text-gray-500 border-edge' },
};
const GRADE = { A: 'text-emerald border-emerald/50 bg-emerald/10', B: 'text-amber border-amber/50 bg-amber/10', C: 'text-crimson border-crimson/50 bg-crimson/10' };
const zoneColor = (z) => ZONE_COLORS[(z.match(/Z\d/g) ?? ['Z2']).at(-1)] ?? '#888';
const raceDay = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${RACE_DATE}T00:00:00Z`));

function StateBadge({ state }) {
  const s = STATE[state] ?? STATE.future;
  return <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${s.cls}`}>{s.icon} {s.label}</span>;
}

function Session({ s, compact }) {
  const tc = TYPE_COLORS[s.type] ?? TYPE_COLORS.Easy;
  const run = s.match?.run;
  return (
    <div className="rounded-lg border border-edge bg-void/50 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: tc.light, color: tc.text }}>{TYPE_LABELS[s.type]}</span>
          {s.optional && <span className="rounded border border-edge px-1.5 py-0.5 text-[10px] text-gray-400">facoltativa</span>}
          <span className="text-sm font-semibold text-gray-100">{s.title}</span>
        </div>
        <StateBadge state={s.state} />
      </div>
      {!compact && <p className="mt-2 text-xs leading-relaxed text-gray-300">{s.desc}</p>}
      <div className="num mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-400">
        <span><b className="text-gray-200">{s.targetKm} km</b></span>
        {s.pace && <span>ritmo {s.pace}</span>}
        {s.hr && <span>FC {s.hr}</span>}
      </div>
      {!compact && s.zones?.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {s.zones.map((z) => {
            const c = zoneColor(z.z);
            return <span key={z.z + z.what} className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: `${c}24`, color: c, border: `1px solid ${c}55` }}>{z.z} · {z.what}</span>;
          })}
        </div>
      )}
      {!compact && s.why && <p className="mt-2 text-[11px] italic text-gray-500">Perché: {s.why}</p>}
      {run && (
        <div className="mt-3 rounded-md border border-cyan/25 bg-cyan/5 p-2.5">
          <div className="num text-[11px] text-cyan">
            Garmin {fmtDay(run.date)} · {fmt(run.distance / 1000, 2)} km · {fmtDuration(run.duration)} · {fmtPace(run.pace)}/km · FC {fmt(run.avgHr)}
            <span className="ml-2 text-gray-500">somiglianza {Math.round(s.match.score * 100)}%</span>
          </div>
          {s.compliance?.notes.map((n, i) => (
            <div key={i} className={`mt-1 text-[11px] ${n.tone === 'good' ? 'text-emerald' : n.tone === 'warn' ? 'text-amber' : 'text-gray-400'}`}>{n.tone === 'good' ? '' : '• '}{n.text}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function Overview({ a }) {
  const p = a.plan;
  return (
    <Card title={`Piano Sub-2:00 · Mezza maratona ${raceDay}`} subtitle="22 settimane · 1 uscita chiave a settimana + 1 facoltativa a settimane alterne · corse Garmin abbinate automaticamente" icon={Target} insightKey="planOverview" info="planOverview" className="lg:col-span-3">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Settimana" value={`${p.weekNo}/${p.totalWeeks}`} sub={p.current.phaseTitle} />
        <Kpi label="Obiettivo attuale" value={p.goal} sub={`${RACE_GOALS.find((g) => g.label.startsWith(p.goal))?.time} · ${p.goalPace}/km Garmin`} tone={p.goal === 'A' ? 'good' : p.goal === 'B' ? 'warn' : 'bad'} big />
        <Kpi label="Aderenza chiavi" value={fmt(p.adherence)} unit="%" tone={(p.adherence ?? 100) >= 85 ? 'good' : (p.adherence ?? 100) >= 60 ? 'warn' : 'bad'} />
        <Kpi label="Chiavi fatte" value={`${p.keyDone}/${p.keyDue}`} sub={p.keyPartial ? `${p.keyPartial} parziali` : undefined} />
        <Kpi label="Chiavi saltate" value={p.keyMissed} tone={p.keyMissed ? 'warn' : undefined} sub={p.consecutiveMissed ? `${p.consecutiveMissed} di fila` : undefined} />
        <Kpi label="Km sessioni" value={fmt(p.matchedKm, 1)} sub={`chiavi previste ${fmt(p.plannedKmToDate, 0)} km`} />
      </div>
      <div className="mt-4 flex gap-0.5" role="img" aria-label="Avanzamento settimane">
        {p.weeks.map((w) => {
          const key = w.sessions.find((s) => !s.optional);
          const col = { done: '#10B981', partial: '#F59E0B', missed: '#EF4444', todo: '#00F0FF' }[key?.state] ?? '#1F2937';
          return <div key={w.week} title={`Sett. ${w.week}: ${STATE[key?.state]?.label ?? ''}`} className={`h-2 flex-1 rounded-sm ${w.weekState === 'current' ? 'ring-1 ring-cyan' : ''}`} style={{ background: col }} />;
        })}
      </div>
    </Card>
  );
}

function ThisWeek({ a }) {
  const p = a.plan;
  const w = p.current;
  const adv = p.optionalAdvice;
  const advTone = { do: 'good', skip: 'bad', later: 'info', optional: 'warn' }[adv?.verdict];
  return (
    <Card title={`Settimana ${w.week} · ${fmtDay(w.start)}–${fmtDay(w.end)}${w.tag ? ` · ${w.tag}` : ''}`} subtitle={w.phaseTitle} icon={CalendarCheck} insightKey="planWeek" className="lg:col-span-2">
      <div className="space-y-3">
        {w.sessions.map((s) => <Session key={s.id} s={s} />)}
      </div>
      {adv && (
        <div className={`mt-3 rounded-md border-l-2 ${TONE[advTone].border} bg-void/60 px-3 py-2 text-xs text-gray-300`}>
          <b className={TONE[advTone].text}>Seconda uscita: {{ do: 'consigliata', skip: 'meglio saltarla', later: 'dopo la chiave', optional: 'a sensazione' }[adv.verdict]}</b> · {adv.text}
        </div>
      )}
      <div className="mt-3 text-[11px] text-gray-500">
        Lungo di solito di <b className="text-gray-300">{p.habits.longDayName}</b>
        {p.habits.legClash.length ? <span className="text-amber"> · leg day di {p.habits.legClash.join(' e ')} troppo vicini al lungo (regola 48 h)</span> : ' · nessun leg day nelle 48 h prima'}
        {p.gelsActive && ' · gel ai minuti 30/60/90 nei lunghi'}
      </div>
      {w.extra.length > 0 && (
        <div className="mt-3 text-[11px] text-gray-500">
          Altre corse della settimana fuori piano: {w.extra.map((r) => `${fmtDay(r.date)} ${fmt(r.distance / 1000, 1)} km`).join(' · ')}
        </div>
      )}
    </Card>
  );
}

function Gates({ a }) {
  return (
    <Card title="Controlli A / B / C" subtitle="Valutati automaticamente dai lap" icon={Gauge} insightKey="planGates">
      <div className="space-y-2.5">
        {a.plan.gates.map((g) => (
          <div key={g.runId} className="rounded-lg border border-edge bg-void/50 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-gray-200">{g.when}</span>
              {g.grade ? <span className={`rounded border px-2 py-0.5 text-sm font-bold ${GRADE[g.grade]}`}>{g.grade}</span> : <span className="text-[10px] text-gray-500">{g.week && g.week >= a.plan.weekNo ? 'in programma' : '—'}</span>}
            </div>
            <div className="mt-1 text-[11px] text-gray-400">{g.detail}</div>
            <div className="mt-1.5 grid grid-cols-3 gap-1 text-[10px]">
              <span className="text-emerald">A · {g.a}</span><span className="text-amber">B · {g.b}</span><span className="text-crimson">C · {g.c}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function PacesZones({ a }) {
  const { maxHr, restHr } = a.profile;
  const pctRange = (pct) => pct.match(/(\d+)[–-](\d+)%/)?.slice(1).map(Number);
  return (
    <Card title="Ritmi e zone" subtitle="Ritmi sul Garmin calibrati sul tuo 10 km in 53:27" icon={ListChecks} info="planZones">
      <table className="w-full text-xs">
        <tbody>
          {PACE_TABLE.map((r) => (
            <tr key={r.t} className="border-t border-edge">
              <td className="py-1.5 text-gray-300">{r.t}</td>
              <td className="num font-semibold text-gray-100">{r.pace}</td>
              <td className="num text-gray-500">{r.hr}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 text-[10px] uppercase tracking-[0.16em] text-gray-500">Zone FC · piano vs tuoi dati Garmin ({maxHr}/{restHr})</div>
      <table className="mt-1 w-full text-xs">
        <tbody>
          {HR_ZONES.map((z) => {
            const pr = pctRange(z.pct.includes('%') ? z.pct.replace(' FCR', '') : '');
            const g = pr ? `${Math.round(restHr + (pr[0] / 100) * (maxHr - restHr))}–${Math.round(restHr + (pr[1] / 100) * (maxHr - restHr))}` : '—';
            return (
              <tr key={z.z} className="border-t border-edge">
                <td className="py-1.5 font-bold" style={{ color: ZONE_COLORS[z.z] }}>{z.z}</td>
                <td className="num text-gray-200">{z.bpm}</td>
                <td className="num text-cyan">{g}</td>
                <td className="text-gray-500">{z.use}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function Race() {
  return (
    <Card title="Gara" subtitle="Obiettivi, passaggi e strategia" icon={Medal} info="planRace">
      <div className="space-y-2">
        {RACE_GOALS.map((g) => (
          <div key={g.label} className="rounded-lg border border-edge bg-void/50 p-2.5">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold text-gray-200">{g.label}</span>
              <span className="num text-lg font-bold text-cyan">{g.time}</span>
            </div>
            <div className="num text-[11px] text-gray-400">{g.real}/km reali · {g.garmin}/km Garmin</div>
            <div className="text-[11px] text-gray-500">{g.note}</div>
          </div>
        ))}
      </div>
      <table className="mt-3 w-full text-[11px]">
        <thead><tr className="text-left text-[10px] uppercase text-gray-500"><th>Obiettivo</th><th>5 km</th><th>10 km</th><th>15 km</th><th>20 km</th></tr></thead>
        <tbody className="num">
          {PASSAGES.map((r) => <tr key={r.goal} className="border-t border-edge text-gray-300"><td className="py-1 font-sans">{r.goal}</td><td>{r.k5}</td><td>{r.k10}</td><td>{r.k15}</td><td>{r.k20}</td></tr>)}
        </tbody>
      </table>
      <ul className="mt-3 space-y-1 text-[11px] leading-relaxed text-gray-400">
        {RACE_TIPS.map((t) => <li key={t}>• {t}</li>)}
      </ul>
      <div className="mt-3 border-t border-edge pt-2 text-[11px] text-gray-500">
        {BASELINES.map((b) => <div key={b.date}><b className="text-gray-300">{fmtDay(b.date)} {b.label}</b> · {fmtDuration(b.time)} · FC {b.hr} · {b.note}</div>)}
      </div>
    </Card>
  );
}

function FullPlan({ a }) {
  const [open, setOpen] = useState(() => ({ [a.plan.weekNo]: true }));
  const phases = [...new Set(a.plan.weeks.map((w) => w.phase))];
  return (
    <Card title="Piano completo" subtitle="22 settimane · stato di ogni sessione" icon={BookOpen} info="planFull" className="lg:col-span-2">
      <div className="space-y-4">
        {phases.map((ph) => {
          const weeks = a.plan.weeks.filter((w) => w.phase === ph);
          return (
            <div key={ph}>
              <div className="mb-1.5 text-[10px] uppercase tracking-[0.18em] text-cyan">Fase {ph} · {weeks[0].phaseTitle}</div>
              <div className="space-y-1.5">
                {weeks.map((w) => (
                  <div key={w.week} className={`rounded-lg border ${w.weekState === 'current' ? 'border-cyan/50' : 'border-edge'} bg-void/40`}>
                    <button type="button" onClick={() => setOpen((o) => ({ ...o, [w.week]: !o[w.week] }))} className="flex w-full items-center gap-3 px-3 py-2 text-left">
                      <span className="num w-7 text-sm font-bold text-gray-300">{w.week}</span>
                      <span className="num w-24 shrink-0 text-[11px] text-gray-500">{fmtDay(w.start)}–{fmtDay(w.end)}</span>
                      <span className="min-w-0 flex-1 truncate text-xs text-gray-300">
                        {w.tag && <span className="mr-1.5 rounded bg-violet/15 px-1 text-[9px] font-semibold text-violet">{w.tag}</span>}
                        {w.sessions.map((s) => s.title).join(' + ')}
                      </span>
                      <span className="flex gap-1">{w.sessions.map((s) => <span key={s.id} title={STATE[s.state].label} className={`text-xs ${STATE[s.state].cls.split(' ')[0]}`}>{STATE[s.state].icon}</span>)}</span>
                      <ChevronDown size={14} className={`shrink-0 text-gray-500 transition ${open[w.week] ? 'rotate-180' : ''}`} />
                    </button>
                    {open[w.week] && <div className="space-y-2 px-3 pb-3">{w.sessions.map((s) => <Session key={s.id} s={s} />)}</div>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Rules() {
  return (
    <Card title="Le regole del piano" subtitle="Dal tuo training-app, applicate in automatico dall’AI Plan Coach" icon={Flag} info="planRules">
      <ul className="space-y-2.5 text-xs leading-relaxed text-gray-300">
        {RULES.map((r) => <li key={r.title}><b className="text-gray-100">{r.title}.</b> {r.text}</li>)}
      </ul>
    </Card>
  );
}

export function PlanTab({ a }) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <Overview a={a} />
      <ThisWeek a={a} />
      <AIBox title="AI Plan Coach" icon={Target} task="plan" heuristic={planCoachText} info="planWeek" />
      <Gates a={a} />
      <PacesZones a={a} />
      <Race />
      <FullPlan a={a} />
      <Rules />
    </div>
  );
}
