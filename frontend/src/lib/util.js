// Date strings are ISO 'YYYY-MM-DD' and are manipulated in UTC so DST never shifts a day.
export const DAY_MS = 86400000;

export const toDate = (iso) => new Date(`${iso}T00:00:00Z`);
export const addDays = (iso, n) => new Date(toDate(iso).getTime() + n * DAY_MS).toISOString().slice(0, 10);
export const diffDays = (a, b) => Math.round((toDate(a) - toDate(b)) / DAY_MS);
export const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export function dateRange(start, end) {
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}
/** Monday of the ISO week containing `iso`. */
export const weekStart = (iso) => addDays(iso, -((toDate(iso).getUTCDay() + 6) % 7));

const dm = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
const wd = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: '2-digit', timeZone: 'UTC' });
export const fmtDay = (iso) => (iso ? dm.format(toDate(iso)) : '');
export const fmtWeekday = (iso) => (iso ? wd.format(toDate(iso)) : '');

export const clamp = (v, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));
export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
export const round = (v, d = 0) => (isNum(v) ? Math.round(v * 10 ** d) / 10 ** d : null);
export const sum = (xs) => xs.reduce((s, x) => s + (isNum(x) ? x : 0), 0);
export function mean(xs) {
  const v = xs.filter(isNum);
  return v.length ? sum(v) / v.length : null;
}
export function sd(xs) {
  const v = xs.filter(isNum);
  if (v.length < 2) return null;
  const m = mean(v);
  return Math.sqrt(sum(v.map((x) => (x - m) ** 2)) / (v.length - 1));
}
export const pctChange = (a, b) => (isNum(a) && isNum(b) && b !== 0 ? ((a - b) / b) * 100 : null);

/** Least squares over [{x, y}] -> {slope, intercept, r2} */
export function linreg(points) {
  const p = points.filter((q) => isNum(q.x) && isNum(q.y));
  if (p.length < 3) return null;
  const mx = mean(p.map((q) => q.x));
  const my = mean(p.map((q) => q.y));
  let sxy = 0, sxx = 0, syy = 0;
  for (const q of p) {
    sxy += (q.x - mx) * (q.y - my);
    sxx += (q.x - mx) ** 2;
    syy += (q.y - my) ** 2;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx, r2: syy ? (sxy * sxy) / (sxx * syy) : 0 };
}

export const fmt = (v, d = 0, fallback = '—') => {
  if (!isNum(v)) return fallback;
  const r = Math.round(v * 10 ** d) / 10 ** d;
  return (Object.is(r, -0) ? 0 : r).toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
};
export const signed = (v, d = 0) => (isNum(v) ? `${v > 0 ? '+' : ''}${fmt(v, d)}` : '—');

export function fmtPace(secPerKm) {
  if (!isNum(secPerKm) || secPerKm <= 0) return '—';
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`;
}
export function fmtDuration(sec) {
  if (!isNum(sec)) return '—';
  sec = Math.round(sec); // round first, so 2699.7 s is 45:00 and not 44:60
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
export const fmtHours = (sec) => (isNum(sec) ? `${Math.floor(sec / 3600)}h${String(Math.round((sec % 3600) / 60)).padStart(2, '0')}` : '—');

/** Deterministic PRNG so demo scenarios are stable between reloads. */
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.normal = (m = 0, s = 1) => {
    const u = 1 - next();
    const v = next();
    return m + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  next.pick = (xs) => xs[Math.floor(next() * xs.length)];
  return next;
}
