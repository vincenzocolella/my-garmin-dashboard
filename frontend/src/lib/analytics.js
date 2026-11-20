import {
  addDays, clamp, dateRange, diffDays, isNum, linreg, mean, pctChange, round, sd, sum, weekStart,
} from './util';

/** Strength sessions feed the PMC with half of their session-RPE load (neuromuscular fatigue is only partly systemic). */
const PMC_STRENGTH_FACTOR = 0.5;
export const FOCUS_OPTIONS = ['Upper', 'Lower', 'Full Body', 'Core'];

const startMs = (a) => Date.parse(`${(a.start || `${a.date} 12:00:00`).replace(' ', 'T')}Z`);

function weighted(parts) {
  const ok = parts.filter(([v]) => isNum(v));
  const w = sum(ok.map(([, wt]) => wt));
  return w ? sum(ok.map(([v, wt]) => v * wt)) / w : null;
}

function stats(values, minSd) {
  const m = mean(values);
  const s = sd(values);
  return { mean: m, sd: isNum(s) ? Math.max(s, minSd) : minSd };
}

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
export function normalizeActivities(dataset, manualLogs = [], overrides = {}) {
  const manual = manualLogs.map((m) => ({
    ...m,
    kind: 'strength',
    type: 'strength_training',
    manual: true,
    distance: 0,
    start: m.start || `${m.date} 18:00:00`,
    strength: { sets: null, reps: null, volumeKg: isNum(m.volumeKg) ? m.volumeKg : null, focus: m.focus },
  }));
  return [...(dataset?.activities ?? []), ...manual]
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
  const pct = a.avgHr / prof.maxHr;
  const z = pct < 0.6 ? 0 : pct < 0.7 ? 1 : pct < 0.8 ? 2 : pct < 0.9 ? 3 : 4;
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
export function computeAnalytics(dataset, { rangeDays = 30, settings = {}, manualLogs = [], overrides = {} } = {}) {
  const today = dataset.today;
  const rangeStart = addDays(today, -(rangeDays - 1));
  const need = Number(settings.sleepNeedH) || 8;

  // ---- day rows, gap-filled
  const byDate = new Map((dataset.days ?? []).map((d) => [d.date, d]));
  const firstDay = dataset.days?.[0]?.date ?? rangeStart;
  const allDates = dateRange(firstDay < rangeStart ? firstDay : rangeStart, today);
  const rows = allDates.map((date) => byDate.get(date) ?? { date, sleep: null });
  const idxOf = new Map(rows.map((r, i) => [r.date, i]));
  const inRange = (date) => date >= rangeStart && date <= today;

  // ---- HR profile
  const rawActs = normalizeActivities(dataset, manualLogs, overrides);
  const observedMax = Math.max(0, ...rawActs.map((a) => a.maxHr ?? 0));
  const recentRhr = mean(rows.slice(-30).map((r) => r.rhr));
  const prof = {
    maxHr: Number(settings.maxHr) || (observedMax >= 150 && observedMax <= 225 ? observedMax : 190),
    restHr: Number(settings.restHr) || (isNum(recentRhr) ? Math.round(recentRhr) : 55),
    maxHrSource: Number(settings.maxHr) ? 'manuale' : observedMax >= 150 ? 'max osservata' : 'default',
  };
  const acts = rawActs.map((a) => enrich(a, prof));
  const actsInRange = acts.filter((a) => inRange(a.date));

  // ---- readiness per day (baseline = previous 30 days)
  const readinessAt = (i) => {
    const d = rows[i];
    const prev = rows.slice(Math.max(0, i - 30), i);
    const hb = stats(prev.map((r) => r.hrv), 3);
    const rb = stats(prev.map((r) => r.rhr), 1.5);
    const hrvS = isNum(d.hrv) && isNum(hb.mean) ? clamp(50 + (20 * (d.hrv - hb.mean)) / hb.sd) : null;
    const rhrS = isNum(d.rhr) && isNum(rb.mean) ? clamp(50 - (20 * (d.rhr - rb.mean)) / rb.sd) : null;
    const autonomic = weighted([[hrvS, 0.7], [rhrS, 0.3]]);
    const sleepS = d.sleep?.score ?? (d.sleep?.total ? clamp((d.sleep.total / 3600 / need) * 100) : null);
    const stressVal = d.stress ?? rows[i - 1]?.stress;
    const stressS = isNum(stressVal) ? clamp(100 - stressVal * 1.25) : null;
    const bbS = isNum(d.bbMax) ? d.bbMax : null;
    return {
      date: d.date,
      score: round(weighted([[autonomic, 0.35], [sleepS, 0.25], [stressS, 0.2], [bbS, 0.2]])),
      hrv: round(hrvS), rhr: round(rhrS), autonomic: round(autonomic), sleep: round(sleepS), stress: round(stressS), bb: round(bbS),
      hrvZ: isNum(d.hrv) && isNum(hb.mean) ? (d.hrv - hb.mean) / hb.sd : null,
      rhrDelta: isNum(d.rhr) && isNum(rb.mean) ? d.rhr - rb.mean : null,
      hrvBase: hb, rhrBase: rb,
    };
  };
  const readinessSeries = rows.map((_, i) => readinessAt(i));
  let latestIdx = rows.length - 1;
  while (latestIdx > 0 && !isNum(rows[latestIdx].hrv) && !rows[latestIdx].sleep) latestIdx--;
  const latest = rows[latestIdx];
  const ready = readinessSeries[latestIdx];
  const prev30Ready = readinessSeries.slice(Math.max(0, latestIdx - 30), latestIdx).map((r) => r.score);
  const readiness = {
    ...ready,
    baselineMean: round(mean(prev30Ready)),
    delta: isNum(ready.score) && isNum(mean(prev30Ready)) ? round(ready.score - mean(prev30Ready)) : null,
    series: readinessSeries.filter((r) => inRange(r.date)),
  };

  // ---- longevity (slow-moving composite, 30-day averages)
  const last30 = rows.slice(-30);
  const avg = (k) => mean(last30.map((r) => r[k]));
  const avgSleepH = mean(last30.map((r) => (r.sleep?.total ? r.sleep.total / 3600 : null)));
  const vo2Current = dataset.profile?.vo2max ?? [...acts].reverse().find((a) => isNum(a.vo2max))?.vo2max ?? null;
  const longevityParts = {
    rhr: isNum(avg('rhr')) ? clamp(((75 - avg('rhr')) / 35) * 100) : null,
    hrv: isNum(avg('hrv')) ? clamp(((avg('hrv') - 20) / 60) * 100) : null,
    sleep: isNum(avgSleepH) ? clamp(100 - Math.max(0, Math.abs(avgSleepH - 8) - 0.5) * 35) : null,
    steps: isNum(avg('steps')) ? clamp((avg('steps') / 10000) * 100) : null,
    vo2max: isNum(vo2Current) ? clamp(((vo2Current - 30) / 30) * 100) : null,
    stress: isNum(avg('stress')) ? clamp(100 - (avg('stress') - 15) * 2) : null,
  };
  const longevity = {
    score: round(mean(Object.values(longevityParts))),
    parts: Object.fromEntries(Object.entries(longevityParts).map(([k, v]) => [k, round(v)])),
    averages: { rhr: round(avg('rhr'), 1), hrv: round(avg('hrv'), 1), sleepH: round(avgSleepH, 1), steps: round(avg('steps')), stress: round(avg('stress')), vo2max: vo2Current },
  };

  // ---- HRV / RHR matrix
  const hrvRhr = rows
    .map((r, i) => {
      const b = readinessSeries[i];
      return {
        date: r.date,
        hrv: r.hrv ?? null,
        rhr: r.rhr ?? null,
        lo: isNum(b.hrvBase.mean) ? round(b.hrvBase.mean - b.hrvBase.sd, 1) : null,
        hi: isNum(b.hrvBase.mean) ? round(b.hrvBase.mean + b.hrvBase.sd, 1) : null,
        base: round(b.hrvBase.mean, 1),
        rhrBase: round(b.rhrBase.mean, 1),
        status: r.hrvStatus ?? null,
      };
    })
    .filter((r) => inRange(r.date));
  const hrvTrend = (() => {
    const lastN = rows.slice(latestIdx - 2, latestIdx + 1);
    const b = readinessSeries[latestIdx].hrvBase.mean;
    const below = lastN.every((r) => isNum(r.hrv) && isNum(b) && r.hrv < b);
    return { consecutiveBelow: below ? lastN.length : 0, pct3d: pctChange(mean(lastN.map((r) => r.hrv)), b) };
  })();

  // ---- sleep architecture & debt
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
  const last7Sleep = rows.slice(latestIdx - 6, latestIdx + 1).map((r) => (r.sleep?.total ? r.sleep.total / 3600 : null));
  const sleepDeficit = sum(last7Sleep.filter(isNum).map((h) => need - h));
  const sleep = {
    rows: sleepRows,
    need,
    debt7: round(Math.max(0, sleepDeficit), 1),
    surplus7: round(Math.max(0, -sleepDeficit), 1),
    avg7: round(mean(last7Sleep), 2),
    efficiency7: round(mean(sleepRows.slice(-7).map((r) => r.efficiency)), 1),
    score7: round(mean(sleepRows.slice(-7).map((r) => r.score))),
    deepPct7: round(mean(sleepRows.slice(-7).map((r) => (r.total ? (r.deep / r.total) * 100 : null))), 1),
    remPct7: round(mean(sleepRows.slice(-7).map((r) => (r.total ? (r.rem / r.total) * 100 : null))), 1),
    lastNight: latest.sleep ? { ...latest.sleep, hours: round(latest.sleep.total / 3600, 2) } : null,
  };

  // ---- autonomic nervous system: intraday + daily
  const ans = {
    intraday: buildIntraday(dataset.intraday, byDate.get(dataset.intraday?.date)),
    daily: rows.filter((r) => inRange(r.date)).map((r) => ({
      date: r.date, stress: r.stress ?? null, bbCharged: r.bbCharged ?? null, bbDrained: r.bbDrained ?? null, bbMax: r.bbMax ?? null,
    })),
  };

  // ---- PMC (CTL 42d, ATL 7d, TSB, ACWR)
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

  return {
    today, rangeStart, rangeDays, source: dataset.source, scenario: dataset.scenario,
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

