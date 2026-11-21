// Detailed single-run analysis and period overview of all runs.
import { findBlock } from './plan';
import { addDays, dateRange, diffDays, isNum, linreg, mean, round, sd, sum, weekStart } from './util';
import { zoneOf } from './zones';

export const runClass = (r) => (r.long ? 'long' : r.hard ? 'quality' : 'easy');
export const CLASS_LABEL = { easy: 'Facile', long: 'Lungo', quality: 'Qualità' };

const fullLaps = (laps) => (laps ?? []).filter((l) => l[0] > 100 && l[1] > 0);

// --------------------------------------------------------------------- single run
export function runDetail(a, run) {
  const cfg = a.hrZoneCfg;
  const laps = fullLaps(run.laps);
  let cum = 0;
  const lapRows = laps.map((l, i) => {
    cum += l[0];
    return { label: l[0] >= 950 ? `${Math.round(cum / 1000)}` : `${round(cum / 1000, 1)}`, i: i + 1, dist: l[0], time: l[1], pace: (l[1] / l[0]) * 1000, hr: l[2] ?? null, zone: zoneOf(l[2], cfg) };
  });
  const paceAvg = run.pace;
  lapRows.forEach((r) => (r.delta = isNum(paceAvg) ? Math.round(r.pace - paceAvg) : null));

  // halves by distance
  let half = null;
  if (lapRows.length >= 4) {
    const total = sum(lapRows.map((r) => r.dist));
    let acc = 0;
    const h = [[], []];
    lapRows.forEach((r) => {
      h[acc + r.dist / 2 <= total / 2 ? 0 : 1].push(r);
      acc += r.dist;
    });
    const agg = (rs) => {
      const d = sum(rs.map((r) => r.dist));
      const t = sum(rs.map((r) => r.time));
      const hrT = sum(rs.filter((r) => isNum(r.hr)).map((r) => r.time));
      return { pace: (t / d) * 1000, hr: hrT ? sum(rs.filter((r) => isNum(r.hr)).map((r) => r.hr * r.time)) / hrT : null };
    };
    const [f, s] = h.map(agg);
    half = { first: f, second: s, diff: Math.round(s.pace - f.pace), hrDiff: isNum(f.hr) && isNum(s.hr) ? round(s.hr - f.hr, 1) : null };
    half.kind = half.diff <= -3 ? 'negative' : half.diff >= 5 ? 'positive' : 'even';
  }
  const kmLaps = lapRows.filter((r) => r.dist >= 900);
  const paces = kmLaps.map((r) => r.pace);
  const cv = paces.length >= 3 ? (sd(paces) / mean(paces)) * 100 : null;
  const fastest = kmLaps.length ? kmLaps.reduce((b, r) => (r.pace < b.pace ? r : b)) : null;
  const slowest = kmLaps.length ? kmLaps.reduce((b, r) => (r.pace > b.pace ? r : b)) : null;

  const zTot = run.zones ? sum(run.zones) : 0;
  const zonePct = zTot ? run.zones.map((z) => round((z / zTot) * 100)) : null;

  // similar runs (same class, last 90 days)
  const cls = runClass(run);
  const similar = a.activities.filter((x) => x.kind === 'run' && x.id !== run.id && runClass(x) === cls && diffDays(run.date, x.date) >= 0 && diffDays(run.date, x.date) <= 90);
  const efs = similar.map((x) => x.ef).filter(isNum);
  const comparison = similar.length
    ? {
        n: similar.length,
        pace: round(mean(similar.map((x) => x.pace))),
        hr: round(mean(similar.map((x) => x.avgHr))),
        km: round(mean(similar.map((x) => x.distance / 1000)), 1),
        efPercentile: isNum(run.ef) && efs.length ? round((efs.filter((e) => e < run.ef).length / efs.length) * 100) : null,
        decoupling: round(mean(similar.map((x) => x.decoupling)), 1),
      }
    : null;

  // body context: that morning and the day after
  const rowIdx = a.rowsAll.findIndex((r) => r.date === run.date);
  const day = a.rowsAll[rowIdx];
  const next = a.rowsAll[rowIdx + 1];
  const ill = new Map(a.illness.series.map((d) => [d.date, d]));
  const context = day
    ? {
        readiness: a.readinessAll[rowIdx]?.score ?? null,
        sleepH: day.sleep?.total ? round(day.sleep.total / 3600, 1) : null,
        sleepScore: day.sleep?.score ?? null,
        hrvPct: ill.get(run.date)?.hrvPct ?? null,
        rhrDelta: ill.get(run.date)?.rhrDelta ?? null,
        bbMax: day.bbMax ?? null,
        nextHrvPct: next ? ill.get(next.date)?.hrvPct ?? null : null,
        nextRhrDelta: next ? ill.get(next.date)?.rhrDelta ?? null : null,
        nextDate: next?.date ?? null,
        tsbBefore: a.pmc.rows.find((r) => r.date === addDays(run.date, -1))?.tsb ?? null,
      }
    : null;

  // plan session matched to this run
  const session = a.plan?.weeks.flatMap((w) => w.sessions.map((s) => ({ ...s, week: w.week }))).find((s) => s.match?.run.id === run.id) ?? null;

  const cardiacCost = isNum(run.avgHr) && isNum(run.pace) ? Math.round((run.avgHr * run.pace) / 60) : null; // beats per km
  const strideM = isNum(run.cadence) && isNum(run.avgSpeed) && run.cadence > 0 ? round((run.avgSpeed * 60) / run.cadence, 2) : null;

  // findings
  const notes = [];
  const blocks = run.hard || Boolean(session?.block);
  if (half && blocks) notes.push({ tone: 'info', text: `Seduta con blocchi a ritmo: split (${half.diff > 0 ? '+' : ''}${half.diff} s/km tra le metà) e variabilità${isNum(cv) ? ` (${round(cv, 1)}%)` : ''} riflettono la struttura, non la gestione dello sforzo. Guarda i parziali dei blocchi.` });
  else if (half) {
    if (half.kind === 'negative') notes.push({ tone: 'good', text: `Split negativo: seconda metà ${Math.abs(half.diff)} s/km più veloce della prima. Gestione ideale dello sforzo.` });
    else if (half.kind === 'positive') notes.push({ tone: run.long ? 'warn' : 'info', text: `Split positivo: seconda metà ${half.diff} s/km più lenta${isNum(half.hrDiff) ? ` con FC ${half.hrDiff > 0 ? '+' : ''}${half.hrDiff}` : ''}. ${run.long ? 'Nei lunghi indica partenza troppo veloce o carburante insufficiente (gel ai minuti 30/60/90).' : 'Parti più piano.'}` });
    else notes.push({ tone: 'good', text: `Ritmo costante tra le due metà (${half.diff >= 0 ? '+' : ''}${half.diff} s/km).` });
  }
  if (isNum(cv) && !blocks) notes.push(cv > 5 ? { tone: 'warn', text: `Variabilità del ritmo ${round(cv, 1)}%: per un’uscita continua punta sotto il 4-5%, la regolarità è economia.` } : { tone: 'good', text: `Ritmo regolare (variabilità ${round(cv, 1)}%).` });
  if (isNum(run.decoupling)) notes.push(run.decoupling > 5 ? { tone: 'warn', text: `Deriva cardiaca ${run.decoupling}%: a parità di ritmo la FC è salita nella seconda parte (caldo, disidratazione o fondo ancora da costruire).` } : { tone: 'good', text: `Deriva cardiaca ${run.decoupling}% (< 5%): ottima tenuta aerobica.` });
  if (zonePct && run.intendedEasy) notes.push(zonePct[2] + zonePct[3] + zonePct[4] > 30 ? { tone: 'warn', text: `${zonePct[2] + zonePct[3] + zonePct[4]}% del tempo sopra la Z2 in un’uscita facile: rallenta, il beneficio aerobico è in Z2.` } : { tone: 'good', text: `${zonePct[0] + zonePct[1]}% in Z1-Z2: intensità facile rispettata.` });
  if (comparison?.efPercentile != null) notes.push({ tone: comparison.efPercentile >= 60 ? 'good' : comparison.efPercentile <= 30 ? 'warn' : 'info', text: comparison.efPercentile === 0 ? `Efficienza (velocità/FC) la più bassa tra le tue ${comparison.n} uscite ${CLASS_LABEL[cls].toLowerCase()} degli ultimi 90 giorni.` : comparison.efPercentile === 100 ? `Efficienza (velocità/FC) la migliore tra le tue ${comparison.n} uscite ${CLASS_LABEL[cls].toLowerCase()} degli ultimi 90 giorni.` : `Efficienza (velocità/FC) migliore del ${comparison.efPercentile}% delle tue ${comparison.n} uscite ${CLASS_LABEL[cls].toLowerCase()} degli ultimi 90 giorni.` });
  if (isNum(run.cadence)) notes.push(run.cadence < 165 ? { tone: 'info', text: `Cadenza ${run.cadence} passi/min${strideM ? `, falcata ${strideM} m` : ''}: +5% di cadenza riduce l’impatto su ginocchia e anche.` } : { tone: 'good', text: `Cadenza ${run.cadence} passi/min${strideM ? `, falcata ${strideM} m` : ''}.` });
  if (context) {
    if ((context.sleepH ?? 9) < 6.5 || (context.hrvPct ?? 0) <= -12) notes.push({ tone: 'warn', text: `Partivi già in debito: ${isNum(context.sleepH) ? `${context.sleepH} h di sonno` : ''}${isNum(context.hrvPct) ? `, HRV ${context.hrvPct > 0 ? '+' : ''}${context.hrvPct}% vs baseline` : ''}. Valuta i numeri di questa corsa con indulgenza.` });
    if (isNum(context.nextHrvPct)) notes.push(context.nextHrvPct <= -12 ? { tone: 'warn', text: `Il giorno dopo HRV ${context.nextHrvPct}% vs baseline: la seduta ti è costata più del previsto, recupera prima della prossima qualità.` } : { tone: 'good', text: `Il giorno dopo HRV ${context.nextHrvPct > 0 ? '+' : ''}${context.nextHrvPct}% vs baseline: carico assorbito bene.` });
  }
  (session?.compliance?.notes ?? []).forEach((n) => notes.push({ ...n, text: `Piano (${session.title}): ${n.text}` }));

  return { run, cls, blocks, lapRows, half, cv: round(cv, 1), fastest, slowest, zonePct, comparison, context, session, cardiacCost, strideM, notes };
}

// --------------------------------------------------------------------- overview of all runs in the period
export function runsOverview(a) {
  const allRuns = a.activities.filter((x) => x.kind === 'run');
  const cur = allRuns.filter((r) => r.date >= a.rangeStart && r.date <= a.today);
  const prevStart = addDays(a.rangeStart, -a.rangeDays);
  const prev = allRuns.filter((r) => r.date >= prevStart && r.date < a.rangeStart);

  const totals = (rs) => {
    const km = sum(rs.map((r) => r.distance)) / 1000;
    const time = sum(rs.map((r) => r.duration));
    const hrT = sum(rs.filter((r) => isNum(r.avgHr)).map((r) => r.duration));
    return {
      count: rs.length,
      km: round(km, 1),
      time,
      pace: km ? time / km : null,
      hr: hrT ? round(sum(rs.filter((r) => isNum(r.avgHr)).map((r) => r.avgHr * r.duration)) / hrT) : null,
      elevation: round(sum(rs.map((r) => r.elevation))),
      cadence: round(mean(rs.map((r) => r.cadence))),
      ef: round(mean(rs.map((r) => r.ef)), 3),
      longest: rs.length ? round(Math.max(...rs.map((r) => r.distance)) / 1000, 1) : null,
      perWeek: round(rs.length / (a.rangeDays / 7), 1),
      kmPerWeek: round(km / (a.rangeDays / 7), 1),
    };
  };
  const t = totals(cur);
  const p = totals(prev);
  const pct = (x, y) => (isNum(x) && isNum(y) && y ? round(((x - y) / y) * 100) : null);
  const deltas = { km: pct(t.km, p.km), count: t.count - p.count, pace: isNum(t.pace) && isNum(p.pace) ? Math.round(t.pace - p.pace) : null, hr: isNum(t.hr) && isNum(p.hr) ? t.hr - p.hr : null, ef: pct(t.ef, p.ef), longest: isNum(t.longest) && isNum(p.longest) ? round(t.longest - p.longest, 1) : null };

  const weeks = dateRange(weekStart(a.rangeStart), weekStart(a.today)).filter((_, i) => i % 7 === 0);
  const weekly = weeks.map((w) => {
    const rs = cur.filter((r) => weekStart(r.date) === w);
    const km = sum(rs.map((r) => r.distance)) / 1000;
    const time = sum(rs.map((r) => r.duration));
    return { date: w, km: round(km, 1), runs: rs.length, longest: rs.length ? round(Math.max(...rs.map((r) => r.distance)) / 1000, 1) : null, pace: km ? Math.round(time / km) : null };
  });

  const byClass = ['easy', 'long', 'quality'].map((c) => {
    const rs = cur.filter((r) => runClass(r) === c);
    const tt = totals(rs);
    return { key: c, label: CLASS_LABEL[c], count: rs.length, km: tt.km, pace: tt.pace, hr: tt.hr };
  });

  // personal bests from laps (last 180 days)
  const pool = allRuns.filter((r) => diffDays(a.today, r.date) < 180);
  const best = (km) => {
    let b = null;
    pool.forEach((r) => {
      const blk = findBlock(r.laps, km, { lastKm: 1 });
      if (blk && blk.dist >= km * 1000 * 0.96) {
        const time = (blk.time / blk.dist) * km * 1000;
        if (!b || time < b.time) b = { time, date: r.date, name: r.name };
      }
    });
    return b;
  };
  let fastestKm = null;
  pool.forEach((r) => fullLaps(r.laps).filter((l) => l[0] >= 950).forEach((l) => {
    const pace = (l[1] / l[0]) * 1000;
    if (!fastestKm || pace < fastestKm.pace) fastestKm = { pace, date: r.date, name: r.name };
  }));
  const longestRun = pool.length ? pool.reduce((b, r) => (r.distance > b.distance ? r : b)) : null;
  const bests = { km1: fastestKm, k5: best(5), k10: best(10), longest: longestRun ? { km: round(longestRun.distance / 1000, 1), date: longestRun.date, name: longestRun.name } : null };

  // trends on easy runs (same intensity → honest comparison), per 30 days
  const easy = cur.filter((r) => runClass(r) === 'easy');
  const trend = (get) => {
    const reg = linreg(easy.map((r) => ({ x: diffDays(r.date, a.rangeStart), y: get(r) })));
    return reg ? round(reg.slope * 30, 1) : null;
  };
  const trends = { easyHr: trend((r) => r.avgHr), easyPace: trend((r) => r.pace), cadence: trend((r) => r.cadence), easyCount: easy.length };

  // consistency
  const dates = [...new Set(cur.map((r) => r.date))].sort();
  let longestGap = 0;
  for (let i = 1; i < dates.length; i++) longestGap = Math.max(longestGap, diffDays(dates[i], dates[i - 1]));
  if (dates.length) longestGap = Math.max(longestGap, diffDays(a.today, dates.at(-1)));
  const consistency = { weeksWithRuns: weekly.filter((w) => w.runs > 0).length, weeks: weekly.length, longestGap, daysSinceLast: dates.length ? diffDays(a.today, dates.at(-1)) : null };

  const notes = [];
  if (isNum(deltas.km)) notes.push(deltas.km > 30 ? { tone: 'warn', text: `Volume +${deltas.km}% rispetto al periodo precedente: oltre il +10-15%/settimana il rischio infortuni sale.` } : deltas.km < -30 ? { tone: 'info', text: `Volume ${deltas.km}% rispetto al periodo precedente.` } : { tone: 'good', text: `Volume stabile (${deltas.km > 0 ? '+' : ''}${deltas.km}% vs periodo precedente).` });
  if (isNum(trends.easyHr) && trends.easyCount >= 3) notes.push(trends.easyHr <= -1 ? { tone: 'good', text: `Nelle uscite facili la FC media scende di ${Math.abs(trends.easyHr)} bpm ogni 30 giorni: il cuore lavora meno a parità di sforzo.` } : trends.easyHr >= 2 ? { tone: 'warn', text: `Nelle uscite facili la FC media sale di ${trends.easyHr} bpm ogni 30 giorni: fatica accumulata, caldo o ritmo facile in aumento.` } : { tone: 'info', text: 'FC delle uscite facili stabile nel periodo.' });
  const q = byClass.find((c) => c.key === 'quality');
  if (t.count >= 4 && q.count / t.count > 0.4) notes.push({ tone: 'warn', text: `${q.count} uscite di qualità su ${t.count}: troppa intensità per un piano da 1-2 uscite a settimana, la base si costruisce nei lunghi facili.` });
  if (consistency.longestGap >= 10) notes.push({ tone: 'warn', text: `Pausa più lunga senza correre: ${consistency.longestGap} giorni. Oltre 10 giorni la forma aerobica inizia a calare.` });

  return { totals: t, prev: p, deltas, weekly, byClass, bests, trends, consistency, notes };
}

// --------------------------------------------------------------------- heart rate vs pace: is the engine improving?
/**
 * Every 1 km lap (minus the first, where HR lags) gives a (pace, HR) point. A global slope from all laps
 * (bpm per s/km) normalises each lap to a reference pace / reference HR, so easy runs and quality sessions
 * become comparable. Weekly values = median over the previous 28 days.
 */
export function hrPaceTrend(a) {
  const cfg = a.hrZoneCfg;
  const runs = a.activities.filter((r) => r.kind === 'run' && diffDays(a.today, r.date) < 200);
  const pts = [];
  runs.forEach((r) => {
    const laps = fullLaps(r.laps).filter((l) => l[0] >= 800 && isNum(l[2]));
    if (laps.length >= 3) {
      laps.slice(1).forEach((l) => {
        const pace = (l[1] / l[0]) * 1000;
        if (pace >= 200 && pace <= 540) pts.push({ date: r.date, pace, hr: l[2], w: 1 });
      });
    } else if (!r.hard && isNum(r.pace) && isNum(r.avgHr) && r.pace <= 540) {
      pts.push({ date: r.date, pace: r.pace, hr: r.avgHr, w: 2, whole: true }); // no laps: whole-run average
    }
  });
  if (pts.length < 8) return null;

  const reg = linreg(pts.map((p) => ({ x: p.pace, y: p.hr })));
  const slope = Math.min(-0.15, Math.max(-1.2, reg?.slope ?? -0.4)); // bpm per s/km (faster = higher HR)
  const median = (xs) => {
    const v = [...xs].sort((p, q) => p - q);
    return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null;
  };
  const refPace = Math.round(median(pts.map((p) => p.pace)) / 5) * 5;
  const refHr = cfg.floors[2] - 1; // top of Z2
  pts.forEach((p) => {
    p.hrAtRef = p.hr - slope * (p.pace - refPace);
    p.paceAtRef = p.pace - (p.hr - refHr) / slope;
  });

  const first = pts.reduce((m, p) => (p.date < m ? p.date : m), a.today);
  const weeks = dateRange(weekStart(first), weekStart(a.today)).filter((_, i) => i % 7 === 0);
  const weekly = weeks
    .map((w) => {
      const end = addDays(w, 6);
      const win = pts.filter((p) => p.date <= end && diffDays(end, p.date) < 28);
      const n = sum(win.map((p) => p.w));
      return n >= 6 ? { date: w, hrAtPace: round(median(win.map((p) => p.hrAtRef)), 1), paceAtHr: Math.round(median(win.map((p) => p.paceAtRef))), n } : null;
    })
    .filter(Boolean);
  const fit = (key) => {
    const r = linreg(weekly.map((w, i) => ({ x: i, y: w[key] })));
    return r ? weekly.map((w, i) => ({ ...w, [`${key}Trend`]: round(r.intercept + r.slope * i, 1) })) : weekly;
  };
  const series = fit('paceAtHr').map((w, i) => ({ ...w, ...fit('hrAtPace')[i] }));

  // compare the last 4 weeks with ~8 weeks before
  const recent = pts.filter((p) => diffDays(a.today, p.date) < 28);
  const before = pts.filter((p) => diffDays(a.today, p.date) >= 56 && diffDays(a.today, p.date) < 84);
  const change = recent.length >= 4 && before.length >= 4
    ? { hr: round(median(recent.map((p) => p.hrAtRef)) - median(before.map((p) => p.hrAtRef)), 1), pace: Math.round(median(recent.map((p) => p.paceAtRef)) - median(before.map((p) => p.paceAtRef))) }
    : null;

  // scatter: earliest third vs latest third of the history
  const sorted = [...pts].sort((p, q) => (p.date < q.date ? -1 : 1));
  const third = Math.floor(sorted.length / 3);
  const early = sorted.slice(0, third);
  const late = sorted.slice(-third);
  const span = (xs) => (xs.length ? `${xs[0].date}|${xs.at(-1).date}` : null);

  const notes = [];
  if (change) {
    if (change.hr <= -2) notes.push({ tone: 'good', text: `A ${fmtP(refPace)}/km il tuo cuore batte ${Math.abs(change.hr)} bpm in meno rispetto a 2 mesi fa: stai migliorando davvero.` });
    else if (change.hr >= 2) notes.push({ tone: 'warn', text: `A ${fmtP(refPace)}/km la FC è ${change.hr} bpm più alta di 2 mesi fa: fatica accumulata, caldo o un periodo di malessere stanno pesando.` });
    else notes.push({ tone: 'info', text: `A ${fmtP(refPace)}/km la FC è stabile rispetto a 2 mesi fa (${change.hr > 0 ? '+' : ''}${change.hr} bpm).` });
    if (change.pace <= -5) notes.push({ tone: 'good', text: `Al limite della Z2 (${refHr} bpm) corri ${Math.abs(change.pace)} s/km più veloce di 2 mesi fa.` });
    else if (change.pace >= 5) notes.push({ tone: 'warn', text: `Al limite della Z2 (${refHr} bpm) sei ${change.pace} s/km più lento di 2 mesi fa.` });
  } else notes.push({ tone: 'info', text: 'Servono almeno 3 mesi di corse con FC per il confronto con 2 mesi fa; intanto guarda la tendenza settimanale.' });

  return { series, refPace, refHr, slope: round(slope, 2), change, notes, scatter: { early, late, earlySpan: span(early), lateSpan: span(late) }, points: pts.length };
}

const fmtP = (s) => (isNum(s) ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '—');
