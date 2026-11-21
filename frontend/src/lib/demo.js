import { addDays, clamp, localToday, rng, round, toDate } from './util';
import { parseBlock, PLAN_WEEKS } from './plan';

export const SCENARIOS = {
  balanced: { label: 'Bilanciato', desc: 'Blocco di costruzione progressivo, recupero adeguato.' },
  overtraining: { label: 'Overtraining', desc: 'Ultime 3 settimane: volume +70%, easy run troppo veloci, leg day prima delle ripetute.' },
  peak: { label: 'Peak Form', desc: 'Scarico pre-gara di 12 giorni: TSB positivo, HRV in salita.' },
  sleep_deprivation: { label: 'Sleep Deprivation', desc: 'Ultimi 10 giorni a ~5h di sonno, stress serale alto.' },
};

const MAX_HR = 189;
const REST_HR = 50;

// Weekly template (0 = Monday). Strings are workout kinds.
const PLANS = {
  base: [['strength:Lower'], ['easy'], ['strength:Upper'], ['intervals'], [], ['easy'], ['long']],
  overload: [['strength:Upper', 'easy'], ['easy'], ['strength:Lower'], ['intervals'], ['strength:Full Body', 'easy'], ['tempo'], ['long']],
  taper: [['strength:Upper'], ['easy'], [], ['intervals'], [], ['easy'], ['easy']],
};

function seedOf(s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** How strongly the scenario applies `daysAgo` days before today (0..1). */
function phase(scenario, daysAgo) {
  const len = { overtraining: 24, peak: 12, sleep_deprivation: 10 }[scenario];
  if (!len || daysAgo >= len) return 0;
  return clamp((len - daysAgo) / Math.min(len, 8), 0, 1);
}

const localEpoch = (iso, h, m) => {
  const d = toDate(iso);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m); // Garmin "local" timestamps: wall clock as UTC
};

/** 1 km auto-laps [[m, s, bpm]] with cardiac drift and an optional fast block at the end. */
function makeLaps(r, km, pace, hr, { block, drift = 3 } = {}) {
  const laps = [];
  const full = Math.floor(km);
  const total = Math.ceil(km - 0.05);
  for (let i = 0; i < total; i++) {
    const dist = i < full ? 1000 : Math.round((km - full) * 1000);
    if (dist < 60) continue;
    const inBlock = block && i >= total - Math.ceil(block.km);
    const p = (inBlock ? block.pace : pace) + r.normal(0, 4);
    const h = (inBlock ? block.hr + (i - (total - block.km)) * 0.8 : hr) + (drift / 100) * hr * (i / Math.max(1, km)) * 1.4 + r.normal(0, 1.2);
    laps.push([dist, round((dist / 1000) * p, 1), Math.round(h)]);
  }
  return laps;
}

const PLAN_KIND = { 'Long Run': 'long', Tempo: 'tempo', Speed: 'intervals', Easy: 'easy', Race: 'long' };

function makeRun(kind, ctx) {
  const { r, date, p, scenario, progress, volume, id, planned } = ctx;
  const ot = scenario === 'overtraining' ? p : 0;
  const sleepy = scenario === 'sleep_deprivation' ? p : 0;
  const easyPace = 352 - progress * 18 + ot * 6 + sleepy * 8; // aerobic improvement over the block
  const spec = {
    easy: { km: 8, pace: easyPace, hr: 138 + ot * 11 + sleepy * 5, zones: [15, 68 - ot * 30, 14 + ot * 30, 3, 0], te: [2.7, 0.3], dec: 2.6 + ot * 4 + sleepy * 2.5 },
    tempo: { km: 10, pace: easyPace - 48, hr: 158, zones: [6, 22, 44, 26, 2], te: [3.6, 1.2], dec: 4.5 },
    intervals: { km: 9, pace: easyPace - 62, hr: 160 + ot * 4, zones: [10, 24, 18, 30, 18], te: [3.8, 2.9], dec: null },
    long: { km: Math.min(20, 14 + progress * 5), pace: easyPace + 14, hr: 144 + ot * 7, zones: [8, 62 - ot * 20, 26 + ot * 18, 4, 0], te: [3.5, 0.5], dec: 4.8 + ot * 4 },
  }[kind];
  const scale = kind === 'easy' || kind === 'long' ? volume : Math.sqrt(volume); // quality sessions grow less than volume
  const km = planned ? planned.targetKm * (0.98 + r() * 0.05) : Math.max(4, spec.km * scale * (0.92 + r() * 0.16));
  const basePace = spec.pace + r.normal(0, 5);
  const plannedBlock = planned ? parseBlock(planned) : null;
  const block = plannedBlock
    ? { km: Math.min(km - 1, plannedBlock.km), pace: (plannedBlock.pace ?? 300) + ot * 7 + sleepy * 6 + r.normal(0, 3), hr: 168 + ot * 9 + sleepy * 6 + (plannedBlock.km >= 10 ? 2 : 0) }
    : null;
  const laps = makeLaps(r, km, planned ? Math.max(basePace, planned.type === 'Easy' ? 415 : 405) : basePace, spec.hr + r.normal(0, 2), { block, drift: spec.dec ?? 2 });
  const duration = laps.reduce((t, l) => t + l[1], 0);
  const pace = duration / km;
  const avgHr = Math.round(laps.reduce((t, l) => t + l[2] * l[1], 0) / duration);
  const zTot = spec.zones.reduce((a, b) => a + b, 0);
  return {
    id,
    date,
    start: `${date} ${r() > 0.5 ? '07:05:00' : '18:40:00'}`,
    type: kind === 'easy' && r() > 0.85 ? 'treadmill_running' : 'running',
    kind: 'run',
    name: planned?.title ?? { easy: 'Corsa facile', tempo: 'Tempo run', intervals: 'Ripetute 6x1000', long: 'Lungo' }[kind],
    distance: Math.round(km * 1000),
    duration: Math.round(duration),
    avgHr,
    maxHr: Math.min(MAX_HR, avgHr + Math.round(12 + r() * 14)),
    avgSpeed: 1000 / pace,
    cadence: Math.round(170 + (kind === 'intervals' ? 8 : 0) + r.normal(0, 2)),
    calories: Math.round((duration / 60) * 11.5),
    aerobicTE: round(spec.te[0] + r.normal(0, 0.2), 1),
    anaerobicTE: round(Math.max(0, spec.te[1] + r.normal(0, 0.2)), 1),
    garminLoad: null,
    elevation: Math.round(20 + r() * 120),
    vo2max: null,
    avgPower: Math.round(250 + (360 - pace) * 0.9),
    zones: spec.zones.map((z) => Math.round((duration * z) / zTot)),
    rpe: null,
    decoupling: spec.dec == null ? null : round(Math.max(0.3, spec.dec + r.normal(0, 1)), 1),
    laps,
    strength: null,
  };
}

function makeStrength(focus, ctx) {
  const { r, date, p, scenario, id } = ctx;
  const ot = scenario === 'overtraining' ? p : 0;
  const duration = (50 + r() * 15) * 60;
  const base = { Lower: 10500, Upper: 7200, 'Full Body': 9000 }[focus];
  return {
    id,
    date,
    start: `${date} 19:00:00`,
    type: 'strength_training',
    kind: 'strength',
    name: `Forza ${focus}`,
    distance: 0,
    duration: Math.round(duration),
    avgHr: Math.round(108 + ot * 8 + r.normal(0, 4)),
    maxHr: Math.round(148 + r() * 12),
    avgSpeed: null,
    cadence: null,
    calories: Math.round((duration / 60) * 5.6),
    aerobicTE: round(1.8 + r() * 0.6, 1),
    anaerobicTE: round(1.2 + r() * 0.8 + ot, 1),
    garminLoad: null,
    elevation: null,
    vo2max: null,
    avgPower: null,
    zones: null,
    rpe: Math.round(clamp(6.5 + ot * 2 + r.normal(0, 0.7), 4, 10)),
    decoupling: null,
    strength: { sets: Math.round(18 + r() * 6), reps: Math.round(150 + r() * 70), volumeKg: Math.round(base * (0.9 + r() * 0.2) * (1 + ot * 0.25)), focus },
  };
}

const TRIMP_EST = { easy: 70, tempo: 115, intervals: 125, long: 150, strength: 50 };

function makeIntraday(today, todayRow, prevRow, scenario, r) {
  const now = new Date();
  const [y, m, d] = today.split('-').map(Number);
  const start = new Date(y, m - 1, d, 0, 0).getTime();
  const end = Math.min(now.getTime(), start + DAY_MS_LOCAL - 1);
  const bad = scenario === 'overtraining' || scenario === 'sleep_deprivation';
  const wake = scenario === 'sleep_deprivation' ? 5.75 : 7;
  const stress = [];
  const bb = [];
  let level = (prevRow?.bbMin ?? 25) + 4;
  for (let t = start; t <= end; t += 180000) {
    const h = (t - start) / 3600000;
    let s;
    if (h < wake) {
      s = (bad ? 27 : 14) + r.normal(0, 5);
      level += bad ? 0.35 : 0.75;
    } else {
      s = 30 + r.normal(0, 9);
      if (h >= 13.25 && h <= 15) s += bad ? 24 : 9;
      if (h >= 20 && h <= 23) s += bad ? 26 : 4;
      if (r() < 0.03) s += 30;
      level -= (clamp(s, 0, 100) / 100) * 0.55 + 0.05;
    }
    s = Math.round(clamp(s, 1, 99));
    level = clamp(level, 5, 100);
    stress.push([t, s]);
    bb.push([t, Math.round(level)]);
  }
  if (todayRow) {
    const vals = stress.map((p) => p[1]);
    todayRow.stress = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    todayRow.bbMax = Math.max(...bb.map((p) => p[1]));
    todayRow.bbMin = bb.at(-1)?.[1] ?? null;
  }
  return { date: today, stress, bodyBattery: bb };
}
const DAY_MS_LOCAL = 86400000;

/** Realistic multi-scenario dataset in the same shape returned by GET /api/telemetry. */
/** Two injected episodes of being unwell (days ago → intensity) so the wellness scan has something to find. */
function sickness(daysAgo) {
  if (daysAgo >= 48 && daysAgo <= 53) return [0.5, 1, 1, 0.8, 0.5, 0.25][53 - daysAgo];
  if (daysAgo >= 120 && daysAgo <= 122) return [0.7, 0.9, 0.5][122 - daysAgo];
  return 0;
}

export function generateDemo(scenario = 'balanced', totalDays = 200) {
  const r = rng(seedOf(scenario) + 42);
  const today = localToday();
  const start = addDays(today, -(totalDays - 1));
  const days = [];
  const activities = [];
  let atl = 45;
  let ctl = 50;
  let vo2 = 47.5;
  let id = 9_000_000_000;

  for (let i = 0; i < totalDays; i++) {
    const date = addDays(start, i);
    const daysAgo = totalDays - 1 - i;
    const dow = (toDate(date).getUTCDay() + 6) % 7;
    const p = phase(scenario, daysAgo);
    const progress = i / totalDays;

    let plan = PLANS.base;
    let volume = 0.85 + progress * 0.3;
    if (scenario === 'overtraining' && p > 0) {
      plan = PLANS.overload;
      volume *= 1 + 0.7 * p;
    }
    if (scenario === 'peak' && p > 0) {
      plan = PLANS.taper;
      volume *= 1 - 0.45 * p;
    }

    // ----- workouts (today is left empty: the day isn't over yet)
    const sick = sickness(daysAgo);
    const planWeek = PLAN_WEEKS.find((w) => date >= w.start && date <= w.end);
    let load = 0;
    if (daysAgo > 0 && !(r() < 0.07) && sick < 0.6) {
      for (const w of plan[dow]) {
        // from the plan start, Sunday = key session of the plan, Thursday = optional quality (if any)
        let planned = null;
        let kind = w;
        if (planWeek && dow === 6) planned = planWeek.runs.find((x) => !x.optional);
        if (planWeek && dow === 3 && w === 'intervals') planned = planWeek.runs.find((x) => x.optional) ?? null;
        if (planned) kind = PLAN_KIND[planned.type];
        const ctx = { r, date, p, scenario, progress, volume, id: id++, planned };
        if (w.startsWith('strength:')) {
          activities.push(makeStrength(w.split(':')[1], ctx));
          load += TRIMP_EST.strength * (1 + p * 0.3);
        } else {
          const run = makeRun(kind, ctx);
          run.vo2max = Math.round(vo2);
          activities.push(run);
          load += TRIMP_EST[kind] * volume;
        }
      }
    }
    atl += (load - atl) * (1 - Math.exp(-1 / 7));
    ctl += (load - ctl) * (1 - Math.exp(-1 / 42));
    const tsb = ctl - atl;
    vo2 += scenario === 'overtraining' && p > 0 ? -0.03 : 0.022;

    // ----- vitals
    const ot = scenario === 'overtraining' ? p : 0;
    const sleepy = scenario === 'sleep_deprivation' ? p : 0;
    const peak = scenario === 'peak' ? p : 0;
    const weekend = dow >= 5 ? 0.35 : 0;
    const sleepH = clamp(7.45 + weekend - sleepy * 2.4 - ot * 0.5 + r.normal(0, 0.45), 3.8, 9.8);
    const total = sleepH * 3600;
    const deepPct = clamp(0.18 - ot * 0.04 - sleepy * 0.03 + r.normal(0, 0.02), 0.07, 0.28);
    const remPct = clamp(0.22 - sleepy * 0.06 + r.normal(0, 0.025), 0.1, 0.3);
    const awake = (18 + r() * 25 + ot * 20 + sleepy * 10) * 60;
    const bedH = 23 + (r() * 0.9 - 0.3) + sleepy * 1.4;
    const startTs = localEpoch(addDays(date, -1), 0, 0) + bedH * 3600000;
    const hrv = Math.round(clamp((57 + tsb * 0.28 - ot * 11 - sleepy * 10 + peak * 6 + r.normal(0, 3.6)) * (1 - 0.32 * sick), 18, 120));
    const rhr = Math.round(REST_HR + 1 - tsb * 0.07 + ot * 6 + sleepy * 5 - peak * 2 + 8 * sick + r.normal(0, 1.1));
    const stress = Math.round(clamp(27 + ot * 13 + sleepy * 16 - tsb * 0.15 + 17 * sick + r.normal(0, 4), 8, 80));
    const bbMax = Math.round(clamp(18 + sleepH * 8.6 - Math.max(0, -tsb) * 0.35 - stress * 0.12 - 18 * sick + r.normal(0, 4), 15, 100));
    const bbMin = Math.round(clamp(bbMax - (32 + load * 0.22 + stress * 0.55 + r.normal(0, 5)), 5, bbMax - 5));
    const score = Math.round(clamp(42 + (sleepH - 5) * 11 + (deepPct - 0.15) * 120 - awake / 600 - 14 * sick + r.normal(0, 3), 20, 98));

    days.push({
      date,
      hrv,
      hrvStatus: null,
      rhr,
      stress,
      bbMax,
      bbMin,
      bbCharged: Math.max(0, bbMax - (days.at(-1)?.bbMin ?? bbMin)),
      bbDrained: bbMax - bbMin,
      steps: Math.round(6500 + r() * 3500 + activities.filter((a) => a.date === date && a.kind === 'run').reduce((s, a) => s + a.distance * 1.3, 0)),
      activeKcal: Math.round(450 + load * 4),
      sleep: {
        score,
        total: Math.round(total),
        deep: Math.round(total * deepPct),
        rem: Math.round(total * remPct),
        light: Math.round(total * (1 - deepPct - remPct)),
        awake: Math.round(awake),
        start: Math.round(startTs),
        end: Math.round(startTs + total * 1000 + awake * 1000),
      },
    });
  }

  // HRV status like Garmin: compare 7-day mean to the 60-day baseline
  days.forEach((d, i) => {
    const w = days.slice(Math.max(0, i - 6), i + 1).map((x) => x.hrv);
    const b = days.slice(Math.max(0, i - 60), i + 1).map((x) => x.hrv);
    const m7 = w.reduce((a, c) => a + c, 0) / w.length;
    const mb = b.reduce((a, c) => a + c, 0) / b.length;
    d.hrvStatus = m7 < mb * 0.8 ? 'LOW' : m7 < mb * 0.9 ? 'UNBALANCED' : 'BALANCED';
  });

  const intraday = makeIntraday(today, days.at(-1), days.at(-2), scenario, r);
  return {
    source: 'demo',
    scenario,
    generatedAt: new Date().toISOString(),
    today,
    days,
    intraday,
    activities,
    profile: {
      vo2max: round(vo2, 1),
      racePredictions: null,
      hrZones: { sport: 'RUNNING', method: 'HR_RESERVE', maxHr: 195, restHr: 57, lthr: null, floors: [97, 137, 155, 167, 183] },
      lactateThreshold: { hr: 174, speed: null, date: addDays(today, -20) },
    },
  };
}
