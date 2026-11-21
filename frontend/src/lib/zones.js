// Heart-rate zones: read from Garmin Connect when available, otherwise the standard
// %HRR setup (FC max 195, rest 57, floors 29/58/71/80/91%).
import { isNum, round } from './util';

export const ZONE_NAMES = ['Riscaldamento', 'Facile', 'Aerobica', 'Soglia', 'Massima'];
export const STANDARD = { method: 'HR_RESERVE', maxHr: 195, restHr: 57, pct: [29, 58, 71, 80, 91] };
const METHOD_LABEL = { HR_RESERVE: '% FCR', HR_MAX: '% FC max', LACTATE_THRESHOLD: '% soglia' };

const floorsFromPct = (max, rest, pct) => pct.map((p) => Math.round(rest + (p / 100) * (max - rest)));

/** Active zone configuration: { source, method, maxHr, restHr, lthr, floors[5], pct[5], ranges[5] } */
export function zoneConfig(dataset, settings = {}) {
  const g = dataset?.profile?.hrZones;
  const useGarmin = settings.zoneSource !== 'standard' && g?.floors?.length === 5 && isNum(g.maxHr);
  let cfg;
  if (useGarmin) {
    const max = g.maxHr;
    const rest = g.restHr ?? STANDARD.restHr;
    const base = g.method === 'HR_MAX' ? 0 : rest;
    const ref = g.method === 'LACTATE_THRESHOLD' && g.lthr ? g.lthr : max;
    const pct = g.floors.map((f) => round(g.method === 'LACTATE_THRESHOLD' ? (f / ref) * 100 : ((f - base) / (max - base)) * 100));
    cfg = { source: 'garmin', method: g.method, maxHr: max, restHr: rest, lthr: g.lthr ?? null, floors: g.floors, pct, sport: g.sport };
  } else {
    cfg = { source: 'standard', method: STANDARD.method, maxHr: STANDARD.maxHr, restHr: STANDARD.restHr, lthr: null, floors: floorsFromPct(STANDARD.maxHr, STANDARD.restHr, STANDARD.pct), pct: STANDARD.pct };
  }
  cfg.methodLabel = METHOD_LABEL[cfg.method] ?? cfg.method;
  cfg.ranges = cfg.floors.map((f, i) => [f, i < 4 ? cfg.floors[i + 1] - 1 : cfg.maxHr]);
  cfg.label = cfg.source === 'garmin' ? `Garmin Connect (${cfg.sport === 'RUNNING' ? 'corsa' : 'predefinite'}) · ${cfg.methodLabel} · max ${cfg.maxHr} / riposo ${cfg.restHr}` : `Standard · % FCR · max ${cfg.maxHr} / riposo ${cfg.restHr}`;
  return cfg;
}

export const zoneOf = (hr, cfg) => (isNum(hr) ? Math.max(1, cfg.floors.filter((f) => hr >= f).length) : null);

export const zoneSummary = (cfg) => cfg.ranges.map(([lo, hi], i) => ({ z: `Z${i + 1}`, name: ZONE_NAMES[i], lo, hi, pct: `${cfg.pct[i]}–${i < 4 ? cfg.pct[i + 1] : 100}%` }));
