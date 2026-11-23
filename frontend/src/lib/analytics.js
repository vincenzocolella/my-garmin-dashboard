import {
  addDays, clamp, dateRange, diffDays, fmt, fmtH, isNum, linreg, mean, pctChange, round, sd, sum, weekStart,
} from './util';
import { detectIllness, episodeStats } from './illness';
import { planStatus } from './plan';
import { zoneConfig, zoneOf } from './zones';

/** Strength sessions feed the PMC with half of their session-RPE load (neuromuscular fatigue is only partly systemic). */
const PMC_STRENGTH_FACTOR = 0.5;
export const FOCUS_OPTIONS = ['Upper', 'Lower', 'Full Body', 'Core'];

const startMs = (a) => Date.parse(`${(a.start || `${a.date} 12:00:00`).replace(' ', 'T')}Z`);

/**
 * Readiness scale, shared by every component: 75 = your usual level, each standard deviation of difference
 * from your own baseline is worth 15 points (+1 SD → 90, −1 SD → 60, −2 SD → 45). `z` oriented so positive = better.
 */
export const zToScore = (z) => (isNum(z) ? clamp(75 + 15 * z) : null);
/** Sleep length vs need: on target = 100, every missing hour −20, oversleeping beyond need + 1h30 costs a little. */
const durScore = (h, need) => (isNum(h) ? clamp(100 - Math.max(0, need - h) * 20 - Math.max(0, h - need - 1.5) * 10) : null);

export function readinessBand(score) {
  if (!isNum(score)) return { label: '—', tone: 'neutral' };
  if (score >= 85) return { label: 'Sopra la tua norma', tone: 'good' };
  if (score >= 65) return { label: 'Nella tua norma', tone: 'good' };
  if (score >= 50) return { label: 'Ridotta', tone: 'warn' };
  return { label: 'Bassa', tone: 'bad' };
}

function weighted(parts) {
  const ok = parts.filter(([v]) => isNum(v));
  const w = sum(ok.map(([, wt]) => wt));
  return w ? sum(ok.map(([v, wt]) => v * wt)) / w : null;
}

function stats(values, minSd, minN = 1) {
  const v = values.filter(isNum);
  if (v.length < minN) return { mean: null, sd: minSd, n: v.length };
  const s = sd(v);
  return { mean: mean(v), sd: isNum(s) ? Math.max(s, minSd) : minSd, n: v.length };
}

/** HRV is log-normal: baselines are computed on ln(ms) (Plews, Altini). */
function lnStats(values) {
  const v = values.filter((x) => isNum(x) && x > 0).map(Math.log);
  if (v.length < 7) return null;
  return { mean: mean(v), sd: Math.max(sd(v) ?? 0, 0.05), n: v.length };
}

/** Standard normal CDF (Abramowitz-Stegun), used to turn population z-scores into percentiles. */
const phi = (z) => {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
};
const lerp = (x, pts) => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) return pts[i - 1][1] + ((x - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0])) * (pts[i][1] - pts[i - 1][1]);
  return pts.at(-1)[1];
};
// FRIEND registry (Kaminsky 2015) median VO2max by age, ml/kg/min
const VO2_MEDIAN = { M: [[25, 48], [35, 42.4], [45, 37.8], [55, 32.6], [65, 28.2], [75, 24.4]], F: [[25, 37.6], [35, 30.9], [45, 27.9], [55, 24.2], [65, 20.7], [75, 18.3]] };

// --------------------------------------------------------------------- running science
const vo2Cost = (v) => -4.6 + 0.182258 * v + 0.000104 * v * v; // Daniels, v in m/min
const pctVo2 = (t) => 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
export const vdotFromRace = (distM, sec) => vo2Cost(distM / (sec / 60)) / pctVo2(sec / 60);
export function timeForVdot(vdot, distM) {
  let lo = (distM / 1000) * 2;
  let hi = (distM / 1000) * 12;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (vdotFromRace(distM, mid * 60) > vdot) lo = mid;
    else hi = mid;
  }
  return ((lo + hi) / 2) * 60;
}
export const RACES = [
  { key: '5k', label: '5K', m: 5000, volPenalty: 0 },
  { key: '10k', label: '10K', m: 10000, volPenalty: 0.03 },
  { key: 'half', label: 'Mezza', m: 21097.5, volPenalty: 0.07 },
  { key: 'marathon', label: 'Maratona', m: 42195, volPenalty: 0.13 },
];

// --------------------------------------------------------------------- activities
export function normalizeActivities(dataset, overrides = {}) {
  return [...(dataset?.activities ?? [])]
    .filter((a) => a.date)
    .map((a) => {
      const o = overrides[a.id] ?? {};
      return {
        ...a,
        rpe: isNum(o.rpe) ? o.rpe : a.rpe,
        strength: a.kind === 'strength' ? { ...(a.strength ?? {}), ...(o.focus ? { focus: o.focus } : {}) } : a.strength,
      };
    })
    .sort((x, y) => startMs(x) - startMs(y));
}

function estimateZones(a, prof) {
  if (a.zones?.some((z) => z > 0)) return a.zones;
  if (!isNum(a.avgHr) || !a.duration) return null;
  const z = zoneOf(a.avgHr, prof.zones) - 1;
  return [0, 1, 2, 3, 4].map((i) => (i === z ? a.duration : 0));
}

function enrich(a, prof) {
  const hrr = isNum(a.avgHr) ? clamp((a.avgHr - prof.restHr) / (prof.maxHr - prof.restHr), 0, 1) : null;
  const trimp = isNum(hrr) && a.duration ? (a.duration / 60) * hrr * 0.64 * Math.exp(1.92 * hrr) : null;
  const nmLoad = a.kind === 'strength' ? ((a.duration || 0) / 60) * (a.rpe ?? 6.5) / 4 : 0;
  const cardioLoad = a.kind === 'strength' ? 0 : trimp ?? a.garminLoad ?? ((a.duration || 0) / 60) * 5;
  const zones = a.kind === 'strength' ? null : estimateZones(a, prof);
  const zTot = zones ? sum(zones) : 0;
  const highPct = zTot ? ((zones[3] + zones[4]) / zTot) * 100 : null;
  const midUpPct = zTot ? ((zones[2] + zones[3] + zones[4]) / zTot) * 100 : null;
  const speed = a.avgSpeed || (a.distance && a.duration ? a.distance / a.duration : null);
  const pace = speed ? 1000 / speed : null;
  const ef = speed && isNum(a.avgHr) ? (speed * 60) / a.avgHr : null;
  const hard = (a.anaerobicTE ?? 0) >= 2.5 || (highPct ?? 0) >= 25 || (hrr ?? 0) >= 0.82;
  const long = a.kind === 'run' && (a.duration >= 85 * 60 || a.distance >= 16000);
  const intendedEasy = a.kind === 'run' && !hard && !long && (a.aerobicTE ?? 0) <= 3.3 && (a.anaerobicTE ?? 0) < 1;
  const easyTooHard = intendedEasy && (isNum(midUpPct) ? midUpPct > 30 : (hrr ?? 0) > 0.72);
  return {
    ...a,
    hrr,
    trimp,
    cardioLoad,
    nmLoad,
    pmcLoad: a.kind === 'strength' ? nmLoad * PMC_STRENGTH_FACTOR : cardioLoad,
    zones,
    highPct,
    pace,
    ef,
    hard,
    long,
    intendedEasy,
    easyTooHard,
    startTs: startMs(a),
  };
}

// --------------------------------------------------------------------- main
export function computeAnalytics(dataset, { rangeDays: rangeIn = 30, settings = {}, overrides = {} } = {}) {
  const today = dataset.today;
  const need = Number(settings.sleepNeedH) || 8;

  // ---- range: a number of days, or 'max' = every day the browser has
  const firstWithData = (dataset.days ?? []).find((d) => isNum(d.hrv) || isNum(d.rhr) || d.sleep || isNum(d.steps))?.date;
  const isMax = rangeIn === 'max';
  const rangeDays = isMax ? Math.max(30, firstWithData ? diffDays(today, firstWithData) + 1 : 30) : Number(rangeIn) || 30;
  const rangeStart = addDays(today, -(rangeDays - 1));
  const rangeLabel = isMax ? `tutto lo storico (${rangeDays} gg)` : `ultimi ${rangeDays} giorni`;

  // ---- day rows, gap-filled
  const byDate = new Map((dataset.days ?? []).map((d) => [d.date, d]));
  const firstDay = dataset.days?.[0]?.date ?? rangeStart;
  const allDates = dateRange(firstDay < rangeStart ? firstDay : rangeStart, today);
  const rows = allDates.map((date) => byDate.get(date) ?? { date, sleep: null });
  const inRange = (date) => date >= rangeStart && date <= today;

  // ---- HR profile
  const rawActs = normalizeActivities(dataset, overrides);
  const hrZoneCfg = zoneConfig(dataset, settings);
  const prof = {
    maxHr: Number(settings.maxHr) || hrZoneCfg.maxHr,
    restHr: Number(settings.restHr) || hrZoneCfg.restHr,
    maxHrSource: Number(settings.maxHr) ? 'manuale' : hrZoneCfg.source === 'garmin' ? 'Garmin Connect' : 'standard',
    zones: hrZoneCfg,
  };
  const acts = rawActs.map((a) => enrich(a, prof));
  const actsInRange = acts.filter((a) => inRange(a.date));

  // ---- PMC (CTL 42d, ATL 7d, TSB, ACWR): computed first, yesterday's load is a readiness component
  const loadByDate = new Map();
  for (const a of acts) loadByDate.set(a.date, (loadByDate.get(a.date) ?? 0) + a.pmcLoad);
  const pmcStart = acts.length && acts[0].date < addDays(rangeStart, -42) ? acts[0].date : addDays(rangeStart, -42);
  const pmcDates = dateRange(pmcStart, today);
  const dailyLoads = pmcDates.map((d) => loadByDate.get(d) ?? 0);
  let ctl = mean(dailyLoads.slice(0, 28)) ?? 0;
  let atl = ctl;
  const kC = 1 - Math.exp(-1 / 42);
  const kA = 1 - Math.exp(-1 / 7);
  const pmcAll = pmcDates.map((date, i) => {
    const load = dailyLoads[i];
    ctl += (load - ctl) * kC;
    atl += (load - atl) * kA;
    const a7 = sum(dailyLoads.slice(Math.max(0, i - 6), i + 1)) / 7;
    const c28 = sum(dailyLoads.slice(Math.max(0, i - 27), i + 1)) / 28;
    return { date, load: round(load), ctl: round(ctl, 1), atl: round(atl, 1), tsb: round(ctl - atl, 1), acwr: c28 > 5 && i >= 27 ? round(a7 / c28, 2) : null };
  });
  const pmcByDate = new Map(pmcAll.map((r) => [r.date, r]));

  // ---- readiness: "how recovered am I this morning, compared with my own normal?"
  // Baselines = your previous 60 days. Weights: nervous system 40%, sleep 30%, yesterday's stress 15%, training load 15%.
  const BASE_DAYS = 60;
  const lnOf = (r) => (r?.hrv > 0 ? Math.log(r.hrv) : null);
  const hrsOf = (r) => (r?.sleep?.total ? r.sleep.total / 3600 : null);
  const readinessAt = (i) => {
    const d = rows[i];
    const prev = rows.slice(Math.max(0, i - BASE_DAYS), i);
    const hb = lnStats(prev.map((r) => r.hrv));
    const rb = stats(prev.map((r) => r.rhr), 1.5, 7);
    const hrvZ = isNum(lnOf(d)) && hb ? (lnOf(d) - hb.mean) / hb.sd : null;
    const week = rows.slice(Math.max(0, i - 6), i + 1).map(lnOf).filter(isNum);
    const hrv7 = week.length >= 3 ? mean(week) : null;
    // the 7-day mean is compared with the "smallest worthwhile change" band (±0.5 SD): one SWC away = 1 unit
    const hrv7Z = isNum(hrv7) && hb ? (hrv7 - hb.mean) / (0.5 * hb.sd) : null;
    const rhrZ = isNum(d.rhr) && isNum(rb.mean) ? -(d.rhr - rb.mean) / rb.sd : null;
    const autonomic = weighted([[zToScore(hrv7Z), 0.4], [zToScore(hrvZ), 0.3], [zToScore(rhrZ), 0.3]]);

    const last3 = rows.slice(Math.max(0, i - 2), i + 1).map(hrsOf).filter(isNum);
    const sleepS = weighted([[d.sleep?.score ?? null, 0.4], [durScore(hrsOf(d), need), 0.35], [last3.length >= 2 ? durScore(mean(last3), need) : null, 0.25]]);

    const y = rows[i - 1];
    const sb = stats(rows.slice(Math.max(0, i - 1 - BASE_DAYS), Math.max(0, i - 1)).map((r) => r.stress), 4, 7);
    const stressZ = isNum(y?.stress) && isNum(sb.mean) ? -(y.stress - sb.mean) / sb.sd : null;

    const p = pmcByDate.get(addDays(d.date, -1));
    const loadRatio = p && (p.ctl >= 5 || p.atl >= 5) ? p.atl / Math.max(p.ctl, 10) : null;
    const loadS = isNum(loadRatio) ? clamp(75 - (loadRatio - 1) * 60, 0, 90) : null;

    const stressS = zToScore(stressZ);
    const hbMs = hb ? { mean: Math.exp(hb.mean), sd: Math.exp(hb.mean) * hb.sd, lo: Math.exp(hb.mean - hb.sd), hi: Math.exp(hb.mean + hb.sd), swcLo: Math.exp(hb.mean - 0.5 * hb.sd), swcHi: Math.exp(hb.mean + 0.5 * hb.sd), n: hb.n } : { mean: null, sd: null };
    return {
      date: d.date,
      score: round(weighted([[autonomic, 0.4], [sleepS, 0.3], [stressS, 0.15], [loadS, 0.15]])),
      autonomic: round(autonomic), sleep: round(sleepS), stress: round(stressS), load: round(loadS),
      hrv: round(zToScore(hrvZ)), hrv7: round(zToScore(hrv7Z)), rhr: round(zToScore(rhrZ)),
      hrvZ, hrv7Z, rhrZ, stressZ, loadRatio: round(loadRatio, 2),
      hrv7ms: isNum(hrv7) ? round(Math.exp(hrv7), 1) : null,
      hrvPct: isNum(hrvZ) ? round((d.hrv / hbMs.mean - 1) * 100) : null,
      rhrDelta: isNum(d.rhr) && isNum(rb.mean) ? d.rhr - rb.mean : null,
      stressYesterday: y?.stress ?? null, stressBase: sb.mean,
      hrvBase: hbMs, rhrBase: rb,
    };
  };
  const readinessSeries = rows.map((_, i) => readinessAt(i));
  let latestIdx = rows.length - 1;
  while (latestIdx > 0 && !isNum(rows[latestIdx].hrv) && !rows[latestIdx].sleep) latestIdx--;
  const latest = rows[latestIdx];
  const ready = readinessSeries[latestIdx];
  const prev30Ready = readinessSeries.slice(Math.max(0, latestIdx - 30), latestIdx).map((r) => r.score);
  const rangeReady = readinessSeries.filter((r) => inRange(r.date));
  const readiness = {
    ...ready,
    band: readinessBand(ready.score),
    baselineMean: round(mean(prev30Ready)),
    delta: isNum(ready.score) && isNum(mean(prev30Ready)) ? round(ready.score - mean(prev30Ready)) : null,
    series: rangeReady,
    periodMean: round(mean(rangeReady.map((r) => r.score))),
    lowDays: rangeReady.filter((r) => isNum(r.score) && r.score < 50).length,
    highDays: rangeReady.filter((r) => isNum(r.score) && r.score >= 85).length,
  };

  // ---- longevity: long-term habits and fitness against population evidence (not against yourself)
  const vo2Current = dataset.profile?.vo2max ?? [...acts].reverse().find((a) => isNum(a.vo2max))?.vo2max ?? null;
  const longevity = longevityIndex({ rows, acts, today, rangeDays, need, vo2: vo2Current, settings, profile: dataset.profile });

  // ---- HRV / RHR matrix: daily values, 7-day rolling HRV and its normal band (baseline ± 0.5 SD)
  const hrvRhr = rows
    .map((r, i) => {
      const b = readinessSeries[i];
      return {
        date: r.date,
        hrv: r.hrv ?? null,
        hrv7: b.hrv7ms,
        rhr: r.rhr ?? null,
        lo: round(b.hrvBase.swcLo, 1) ?? null,
        hi: round(b.hrvBase.swcHi, 1) ?? null,
        base: round(b.hrvBase.mean, 1),
        rhrBase: round(b.rhrBase.mean, 1),
        status: r.hrvStatus ?? null,
      };
    })
    .filter((r) => inRange(r.date));
  const hrvTrend = (() => {
    const lastN = rows.slice(Math.max(0, latestIdx - 2), latestIdx + 1);
    const b = readinessSeries[latestIdx].hrvBase.mean;
    const below = lastN.every((r) => isNum(r.hrv) && isNum(b) && r.hrv < b);
    const t = (key) => {
      const reg = linreg(hrvRhr.map((r, i) => ({ x: i, y: r[key] })));
      return reg ? reg.slope * (hrvRhr.length - 1) : null;
    };
    const hrvAvg = mean(hrvRhr.map((r) => r.hrv));
    return {
      consecutiveBelow: below ? lastN.length : 0,
      pct3d: pctChange(mean(lastN.map((r) => r.hrv)), b),
      period: {
        hrv: round(hrvAvg, 1),
        rhr: round(mean(hrvRhr.map((r) => r.rhr)), 1),
        hrvChangePct: isNum(t('hrv')) && hrvAvg ? round((t('hrv') / hrvAvg) * 100) : null,
        rhrChange: round(t('rhr'), 1),
      },
    };
  })();

  // ---- sleep architecture & debt (debt is always the last 7 nights; the rest follows the selected range)
  const sleepRows = rows.filter((r) => inRange(r.date)).map((r) => {
    const s = r.sleep;
    const h = (x) => (isNum(x) ? round(x / 3600, 2) : null);
    return {
      date: r.date,
      deep: h(s?.deep), rem: h(s?.rem), light: h(s?.light), awake: h(s?.awake), total: h(s?.total),
      score: s?.score ?? null,
      efficiency: s?.total ? round((s.total / (s.total + (s.awake || 0))) * 100, 1) : null,
    };
  });
  const last7Sleep = rows.slice(Math.max(0, latestIdx - 6), latestIdx + 1).map(hrsOf);
  const sleepDeficit = sum(last7Sleep.filter(isNum).map((h) => need - h));
  const pctOf = (rs, k) => round(mean(rs.map((r) => (r.total ? (r[k] / r.total) * 100 : null))), 1);
  const last7Rows = sleepRows.slice(-7);
  const sleep = {
    rows: sleepRows,
    need,
    debt7: round(Math.max(0, sleepDeficit), 1),
    surplus7: round(Math.max(0, -sleepDeficit), 1),
    avg7: round(mean(last7Sleep), 2),
    efficiency7: round(mean(last7Rows.map((r) => r.efficiency)), 1),
    score7: round(mean(last7Rows.map((r) => r.score))),
    deepPct7: pctOf(last7Rows, 'deep'),
    remPct7: pctOf(last7Rows, 'rem'),
    period: {
      avg: round(mean(sleepRows.map((r) => r.total)), 2),
      score: round(mean(sleepRows.map((r) => r.score))),
      efficiency: round(mean(sleepRows.map((r) => r.efficiency)), 1),
      deepPct: pctOf(sleepRows, 'deep'),
      remPct: pctOf(sleepRows, 'rem'),
      nights: sleepRows.filter((r) => r.total).length,
      shortNights: sleepRows.filter((r) => r.total && r.total < 6).length,
    },
    lastNight: latest.sleep ? { ...latest.sleep, hours: round(latest.sleep.total / 3600, 2) } : null,
    ...sleepPatterns(rows.slice(Math.max(0, latestIdx - Math.max(7, Math.min(rangeDays, 90)) + 1), latestIdx + 1), rows.filter((r) => inRange(r.date))),
    shortNights14: rows.slice(Math.max(0, latestIdx - 13), latestIdx + 1).filter((r) => r.sleep?.total && r.sleep.total < 6 * 3600).length,
  };

  // ---- autonomic nervous system: intraday + daily
  const ansDaily = rows.filter((r) => inRange(r.date)).map((r) => ({
    date: r.date, stress: r.stress ?? null, bbCharged: r.bbCharged ?? null, bbDrained: r.bbDrained ?? null, bbMax: r.bbMax ?? null,
  }));
  const complete = ansDaily.filter((r) => r.date < today);
  const ans = {
    intraday: buildIntraday(dataset.intraday, byDate.get(dataset.intraday?.date)),
    daily: ansDaily,
    period: {
      stress: round(mean(complete.map((r) => r.stress))),
      charged: round(mean(complete.map((r) => r.bbCharged))),
      drained: round(mean(complete.map((r) => r.bbDrained))),
      bbMax: round(mean(complete.map((r) => r.bbMax))),
      deficitDays: complete.filter((r) => isNum(r.bbCharged) && isNum(r.bbDrained) && r.bbDrained > r.bbCharged + 5).length,
      days: complete.filter((r) => isNum(r.bbCharged) || isNum(r.stress)).length,
    },
  };

  // ---- PMC views
  const pmcRows = pmcAll.filter((r) => inRange(r.date));
  // today is usually not over: until something is logged, report the last completed day
  const pmcLatest = pmcAll.at(-1)?.load > 0 || pmcAll.length < 2 ? pmcAll.at(-1) : pmcAll.at(-2);
  const acwrPeak = pmcAll.slice(-14).reduce((best, r) => ((r.acwr ?? 0) > (best?.acwr ?? 0) ? r : best), null);
  const pmc = {
    rows: pmcRows,
    latest: pmcLatest,
    ctlChange: round((pmcLatest?.ctl ?? 0) - (pmcRows[0]?.ctl ?? 0), 1),
    zone: tsbZone(pmcLatest?.tsb),
    acwrPeak14: acwrPeak ? { date: acwrPeak.date, value: acwrPeak.acwr } : null,
    load7: round(sum(dailyLoads.slice(-7))),
    load28avg7: round(sum(dailyLoads.slice(-28)) / 4),
    rampRate: round((pmcLatest?.ctl ?? 0) - (pmcAll.at(-8)?.ctl ?? 0), 1), // CTL points per week
  };

  // ---- running analytics
  const runs = actsInRange.filter((a) => a.kind === 'run');
  const runsWithEf = runs.filter((a) => isNum(a.ef));
  const easyRuns = runsWithEf.filter((a) => !a.hard && !a.long);
  const efReg = linreg(easyRuns.map((a) => ({ x: diffDays(a.date, rangeStart), y: a.ef })));
  const efMean = mean(easyRuns.map((a) => a.ef));
  const efficiency = {
    points: runsWithEf.map((a) => ({ x: a.startTs, y: round(a.ef, 3), date: a.date, hard: a.hard, long: a.long, pace: a.pace, hr: a.avgHr, name: a.name })),
    trendPct: efReg && efMean ? round(((efReg.slope * rangeDays) / efMean) * 100, 1) : null,
    reg: efReg,
    rangeStartMs: Date.parse(`${rangeStart}T00:00:00Z`),
    avgDecoupling: round(mean(runs.slice(-8).map((a) => a.decoupling)), 1),
    highDecoupling: runs.filter((a) => (a.decoupling ?? 0) > 5).length,
  };

  const zoneTotals = [0, 0, 0, 0, 0];
  runs.forEach((a) => a.zones?.forEach((z, i) => (zoneTotals[i] += z || 0)));
  const zTot = sum(zoneTotals);
  const weeks = dateRange(weekStart(rangeStart), weekStart(today)).filter((d, i) => i % 7 === 0);
  const zones = {
    totals: zoneTotals,
    pct: zTot
      ? { low: round(((zoneTotals[0] + zoneTotals[1]) / zTot) * 100), mid: round((zoneTotals[2] / zTot) * 100), high: round(((zoneTotals[3] + zoneTotals[4]) / zTot) * 100) }
      : null,
    weekly: weeks.map((w) => {
      const t = [0, 0, 0, 0, 0];
      runs.filter((a) => weekStart(a.date) === w).forEach((a) => a.zones?.forEach((z, i) => (t[i] += z || 0)));
      return { date: w, low: round((t[0] + t[1]) / 3600, 2), mid: round(t[2] / 3600, 2), high: round((t[3] + t[4]) / 3600, 2) };
    }),
    easyTooHard: runs.filter((a) => a.easyTooHard).length,
    easyCount: runs.filter((a) => a.intendedEasy).length,
  };

  const runs28 = acts.filter((a) => a.kind === 'run' && diffDays(today, a.date) < 28);
  const weeklyKm = sum(runs28.map((a) => a.distance)) / 1000 / 4;
  const bestEffortVdot = Math.max(0, ...acts.filter((a) => a.kind === 'run' && a.distance >= 3000 && diffDays(today, a.date) < 60).map((a) => vdotFromRace(a.distance, a.duration)));
  const vdot = vo2Current ?? (bestEffortVdot > 0 ? bestEffortVdot : null);
  const race = {
    vo2max: vo2Current,
    vdotSource: vo2Current ? 'VO2max Garmin' : 'miglior sforzo recente',
    weeklyKm: round(weeklyKm, 1),
    vo2Series: acts.filter((a) => isNum(a.vo2max) && inRange(a.date)).map((a) => ({ date: a.date, vo2max: a.vo2max })),
    predictions: RACES.map((r) => {
      const base = isNum(vdot) ? timeForVdot(vdot, r.m) : null;
      const penalty = 1 + clamp((40 - weeklyKm) / 40, 0, 1) * r.volPenalty;
      const garmin = dataset.profile?.racePredictions?.[r.key] ?? null;
      return { ...r, model: isNum(base) ? base * penalty : null, garmin, pace: isNum(base) ? (base * penalty) / (r.m / 1000) : null };
    }),
  };

  // ---- strength & hybrid
  const strengthSessions = actsInRange.filter((a) => a.kind === 'strength');
  const strengthWeeks = weeks.map((w) => {
    const wk = actsInRange.filter((a) => weekStart(a.date) === w);
    const st = wk.filter((a) => a.kind === 'strength');
    return {
      date: w,
      cardio: round(sum(wk.map((a) => a.cardioLoad))),
      nm: round(sum(wk.map((a) => a.nmLoad))),
      tonnage: round(sum(st.map((a) => a.strength?.volumeKg))),
      sessions: st.length,
      runs: wk.filter((a) => a.kind === 'run').length,
      km: round(sum(wk.filter((a) => a.kind === 'run').map((a) => a.distance)) / 1000, 1),
    };
  });

  const conflicts = [];
  const legDay = (s) => ['Lower', 'Full Body'].includes(s.strength?.focus) || !s.strength?.focus;
  const runsAll = acts.filter((a) => a.kind === 'run');
  for (const s of acts.filter((a) => a.kind === 'strength' && legDay(a) && diffDays(today, a.date) < rangeDays + 2)) {
    for (const r of runsAll) {
      const gapH = (r.startTs - s.startTs) / 3600000;
      if (gapH > 0 && gapH <= 48 && (r.hard || r.long)) {
        conflicts.push({ date: s.date, kind: 'leg→run', severity: gapH <= 24 ? 'high' : 'medium', gapH: round(gapH), strength: s, run: r });
      }
      if (gapH < 0 && gapH >= -20 && r.hard && s.strength?.focus !== 'Upper') {
        conflicts.push({ date: r.date, kind: 'run→leg', severity: 'medium', gapH: round(-gapH), strength: s, run: r });
      }
    }
  }

  const last7 = acts.filter((a) => diffDays(today, a.date) < 7);
  const prev28 = acts.filter((a) => diffDays(today, a.date) < 28);
  const ratio = (a, b) => (b > 0 ? a / (b / 4) : a > 0 ? 2 : 0);
  const cardio7 = sum(last7.map((a) => a.cardioLoad));
  const nm7 = sum(last7.map((a) => a.nmLoad));
  const z7 = last7.filter((a) => a.kind === 'run' && a.zones).reduce((t, a) => t.map((v, i) => v + (a.zones[i] || 0)), [0, 0, 0, 0, 0]);
  const radar = [
    { label: 'Carico cardio', value: clamp(ratio(cardio7, sum(prev28.map((a) => a.cardioLoad))) * 50) },
    { label: 'Carico forza', value: clamp(ratio(nm7, sum(prev28.map((a) => a.nmLoad))) * 50) },
    { label: 'Intensità', value: sum(z7) ? clamp(((z7[3] + z7[4]) / sum(z7)) * 100 * 2.5) : 0 },
    { label: 'Recupero', value: readiness.score ?? 0 },
    { label: 'Sonno', value: isNum(sleep.avg7) ? clamp((sleep.avg7 / need) * 100) : 0 },
    { label: 'Freschezza', value: clamp(50 + (pmcLatest?.tsb ?? 0) * 1.5) },
  ].map((x) => ({ ...x, value: round(x.value) }));

  const strength = {
    sessions: [...strengthSessions].reverse(),
    weekly: strengthWeeks,
    conflicts: conflicts.sort((a, b) => b.strength.startTs - a.strength.startTs),
    radar,
    perWeek: round(strengthSessions.length / (rangeDays / 7), 1),
    nmShare: round((sum(actsInRange.map((a) => a.nmLoad)) / Math.max(1, sum(actsInRange.map((a) => a.nmLoad + a.cardioLoad)))) * 100),
    tonnage: round(sum(strengthSessions.map((a) => a.strength?.volumeKg))),
    avgRpe: round(mean(strengthSessions.map((a) => a.rpe)), 1),
  };

  const illness = detectIllness(rows, acts, { sensitivity: settings.illnessSensitivity, today });
  // the symptom radar follows the selected range, with at least 30 days (episodes need context)
  const illStart = addDays(today, -(Math.max(30, rangeDays) - 1));
  const illEpisodes = illness.episodes.filter((e) => e.end >= illStart);
  illness.view = { start: illStart, days: Math.max(30, rangeDays), series: illness.series.filter((d) => d.date >= illStart), episodes: illEpisodes, stats: episodeStats(illEpisodes) };

  const result = {
    today, rangeStart, rangeDays, rangeLabel, isMax, source: dataset.source, scenario: dataset.scenario, illness, hrZoneCfg,
    rowsAll: rows, readinessAll: readinessSeries,
    profile: prof,
    latest, latestDate: latest.date,
    readiness, longevity, hrvRhr, hrvTrend, sleep, ans, pmc,
    activities: acts, runs: [...runs].reverse(), efficiency, zones, race, strength,
    totals: {
      runs: runs.length,
      km: round(sum(runs.map((a) => a.distance)) / 1000, 1),
      hours: round(sum(actsInRange.map((a) => a.duration)) / 3600, 1),
      strength: strengthSessions.length,
    },
  };
  result.plan = planStatus(result);
  return result;
}

// Bed/wake time regularity and how sleep drives the next HRV reading.
function sleepPatterns(last14, range) {
  // Garmin "local" timestamps are wall-clock encoded as UTC; hours after noon wrap to negative so 23:30 → -0.5
  const hourOf = (ts, wrap) => {
    if (!isNum(ts)) return null;
    const d = new Date(ts);
    const h = d.getUTCHours() + d.getUTCMinutes() / 60;
    return wrap && h > 12 ? h - 24 : h;
  };
  const beds = last14.map((r) => hourOf(r.sleep?.start, true)).filter(isNum);
  const wakes = last14.map((r) => hourOf(r.sleep?.end, false)).filter(isNum);
  const pairs = range.filter((r) => isNum(r.hrv) && r.sleep?.total).map((r) => ({ x: r.sleep.total / 3600, y: r.hrv }));
  let corr = null;
  if (pairs.length >= 7) {
    const mx = mean(pairs.map((p) => p.x));
    const my = mean(pairs.map((p) => p.y));
    const sxy = sum(pairs.map((p) => (p.x - mx) * (p.y - my)));
    const sxx = sum(pairs.map((p) => (p.x - mx) ** 2));
    const syy = sum(pairs.map((p) => (p.y - my) ** 2));
    corr = sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
  }
  const reg = linreg(pairs);
  const fmtClock = (h) => (isNum(h) ? `${String(Math.floor((h + 24) % 24)).padStart(2, '0')}:${String(Math.round((((h % 1) + 1) % 1) * 60) % 60).padStart(2, '0')}` : null);
  return {
    bedtimeAvg: fmtClock(mean(beds)),
    wakeAvg: fmtClock(mean(wakes)),
    bedtimeSdMin: isNum(sd(beds)) ? Math.round(sd(beds) * 60) : null,
    wakeSdMin: isNum(sd(wakes)) ? Math.round(sd(wakes) * 60) : null,
    sleepHrvCorr: round(corr, 2),
    hrvPerHour: reg ? round(reg.slope, 1) : null, // ms of HRV per extra hour of sleep
    shortNights14: last14.filter((r) => r.sleep?.total && r.sleep.total < 6 * 3600).length,
  };
}

export function tsbZone(tsb) {
  if (!isNum(tsb)) return null;
  if (tsb > 20) return { key: 'transition', label: 'Transizione', tone: 'info' };
  if (tsb > 5) return { key: 'fresh', label: 'Freschezza', tone: 'good' };
  if (tsb > -10) return { key: 'neutral', label: 'Zona grigia', tone: 'neutral' };
  if (tsb > -30) return { key: 'optimal', label: 'Ottimale', tone: 'good' };
  return { key: 'risk', label: 'Alto rischio', tone: 'bad' };
}

// --------------------------------------------------------------------- intraday
function buildIntraday(intraday, dayRow) {
  if (!intraday || (!intraday.stress?.length && !intraday.bodyBattery?.length)) return null;
  const [y, m, d] = intraday.date.split('-').map(Number);
  const start = new Date(y, m - 1, d).getTime();
  const BIN = 15 * 60000;
  const bins = Array.from({ length: 96 }, (_, i) => ({
    label: `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`,
    s: [],
    bb: null,
  }));
  let lastIdx = -1;
  for (const [t, v] of intraday.stress ?? []) {
    const i = Math.floor((t - start) / BIN);
    if (i < 0 || i > 95) continue;
    lastIdx = Math.max(lastIdx, i);
    if (v >= 0) bins[i].s.push(v);
  }
  for (const [t, v] of intraday.bodyBattery ?? []) {
    const i = Math.floor((t - start) / BIN);
    if (i < 0 || i > 95) continue;
    lastIdx = Math.max(lastIdx, i);
    bins[i].bb = v;
  }
  if (lastIdx < 0) return null;
  let bb = null;
  const rows = bins.slice(0, lastIdx + 1).map((b) => {
    bb = b.bb ?? bb;
    return { label: b.label, stress: b.s.length ? Math.round(mean(b.s)) : null, bb };
  });

  // sleep window, from Garmin "local" timestamps (wall clock encoded as UTC)
  let sleepFrom = 0;
  let sleepTo = null;
  if (dayRow?.sleep?.end) {
    const e = new Date(dayRow.sleep.end);
    sleepTo = Math.min(rows.length - 1, e.getUTCHours() * 4 + Math.floor(e.getUTCMinutes() / 15));
    const s = new Date(dayRow.sleep.start);
    if (s.toISOString().slice(0, 10) === intraday.date) sleepFrom = s.getUTCHours() * 4 + Math.floor(s.getUTCMinutes() / 15);
  }
  const avgIn = (a, b) => mean(rows.slice(a, b + 1).map((r) => r.stress));
  const windows = [];
  const dayMean = mean(rows.slice(sleepTo ?? 0).map((r) => r.stress));
  let nightStress = null;
  let bbGain = null;
  if (sleepTo != null && sleepTo > sleepFrom) {
    nightStress = round(avgIn(sleepFrom, sleepTo));
    const bbVals = rows.slice(sleepFrom, sleepTo + 1).map((r) => r.bb).filter(isNum);
    bbGain = bbVals.length > 1 ? bbVals.at(-1) - Math.min(...bbVals) : null;
    const bad = (nightStress ?? 0) > 22 || (isNum(bbGain) && bbGain < 25);
    windows.push({ from: sleepFrom, to: sleepTo, tone: bad ? 'bad' : 'good', label: bad ? 'Recupero notturno inefficace' : 'Sonno / ricarica' });
  }
  const check = (fromH, toH, label) => {
    const a = fromH * 4;
    const b = Math.min(rows.length - 1, toH * 4);
    if (b - a < 4) return;
    const v = avgIn(a, b);
    if (isNum(v) && v > 40 && v > (dayMean ?? 0) + 5) windows.push({ from: a, to: b, tone: 'warn', label: `${label} (${Math.round(v)})` });
  };
  check(13, 15.5, 'Stress post-prandiale');
  check(19, 23, 'Stress serale');
  // sustained peaks: >= 45 min above 60
  let runStart = null;
  rows.forEach((r, i) => {
    const high = (r.stress ?? 0) >= 60;
    if (high && runStart == null) runStart = i;
    if ((!high || i === rows.length - 1) && runStart != null) {
      const end = high ? i : i - 1;
      if (end - runStart >= 2) windows.push({ from: runStart, to: end, tone: 'bad', label: 'Picco di stress prolungato' });
      runStart = null;
    }
  });
  return { rows, windows, nightStress, bbGain, sleepFrom, sleepTo, dayMean: round(dayMean), current: rows.at(-1) };
}


// --------------------------------------------------------------------- longevity
/**
 * Long-term health index: each marker is scored 0-100 against population evidence (0 = high-risk band,
 * 100 = lowest-risk band) and weighted by how strongly it predicts all-cause mortality in the literature.
 * Window = selected range, at least 30 days (these are habits, a single week means little).
 */
function longevityIndex({ rows, acts, today, rangeDays, need, vo2, settings, profile }) {
  const days = Math.max(30, rangeDays);
  const start = addDays(today, -days);
  const done = rows.filter((r) => r.date >= start && r.date < today); // complete days
  const nights = rows.filter((r) => r.date > start && r.date <= today); // nights ending inside the window
  const ageSet = Number(settings.age) || profile?.age || null;
  const sexSet = settings.sex || profile?.sex || null;
  const age = ageSet ?? 40;
  const avg = (k) => mean(done.map((r) => r[k]));
  const perWeek = (n) => n / (days / 7);

  // cardiorespiratory fitness: percentile among people of your age and sex (FRIEND registry)
  const medianFor = (sx) => lerp(age, VO2_MEDIAN[sx]);
  const vo2Med = sexSet ? medianFor(sexSet) : (medianFor('M') + medianFor('F')) / 2;
  const vo2Score = isNum(vo2) ? phi((vo2 - vo2Med) / (0.2 * vo2Med)) * 100 : null;

  // weekly activity minutes, moderate + 2 × vigorous (WHO 150-300). Older cached days lack Garmin's figure → activities
  const withIm = done.filter((r) => isNum(r.intensityMin));
  const hasActs = acts.length > 0; // no activity at all = nothing synced, not "zero exercise"
  let imWeek = null;
  let imSource = 'Garmin';
  if (done.length && withIm.length >= done.length * 0.6) imWeek = (sum(withIm.map((r) => r.intensityMin)) / withIm.length) * 7;
  else if (hasActs) {
    imSource = 'attività registrate';
    const mins = sum(acts.filter((a) => a.date >= start && a.date < today).map((a) => {
      const m = (a.duration || 0) / 60;
      if (a.kind === 'strength') return m;
      return (a.hrr ?? 0) >= 0.6 ? 2 * m : (a.hrr ?? 0) >= 0.4 ? m : 0.5 * m;
    }));
    imWeek = perWeek(mins);
  }
  const imScore = isNum(imWeek) ? lerp(imWeek, [[0, 0], [75, 40], [150, 70], [300, 90], [450, 100]]) : null;

  const steps = avg('steps');
  const stepsPlateau = age >= 60 ? 7000 : 9000; // Paluch 2022: benefit levels off at 6-8k (≥ 60 y) / 8-10k steps
  const stepsScore = isNum(steps) ? clamp(((steps - 2500) / (stepsPlateau - 2500)) * 100) : null;

  const strengthWeek = perWeek(acts.filter((a) => a.kind === 'strength' && a.date >= start && a.date < today).length);
  const strengthScore = hasActs ? lerp(strengthWeek, [[0, 0], [1, 60], [2, 100]]) : null;

  const rhr = avg('rhr');
  const rhrScore = isNum(rhr) ? phi((72 - rhr) / 11) * 100 : null; // adult population ≈ 72 ± 11 bpm

  const hrvVals = done.map((r) => r.hrv).filter((x) => isNum(x) && x > 0);
  const hrvG = hrvVals.length >= 7 ? Math.exp(mean(hrvVals.map(Math.log))) : null;
  const hrvExpected = Math.exp(4.58 - 0.0182 * age); // nightly RMSSD declines ~1.8%/year
  const hrvScore = isNum(hrvG) ? phi(Math.log(hrvG / hrvExpected) / 0.4) * 100 : null;

  const sleepH = mean(nights.map((r) => (r.sleep?.total ? r.sleep.total / 3600 : null)));
  const sleepDurScore = isNum(sleepH) ? clamp(sleepH < 7 ? 100 - (7 - sleepH) * 35 : sleepH > 8.5 ? 100 - (sleepH - 8.5) * 25 : 100) : null;
  // regularity: SD of the sleep midpoint (Windred 2024: regularity predicts mortality better than duration)
  const mids = nights
    .map((r) => (isNum(r.sleep?.start) && isNum(r.sleep?.end) ? new Date((r.sleep.start + r.sleep.end) / 2) : null))
    .filter(Boolean)
    .map((d) => {
      const h = d.getUTCHours() + d.getUTCMinutes() / 60;
      return h < 12 ? h + 24 : h;
    });
  const midSd = mids.length >= 5 ? sd(mids) * 60 : null;
  const regScore = isNum(midSd) ? lerp(midSd, [[30, 100], [60, 75], [90, 45], [120, 20], [180, 0]]) : null;

  const stress = avg('stress');
  const stressScore = isNum(stress) ? clamp(100 - Math.max(0, stress - 25) * 2.5) : null;

  const parts = [
    { key: 'vo2max', label: 'Fitness cardiorespiratoria (VO2max)', weight: 25, score: vo2Score, value: isNum(vo2) ? `${fmt(vo2, 1)} ml/kg/min` : null,
      ref: `mediana per la tua età ${fmt(vo2Med, 1)}`, why: 'Il predittore di mortalità più forte: passare dal 25% meno in forma alla media dimezza circa il rischio (Mandsager 2018). Punteggio = percentile tra i coetanei.' },
    { key: 'activity', label: 'Minuti di attività', weight: 15, score: imScore, value: isNum(imWeek) ? `${fmt(imWeek)} min/sett` : null,
      ref: 'OMS 150-300 (vigorosi ×2)', why: `Moderati + 2 × vigorosi a settimana (fonte: ${imSource}). Il beneficio cresce fino a 3-5 volte il minimo OMS (Arem 2015).` },
    { key: 'steps', label: 'Passi', weight: 10, score: stepsScore, value: isNum(steps) ? `${fmt(steps)} al giorno` : null,
      ref: `${fmt(stepsPlateau)}+ al giorno`, why: 'Il rischio scende fino a 8-10 mila passi (6-8 mila dopo i 60 anni), poi si stabilizza (Paluch 2022).' },
    { key: 'strength', label: 'Forza', weight: 10, score: strengthScore, value: hasActs ? `${fmt(strengthWeek, 1)} sedute/sett` : null,
      ref: '2 sedute/sett', why: 'Allenare i muscoli 2 volte a settimana riduce la mortalità del 10-20%, indipendentemente dall’aerobico (Momma 2022).' },
    { key: 'rhr', label: 'FC a riposo', weight: 10, score: rhrScore, value: isNum(rhr) ? `${fmt(rhr, 1)} bpm` : null,
      ref: 'popolazione 72 bpm', why: 'Ogni +10 bpm a riposo corrisponde a circa +10-15% di rischio (Zhang 2016). Punteggio = percentile.' },
    { key: 'sleepDur', label: 'Durata del sonno', weight: 10, score: sleepDurScore, value: isNum(sleepH) ? fmtH(sleepH) : null,
      ref: '7h–8h30', why: 'Relazione a U: rischio minimo tra 7 e 8 ore, sale sia sotto le 6 sia sopra le 9 (Cappuccio 2010).' },
    { key: 'sleepReg', label: 'Regolarità del sonno', weight: 10, score: regScore, value: isNum(midSd) ? `± ${fmt(midSd)} min` : null,
      ref: '± ≤ 30 min', why: 'Variabilità dell’orario di metà sonno. Dormire a orari regolari predice la mortalità più della durata (Windred 2024).' },
    { key: 'hrv', label: 'HRV', weight: 5, score: hrvScore, value: isNum(hrvG) ? `${fmt(hrvG)} ms` : null,
      ref: `atteso per la tua età ~${fmt(hrvExpected)} ms`, actionable: false, why: 'Un tono parasimpatico più alto si associa a minor rischio cardiovascolare; dipende molto da età e genetica, peso basso.' },
    { key: 'stress', label: 'Stress cronico', weight: 5, score: stressScore, value: isNum(stress) ? `${fmt(stress)} medio` : null,
      ref: '≤ 25 (riposo)', actionable: false, why: 'Stress fisiologico Garmin medio: indicatore indiretto del carico allostatico, evidenza più debole.' },
  ].map((p) => ({ ...p, score: round(p.score) }));
  const available = parts.filter((p) => isNum(p.score));
  const score = round(weighted(available.map((p) => [p.score, p.weight])));
  // levers: habits you can act on directly (HRV and stress follow from the others), clearly below the low-risk band
  const levers = available.filter((p) => p.actionable !== false && p.score < 70).sort((x, y) => (100 - y.score) * y.weight - (100 - x.score) * x.weight).slice(0, 2);
  return {
    score,
    parts,
    levers,
    window: days,
    age: ageSet, sex: sexSet, assumed: { age: !ageSet, sex: !sexSet },
    coverage: sum(available.map((p) => p.weight)),
    averages: { rhr: round(rhr, 1), hrv: round(hrvG, 1), sleepH: round(sleepH, 2), steps: round(steps), stress: round(stress), vo2max: vo2, activityMinWeek: round(imWeek), strengthWeek: round(strengthWeek, 1), sleepMidSdMin: round(midSd) },
  };
}
