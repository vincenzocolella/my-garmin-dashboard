// Detection of periods when the body was likely unwell (illness, overreaching, sleep debt, acute stress)
// from concordant deviations of resting HR, HRV, stress, sleep and Body Battery vs a personal baseline.
import { clamp, diffDays, isNum, mean, round, sum } from './util';

export const SENSITIVITY = { bassa: 3.4, media: 2.8, alta: 2.2 };

export const EPISODE_TYPES = {
  illness: { label: 'Probabile malattia / infezione', tone: 'bad', advice: 'Stop all’intensità finché FC a riposo e HRV non tornano in baseline per 2 giorni; poi 2-3 uscite facili prima di riprendere la qualità.' },
  overreaching: { label: 'Sovraccarico (overreaching)', tone: 'warn', advice: 'Il carico dei giorni precedenti ha superato la capacità di recupero: settimana di scarico −30/40% e sonno prioritario.' },
  sleep: { label: 'Debito di sonno', tone: 'warn', advice: 'Il malessere segue notti corte: recupera il sonno prima di aggiungere carico.' },
  stress: { label: 'Stress / malessere generico', tone: 'info', advice: 'Segnali autonomici alterati senza un carico allenante che li spieghi: stress lavorativo, alimentazione, alcol o viaggio.' },
};

const MIN_SD = { rhr: 1.5, hrv: 4, stress: 4, sleep: 6, bb: 7, sleepH: 0.45, resp: 0.4, spo2: 1 };

/** Robust centre/spread (median, 1.4826·MAD): a few sick days do not distort the baseline. */
function robust(values, minSd) {
  const v = values.filter(isNum).sort((a, b) => a - b);
  if (v.length < 8) return { m: null, s: minSd };
  const med = (xs) => (xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2);
  const m = med(v);
  const mad = med(v.map((x) => Math.abs(x - m)).sort((a, b) => a - b));
  return { m, s: Math.max(1.4826 * mad, minSd) };
}

export function detectIllness(rows, activities, { sensitivity = 'media', today } = {}) {
  const thr = SENSITIVITY[sensitivity] ?? SENSITIVITY.media;
  const loadByDate = new Map();
  activities.forEach((a) => loadByDate.set(a.date, (loadByDate.get(a.date) ?? 0) + (a.pmcLoad ?? 0)));
  const series = rows.map((r, i) => {
    const base = rows.slice(Math.max(0, i - 30), i);
    const sleepH = r.sleep?.total ? r.sleep.total / 3600 : null;
    const row = { date: r.date, index: null, flagged: false };
    if (base.filter((x) => isNum(x.rhr) || isNum(x.hrv)).length < 14) return row;
    const st = (get, key) => robust(base.map(get), key === 'hrv' ? Math.max(MIN_SD.hrv, 0.07 * (mean(base.map(get)) ?? 0)) : MIN_SD[key]);
    const z = (v, b) => (isNum(v) && isNum(b.m) ? (v - b.m) / b.s : null);
    const b = {
      rhr: st((x) => x.rhr, 'rhr'),
      hrv: st((x) => x.hrv, 'hrv'),
      stress: st((x) => x.stress, 'stress'),
      sleep: st((x) => x.sleep?.score, 'sleep'),
      bb: st((x) => x.bbMax, 'bb'),
      sleepH: st((x) => (x.sleep?.total ? x.sleep.total / 3600 : null), 'sleepH'),
      // overnight breathing rate and SpO2 (Forerunner 165: SpO2 only with Pulse Ox enabled during sleep)
      resp: st((x) => x.respiration, 'resp'),
      spo2: st((x) => x.spo2, 'spo2'),
    };
    const zs = { rhr: z(r.rhr, b.rhr), hrv: z(r.hrv, b.hrv), stress: z(r.stress, b.stress), sleep: z(r.sleep?.score, b.sleep), bb: z(r.bbMax, b.bb), resp: z(r.respiration, b.resp), spo2: z(r.spo2, b.spo2) };
    const pos = (v) => (isNum(v) ? Math.max(0, v) : 0);
    const autonomic = pos(zs.rhr) + pos(-zs.hrv);
    // a faster breathing rate during sleep is one of the earliest signs of infection; a lower SpO2 supports it
    const score = autonomic + 0.5 * pos(zs.stress) + 0.35 * pos(-zs.sleep) + 0.35 * pos(-zs.bb) + 0.7 * pos(zs.resp) + 0.4 * pos(-zs.spo2);
    const signals = [
      (zs.rhr ?? 0) >= 1 && 'FC riposo ↑',
      (zs.hrv ?? 0) <= -1 && 'HRV ↓',
      (zs.stress ?? 0) >= 1 && 'stress ↑',
      (zs.sleep ?? 0) <= -1 && 'sonno ↓',
      (zs.bb ?? 0) <= -1 && 'Body Battery ↓',
      (zs.resp ?? 0) >= 1.5 && 'respirazione ↑',
      (zs.spo2 ?? 0) <= -1.5 && 'SpO2 ↓',
    ].filter(Boolean);
    // concordant autonomic shift (RHR up AND HRV down), or faster breathing with one autonomic sign, or one very strong signal
    const respLed = score >= thr && (zs.resp ?? 0) >= 1.5 && ((zs.rhr ?? 0) >= 1 || (zs.hrv ?? 0) <= -1);
    const flagged = (score >= thr && (zs.rhr ?? 0) >= 1 && (zs.hrv ?? 0) <= -1) || respLed || autonomic >= thr + 1.5;
    return {
      ...row,
      flagged,
      score: round(score, 2),
      index: round(clamp((score / (thr * 2)) * 100)),
      signals,
      rhrDelta: isNum(r.rhr) && isNum(b.rhr.m) ? round(r.rhr - b.rhr.m, 1) : null,
      hrvPct: isNum(r.hrv) && isNum(b.hrv.m) ? round(((r.hrv - b.hrv.m) / b.hrv.m) * 100) : null,
      stressDelta: isNum(r.stress) && isNum(b.stress.m) ? round(r.stress - b.stress.m) : null,
      sleepDelta: isNum(r.sleep?.score) && isNum(b.sleep.m) ? round(r.sleep.score - b.sleep.m) : null,
      sleepHDelta: isNum(sleepH) && isNum(b.sleepH.m) ? round(sleepH - b.sleepH.m, 1) : null,
      respDelta: isNum(r.respiration) && isNum(b.resp.m) ? round(r.respiration - b.resp.m, 1) : null,
      spo2Delta: isNum(r.spo2) && isNum(b.spo2.m) ? round(r.spo2 - b.spo2.m, 1) : null,
      load: round(loadByDate.get(r.date) ?? 0),
    };
  });

  // group flagged days, tolerating a single unflagged day inside an episode
  const groups = [];
  let cur = null;
  series.forEach((d, i) => {
    if (d.flagged) {
      if (cur && i - cur.last <= 2) cur.last = i;
      else {
        cur = { first: i, last: i };
        groups.push(cur);
      }
    }
  });

  const episodes = groups
    .map(({ first, last }) => {
      const days = series.slice(first, last + 1);
      const flaggedDays = days.filter((d) => d.flagged);
      const peak = Math.max(...flaggedDays.map((d) => d.score));
      if (flaggedDays.length < 2 && peak < thr * 1.5) return null;
      const start = days[0].date;
      const end = days.at(-1).date;
      const maxRhr = Math.max(...days.map((d) => d.rhrDelta ?? -99));
      const minHrv = Math.min(...days.map((d) => d.hrvPct ?? 99));
      const maxStress = Math.max(...days.map((d) => d.stressDelta ?? -99));
      const maxResp = Math.max(...days.map((d) => d.respDelta ?? -99));
      const before7 = series.slice(Math.max(0, first - 7), first);
      const before28 = series.slice(Math.max(0, first - 35), Math.max(0, first - 7));
      const loadRatio = sum(before28.map((d) => d.load)) > 0 ? sum(before7.map((d) => d.load)) / (sum(before28.map((d) => d.load)) / 4) : null;
      const sleepBefore = mean(series.slice(Math.max(0, first - 4), first + 1).map((d) => d.sleepHDelta));
      const during = activities.filter((a) => a.date >= start && a.date <= end);
      const hardDuring = during.filter((a) => a.hard || a.long || (a.kind === 'strength' && (a.rpe ?? 0) >= 8));
      const loadDuring = mean(days.map((d) => d.load)) ?? 0;
      const loadTypical = mean(before28.map((d) => d.load)) ?? 0;

      // days after the episode until RHR and HRV are back near baseline
      let recovery = null;
      for (let k = last + 1; k < Math.min(series.length, last + 15); k++) {
        const d = series[k];
        if (isNum(d.rhrDelta) && d.rhrDelta < 1.5 && isNum(d.hrvPct) && d.hrvPct > -7) {
          recovery = k - last;
          break;
        }
      }
      const ongoing = today && diffDays(today, end) <= 1;

      const stopped = loadTypical > 0 && loadDuring < loadTypical * 0.4;
      let type = 'stress';
      // strong markers + training kept high = overload; strong markers with training dropped (or normal load) = illness
      if ((loadRatio ?? 0) >= 1.3 && !stopped) type = 'overreaching';
      else if ((maxRhr >= 4 && minHrv <= -12 && flaggedDays.length >= 2) || (maxResp >= 1 && (maxRhr >= 3 || minHrv <= -10))) type = 'illness';
      else if ((sleepBefore ?? 0) <= -0.8 || Math.min(...days.map((d) => d.sleepDelta ?? 99)) <= -12) type = 'sleep';

      const signalSet = new Set(days.flatMap((d) => d.signals ?? []));
      const confidence = round(clamp(25 + signalSet.size * 11 + flaggedDays.length * 6 + (peak - thr) * 8, 15, flaggedDays.length < 2 ? 60 : 95));
      return {
        start, end, ongoing,
        days: days.length,
        flaggedDays: flaggedDays.length,
        type, ...EPISODE_TYPES[type],
        confidence,
        peakScore: round(peak, 2),
        markers: {
          rhr: maxRhr > -99 ? round(maxRhr, 1) : null,
          hrv: minHrv < 99 ? minHrv : null,
          stress: maxStress > -99 ? maxStress : null,
          resp: maxResp > -99 ? round(maxResp, 1) : null,
        },
        signals: [...signalSet],
        loadRatio: round(loadRatio, 2),
        sleepBefore: round(sleepBefore, 1),
        trainedDuring: during.length,
        hardDuring: hardDuring.map((a) => ({ date: a.date, name: a.name })),
        trainingStopped: stopped,
        recoveryDays: recovery,
      };
    })
    .filter(Boolean)
    .reverse();

  const last = series.at(-1);
  const activeEpisode = episodes.find((e) => e.ongoing);
  const recent = series.slice(-3).filter((d) => d.flagged).length;
  return {
    series,
    episodes,
    sensitivity,
    threshold: thr,
    current: {
      active: Boolean(activeEpisode) || recent >= 2,
      episode: activeEpisode ?? null,
      today: last,
      flaggedLast3: recent,
    },
    stats: {
      ...episodeStats(episodes),
      daysScanned: series.filter((d) => d.index != null).length,
      healthyStreak: (() => {
        let n = 0;
        for (let i = series.length - 1; i >= 0 && !series[i].flagged; i--) n++;
        return n;
      })(),
      firstDate: series.find((d) => d.index != null)?.date ?? null,
      lastEpisodeAgo: episodes[0] ? diffDays(today ?? series.at(-1).date, episodes[0].end) : null,
    },
  };
}

/** Aggregate figures over a list of episodes (the whole history, or the selected range). */
export function episodeStats(episodes) {
  return {
    count: episodes.length,
    illness: episodes.filter((e) => e.type === 'illness').length,
    avgDays: round(mean(episodes.map((e) => e.days)), 1),
    avgRecovery: round(mean(episodes.map((e) => e.recoveryDays)), 1),
    trainedHard: episodes.filter((e) => e.hardDuring.length).length,
    afterHighLoad: episodes.filter((e) => (e.loadRatio ?? 0) >= 1.3).length,
    afterShortSleep: episodes.filter((e) => (e.sleepBefore ?? 0) <= -0.5).length,
  };
}
