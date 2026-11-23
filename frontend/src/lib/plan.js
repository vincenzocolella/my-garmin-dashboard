// Sub-2:00 half-marathon plan: auto-matching of Garmin runs to planned sessions,
// block analysis from laps, A/B/C checkpoints and weekly recommendations.
import { GATES, PLAN_START, RACE_DATE, RACE_GOALS, TRAINING_PLAN } from './planData';
import { addDays, diffDays, isNum, mean, round, toDate } from './util';

export { PLAN_START, RACE_DATE };

export const RULES = [
  { title: '1 uscita chiave a settimana', text: 'Il lungo. La seconda uscita, una qualità breve, è facoltativa e capita a settimane alterne: circa 6 uscite al mese. Saltarla non compromette il piano.' },
  { title: 'Se salti un’uscita chiave', text: 'Ripeti la settimana. Se ne salti due di fila, rivedi l’obiettivo (B o C).' },
  { title: 'Il lavoro che conta è dentro i lunghi', text: 'Blocchi a ritmo gara da 4 → 6 → 8 → 10 → 12 km: allenano la resistenza che ti è mancata nella mezza (calo ai km 17–20).' },
  { title: 'Pesi', text: 'Li gestisci tu. Unico vincolo di calendario: niente gambe pesanti nelle 48 ore prima delle uscite chiave.' },
  { title: 'Gel', text: 'Ai minuti 30, 60 e 90 già dai lunghi della settimana 6, sempre lo stesso prodotto della gara.' },
  { title: 'Freddo o ghiaccio', text: 'Sposta l’uscita di un giorno o usa il tapis roulant. Con il freddo il sensore ottico peggiora: fidati della sensazione.' },
  { title: 'Dolore', text: 'Oltre 3/10 o che cambia l’appoggio: salta la corsa. Se dura 7 giorni, vai da un fisioterapista.' },
  { title: 'FC a riposo', text: 'Se resta +5 bpm sopra la tua baseline per 3 giorni, alleggerisci.' },
];

export const RACE_TIPS = [
  'Km 1–5 a 5:41/km. Mai più veloce: la FC salirà subito per l’adrenalina, ignorala.',
  'Km 6–16 a 5:36/km, sforzo 6–7 su 10. FC di controllo ≤ 178: se tocchi 180 prima del km 10 hai già pagato troppo.',
  'Km 17–21,1: tieni il ritmo. Se le gambe rispondono accelera dal km 19, volata solo nell’ultimo km.',
  'Nessun km sotto 5:31 prima del km 16. Gel ai minuti 30, 60 e 90.',
];

export const BASELINES = [
  { date: '2026-10-25', label: 'Mezza di partenza', km: 21.1, time: 2 * 3600 + 12 * 60 + 2, hr: 177, note: 'Calo ai km 17–20 (+17 s/km a FC invariata), gel solo a ~km 7 e ~km 15.' },
  { date: '2026-11-01', label: '10 km a tutta', km: 10.01, time: 53 * 60 + 27, hr: 174, note: 'Split negativo 27:27 / 26:00: equivale a una mezza in 1:58:27 (VDOT ≈ 37).' },
];

const GOAL_PACE = Object.fromEntries(RACE_GOALS.map((g) => [g.label[0], g.garmin])); // { A: '5:36', B: '5:48', C: '6:07' }
export const goalPace = (g) => GOAL_PACE[g] ?? GOAL_PACE.A;

const paceSec = (s) => {
  const m = String(s ?? '').match(/(\d+):(\d\d)/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export const PLAN_WEEKS = TRAINING_PLAN.flatMap((p) =>
  p.weeks.map((w) => ({ ...w, phase: p.phase, phaseTitle: p.phaseTitle, start: addDays(PLAN_START, (w.week - 1) * 7), end: addDays(PLAN_START, (w.week - 1) * 7 + 6) })),
);

// --------------------------------------------------------------------- parsing the plan text
export function parseBlock(session) {
  const d = session.desc;
  const reps = d.match(/(\d+)\s*×\s*(\d+(?:,\d+)?)\s*km a (\d:\d\d)/);
  if (reps) return { km: Number(reps[1]) * parseFloat(reps[2].replace(',', '.')), pace: paceSec(reps[3]), reps: Number(reps[1]) };
  const blocks = [...d.matchAll(/(\d+(?:,\d+)?)\s*km a (\d:\d\d)\/km/g)];
  if (blocks.length) {
    const m = blocks.at(-1);
    return { km: parseFloat(m[1].replace(',', '.')), pace: paceSec(m[2]) };
  }
  if (/10 km al massimo/.test(d)) return { km: 10, pace: null, test: true };
  const mReps = d.match(/(\d+)\s*×\s*(\d+)\s*m a (\d:\d\d)/);
  if (mReps) return { km: (Number(mReps[1]) * Number(mReps[2])) / 1000, pace: paceSec(mReps[3]), reps: Number(mReps[1]), approx: Number(mReps[2]) < 1000 };
  // time-based blocks: "2 × 8 min a 5:28/km", "20 min a 5:28/km" -> equivalent distance at the target pace
  const minReps = d.match(/(\d+)\s*×\s*(\d+)\s*min a (\d:\d\d)/);
  if (minReps) {
    const pace = paceSec(minReps[3]);
    return { km: Math.round(((Number(minReps[1]) * Number(minReps[2]) * 60) / pace) * 10) / 10, pace, reps: Number(minReps[1]), minutes: Number(minReps[1]) * Number(minReps[2]), short: Number(minReps[2]) < 3 };
  }
  const minBlock = d.match(/(\d+)\s*min a (\d:\d\d)/);
  if (minBlock) {
    const pace = paceSec(minBlock[2]);
    return { km: Math.round(((Number(minBlock[1]) * 60) / pace) * 10) / 10, pace, minutes: Number(minBlock[1]) };
  }
  return null;
}
const hrCap = (session) => {
  const caps = [...String(session.hr ?? '').matchAll(/≤\s*(\d{3})/g)];
  return caps.length ? Number(caps.at(-1)[1]) : null;
};
const easyRange = (session) => {
  const m = String(session.pace ?? '').match(/(\d:\d\d)\s*[–-]\s*(\d:\d\d)/);
  return m ? [paceSec(m[1]), paceSec(m[2])] : null;
};

// --------------------------------------------------------------------- laps
/** Fastest block of `km` from laps [[m, s, bpm]]: contiguous for continuous blocks, best laps for repeats. */
export function findBlock(laps, km, { contiguous = true, lastKm = 2 } = {}) {
  const L = (laps ?? []).filter((l) => l[0] > 150 && l[1] > 0);
  if (!L.length) return null;
  const target = km * 1000 * 0.96;
  let best = null;
  if (contiguous) {
    for (let i = 0; i < L.length; i++) {
      let dist = 0;
      let time = 0;
      for (let j = i; j < L.length; j++) {
        dist += L[j][0];
        time += L[j][1];
        if (dist >= target) {
          const pace = (time / dist) * 1000;
          if (!best || pace < best.pace) best = { idx: Array.from({ length: j - i + 1 }, (_, k) => i + k), pace, time, dist };
          break;
        }
      }
    }
  } else {
    const order = L.map((l, i) => ({ i, pace: l[1] / l[0] })).sort((a, b) => a.pace - b.pace);
    let dist = 0;
    let time = 0;
    const idx = [];
    for (const o of order) {
      idx.push(o.i);
      dist += L[o.i][0];
      time += L[o.i][1];
      if (dist >= target) break;
    }
    if (dist >= target) best = { idx: idx.sort((a, b) => a - b), pace: (time / dist) * 1000, time, dist };
  }
  if (!best) return null;
  const hrOf = (ids) => {
    const w = ids.filter((k) => isNum(L[k][2]));
    const t = w.reduce((s, k) => s + L[k][1], 0);
    return t ? w.reduce((s, k) => s + L[k][2] * L[k][1], 0) / t : null;
  };
  const tail = [];
  let d = 0;
  for (let k = best.idx.length - 1; k >= 0 && d < lastKm * 1000 * 0.96; k--) {
    tail.push(best.idx[k]);
    d += L[best.idx[k]][0];
  }
  return { ...best, km: round(best.dist / 1000, 2), hrAvg: round(hrOf(best.idx)), hrLast: round(hrOf(tail)), lastKm };
}

// --------------------------------------------------------------------- matching
const isLong = (a) => a.distance >= 11000 || a.duration >= 70 * 60;
const isQuality = (a) => a.hard || (a.highPct ?? 0) >= 12 || (a.anaerobicTE ?? 0) >= 1.8;

/** 0..1 similarity between a planned session and an actual Garmin run. */
export function matchScore(session, a) {
  const km = a.distance / 1000;
  const ratio = km / session.targetKm;
  if (ratio < 0.55 || ratio > 1.6) return 0;
  const dist = 1 - Math.min(1, Math.abs(1 - ratio) / 0.45);
  const type = {
    'Long Run': isLong(a) ? 1 : 0.35,
    Tempo: isQuality(a) ? 1 : 0.45,
    Speed: isQuality(a) ? 1 : 0.45,
    Race: km >= 19 ? 1 : 0,
    Easy: isQuality(a) ? 0.6 : 1,
  }[session.type] ?? 0.5;
  return round(0.6 * dist + 0.4 * type, 2);
}

function compliance(session, a, block) {
  const notes = [];
  const out = { km: round(a.distance / 1000, 2), kmPct: round((a.distance / 1000 / session.targetKm) * 100), pace: a.pace, avgHr: a.avgHr, rpe: a.rpe, notes };
  const cap = hrCap(session);
  if (block?.short) {
    notes.push({ tone: 'info', text: 'ripetute brevi: con i lap da 1 km non si possono misurare, guida il ritmo' });
  } else if (block && a.laps?.length) {
    const b = findBlock(a.laps, block.km, { contiguous: !block.reps, lastKm: block.km >= 10 ? 3 : 2 });
    if (b) {
      out.block = { ...b, targetPace: block.pace, hrCap: cap };
      if (block.approx) notes.push({ tone: 'info', text: `ripetute da meno di 1 km: stima dai lap più veloci` });
      if (isNum(block.pace)) {
        out.block.paceDelta = round(b.pace - block.pace);
        if (b.pace - block.pace > 8) notes.push({ tone: 'warn', text: `blocco da ${block.km} km a ${fmtP(b.pace)}/km, ${round(b.pace - block.pace)} s/km più lento del target ${fmtP(block.pace)}` });
        else if (block.pace - b.pace > 10) notes.push({ tone: 'warn', text: `blocco a ${fmtP(b.pace)}/km: ${round(block.pace - b.pace)} s/km più veloce del target, sprechi energie` });
        else notes.push({ tone: 'good', text: `blocco da ${b.km} km a ${fmtP(b.pace)}/km (target ${fmtP(block.pace)}) ✓` });
      }
      if (cap && isNum(b.hrLast)) notes.push(b.hrLast > cap + 2 ? { tone: 'warn', text: `FC ultimi ${b.lastKm} km ${b.hrLast} bpm, sopra il controllo ${cap}` } : { tone: 'good', text: `FC ultimi ${b.lastKm} km ${b.hrLast} bpm (≤ ${cap}) ✓` });
    } else notes.push({ tone: 'info', text: `blocco da ${block.km} km non trovato nei lap` });
  } else if (block) {
    notes.push({ tone: 'info', text: 'lap non disponibili: valutazione del blocco impossibile' });
  } else if (session.type === 'Easy' || session.type === 'Long Run') {
    const range = easyRange(session);
    if (range && isNum(a.pace)) {
      if (a.pace < range[0] - 10) notes.push({ tone: 'warn', text: `passo medio ${fmtP(a.pace)}/km: troppo veloce per un’uscita facile (${session.pace})` });
      else notes.push({ tone: 'good', text: `passo medio ${fmtP(a.pace)}/km nel range facile ✓` });
    }
    if (cap && isNum(a.avgHr) && a.avgHr > cap + 3) notes.push({ tone: 'warn', text: `FC media ${a.avgHr} sopra il tetto ${cap}` });
  }
  if (out.kmPct < 85) notes.push({ tone: 'warn', text: `distanza ${out.km} km su ${session.targetKm} (${out.kmPct}%)` });
  return out;
}

const fmtP = (sec) => (isNum(sec) ? `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}` : '—');

/** A missed key session can still be recovered in the first days of the following week (Mon–Wed). */
export const RECOVERY_DAYS = 3;

export function matchPlan(activities, today) {
  const runs = activities.filter((a) => a.kind === 'run' && a.date >= PLAN_START);
  const used = new Set();
  // weeks are processed in order, so a run in the recovery window goes to last week's missed key session first
  return PLAN_WEEKS.map((w) => {
    const weekState = w.end < today ? 'past' : w.start <= today ? 'current' : 'future';
    const weekRuns = runs.filter((a) => a.date >= w.start && a.date <= w.end);
    const pairs = [];
    w.runs.forEach((s, si) => weekRuns.forEach((a) => {
      const score = matchScore(s, a);
      if (score >= 0.5) pairs.push({ si, a, score: score + (s.optional ? 0 : 0.01) }); // key session wins ties
    }));
    pairs.sort((x, y) => y.score - x.score);
    const assigned = {};
    for (const p of pairs) {
      if (assigned[p.si] || used.has(p.a.id)) continue;
      assigned[p.si] = p;
      used.add(p.a.id);
    }
    // late recovery: key sessions still open take a similar run from the next RECOVERY_DAYS days
    const recoverUntil = addDays(w.end, RECOVERY_DAYS);
    if (weekState === 'past') {
      const lateRuns = runs.filter((a) => a.date > w.end && a.date <= recoverUntil && !used.has(a.id));
      w.runs.forEach((s, si) => {
        if (s.optional || assigned[si]) return;
        const best = lateRuns.filter((a) => !used.has(a.id)).map((a) => ({ si, a, score: matchScore(s, a), late: true })).filter((p) => p.score >= 0.6).sort((x, y) => y.score - x.score)[0];
        if (best) {
          assigned[si] = best;
          used.add(best.a.id);
        }
      });
    }
    const sessions = w.runs.map((s, si) => {
      const m = assigned[si];
      const block = parseBlock(s);
      const state = m
        ? m.score >= 0.75 && m.a.distance / 1000 >= s.targetKm * 0.85 ? 'done' : 'partial'
        : weekState === 'past' ? (s.optional ? 'skipped' : 'missed') : weekState === 'current' ? 'todo' : 'future';
      const recoverable = state === 'missed' && today <= recoverUntil;
      return { ...s, block, state, recoverable, recoverUntil, match: m ? { run: m.a, score: round(m.score, 2), late: Boolean(m.late) } : null, compliance: m ? compliance(s, m.a, block) : null };
    });
    return { ...w, weekState, sessions, extra: weekRuns.filter((a) => !used.has(a.id)) };
  });
}

// --------------------------------------------------------------------- checkpoints
const GATE_DEFS = [
  { runId: 'w9r1', kind: 'hr', blockKm: 6, lastKm: 2 },
  { runId: 'w13r1', kind: 'time10k' },
  { runId: 'w15r2', kind: 'hr', blockKm: 10, lastKm: 3 },
  { runId: 'w18r2', kind: 'hr', blockKm: 12, lastKm: 3 },
];

function evaluateGates(weeks) {
  const sessions = weeks.flatMap((w) => w.sessions.map((s) => ({ ...s, week: w.week, weekState: w.weekState })));
  return GATE_DEFS.map((g, i) => {
    const s = sessions.find((x) => x.id === g.runId);
    const base = { ...GATES[i], week: s?.week, runId: g.runId, state: s?.state, grade: null, detail: null };
    const run = s?.match?.run;
    if (!run) return { ...base, detail: s?.weekState === 'past' ? 'Controllo non eseguito' : 'In programma' };
    if (g.kind === 'time10k') {
      const b = findBlock(run.laps, 10, { lastKm: 2 });
      if (!b) return { ...base, detail: 'Servono i lap da 1 km per misurare i 10 km' };
      const t = (b.time / b.dist) * 10000;
      return { ...base, grade: t <= 53 * 60 ? 'A' : t <= 54 * 60 + 30 ? 'B' : 'C', detail: `10 km in ${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`, value: t };
    }
    const b = findBlock(run.laps, g.blockKm, { lastKm: g.lastKm });
    if (!b || !isNum(b.hrLast)) return { ...base, detail: 'Lap o FC non disponibili per valutare il blocco' };
    const rpe = run.rpe;
    const grade = b.hrLast > 178 || (rpe ?? 0) >= 9 ? 'C' : b.hrLast >= 176 || (rpe ?? 0) >= 8 ? 'B' : 'A';
    return { ...base, grade, detail: `Blocco ${b.km} km a ${fmtP(b.pace)}/km · FC ultimi ${g.lastKm} km ${b.hrLast}${isNum(rpe) ? ` · sforzo ${rpe}/10` : ' · sforzo non registrato'}` };
  });
}

// --------------------------------------------------------------------- weekly status & recommendations
const DAY_NAMES = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const dow = (iso) => toDate(iso).getUTCDay();

export function planStatus(a) {
  const today = a.today;
  const weeks = matchPlan(a.activities, today);
  const current = weeks.find((w) => w.weekState === 'current') ?? (today < PLAN_START ? weeks[0] : weeks.at(-1));
  const past = weeks.filter((w) => w.weekState === 'past');
  const key = past.flatMap((w) => w.sessions.filter((s) => !s.optional));
  let consecutiveMissed = 0;
  for (const s of [...key].reverse()) {
    if (s.recoverable) continue; // still recoverable this week: not missed yet
    if (s.state !== 'missed') break;
    consecutiveMissed++;
  }
  // last week's key session, while it can still be recovered (or was just recovered)
  const prevWeek = weeks.find((w) => w.week === current.week - 1);
  const recovery = prevWeek?.sessions.find((s) => !s.optional && (s.recoverable || (s.match?.late && today <= s.recoverUntil))) ?? null;
  const gates = evaluateGates(weeks);
  const lastGraded = [...gates].reverse().find((g) => g.grade);
  const goal = consecutiveMissed >= 2 && (!lastGraded || lastGraded.grade === 'A') ? 'B' : lastGraded?.grade ?? 'A';

  // habits from the last 8 weeks of Garmin data
  const recent = a.activities.filter((x) => diffDays(today, x.date) < 56);
  const mode = (xs) => {
    const c = {};
    xs.forEach((x) => (c[x] = (c[x] ?? 0) + 1));
    return Object.entries(c).sort((p, q) => q[1] - p[1])[0]?.[0];
  };
  const longDay = Number(mode(recent.filter((x) => x.kind === 'run' && isLong(x)).map((x) => dow(x.date))) ?? 0);
  const legDays = [...new Set(recent.filter((x) => x.kind === 'strength' && ['Lower', 'Full Body'].includes(x.strength?.focus)).map((x) => dow(x.date)))];
  const legClash = legDays.filter((d) => [1, 2].includes((longDay - d + 7) % 7));

  // rule: resting HR +5 for 3 days
  const rhrBase = a.readiness.rhrBase?.mean;
  const last3 = a.hrvRhr.slice(-3);
  const rhrAlarm = isNum(rhrBase) && last3.length === 3 && last3.every((d) => isNum(d.rhr) && d.rhr >= rhrBase + 5);

  // second (optional) session of the week
  const optional = current.sessions.find((s) => s.optional);
  const keySession = current.sessions.find((s) => !s.optional);
  let optionalAdvice = null;
  if (optional && current.weekState === 'current' && optional.state !== 'done') {
    const r = a.readiness.score ?? 80;
    const tsb = a.pmc.latest?.tsb ?? 0;
    const acwr = a.pmc.latest?.acwr ?? 1;
    if (a.illness?.current?.active) optionalAdvice = { verdict: 'skip', text: 'Saltala: ci sono segnali di malessere in corso. Proteggi la chiave della settimana.' };
    else if (r < 65 || tsb < -20 || acwr > 1.3 || rhrAlarm) optionalAdvice = { verdict: 'skip', text: `Saltala questa settimana (readiness ${r}, TSB ${round(tsb, 1)}, ACWR ${round(acwr, 2)}): il piano regge senza.` };
    else if (keySession && keySession.state !== 'done' && keySession.state !== 'partial') optionalAdvice = { verdict: 'later', text: `Prima la chiave (${keySession.title}); la qualità facoltativa solo se dopo il lungo hai 48 h di recupero e readiness ≥ 75.` };
    else if (goal !== 'A' || r >= 78) optionalAdvice = { verdict: 'do', text: goal !== 'A' ? `Consigliata: l’obiettivo attuale è ${goal} e questa seduta di soglia è il modo più efficiente per risalire.` : `Consigliata: readiness ${r} e carico sotto controllo, è una settimana da sfruttare.` };
    else optionalAdvice = { verdict: 'optional', text: `A sensazione: readiness ${r}. Falla solo se le gambe sono fresche, altrimenti non perdi nulla.` };
  }

  const keyDone = key.filter((s) => s.state === 'done').length;
  const keyPartial = key.filter((s) => s.state === 'partial').length;
  const matchedKm = weeks.flatMap((w) => w.sessions).reduce((s, x) => s + (x.match ? x.match.run.distance / 1000 : 0), 0);
  const plannedKmToDate = past.flatMap((w) => w.sessions.filter((s) => !s.optional)).reduce((s, x) => s + x.targetKm, 0);

  return {
    weeks,
    current,
    recovery: recovery ? { ...recovery, week: prevWeek.week } : null,
    weekNo: current.week,
    totalWeeks: weeks.length,
    daysToRace: diffDays(RACE_DATE, today),
    gates,
    goal,
    goalPace: goalPace(goal),
    keyDone,
    keyPartial,
    keyMissed: key.filter((s) => s.state === 'missed').length,
    keyDue: key.length,
    consecutiveMissed,
    matchedKm: round(matchedKm, 1),
    plannedKmToDate: round(plannedKmToDate, 1),
    adherence: key.length ? round(((keyDone + keyPartial * 0.5) / key.length) * 100) : null,
    habits: { longDay, longDayName: DAY_NAMES[longDay], legDays: legDays.map((d) => DAY_NAMES[d]), legClash: legClash.map((d) => DAY_NAMES[d]) },
    rhrAlarm,
    optionalAdvice,
    gelsActive: current.week >= 6,
    longRunPaceAvg: round(mean(past.flatMap((w) => w.sessions).filter((s) => s.type === 'Long Run' && s.match).map((s) => s.match.run.pace))),
  };
}
