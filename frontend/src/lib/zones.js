// Heart-rate zones: read from Garmin Connect when available, otherwise the standard
// %HRR setup (FC max 195, rest 57, floors 29/58/71/80/91%). Also checks whether the
// data suggests the zones need updating.
import { diffDays, isNum, round } from './util';

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

// --------------------------------------------------------------------- "should I update my zones?"
export function zoneAlerts(a, dataset) {
  const cfg = a.hrZoneCfg;
  const out = [];
  const recent = a.activities.filter((x) => diffDays(a.today, x.date) < 120 && x.kind !== 'strength');
  const add = (x) => out.push(x);

  if (cfg.source === 'standard')
    add({ tone: 'info', title: 'Zone standard in uso', text: `Non riesco a leggere le zone da Garmin Connect: uso quelle standard (% FCR, max ${cfg.maxHr}, riposo ${cfg.restHr}). Appena il backend le legge, si aggiornano da sole.` });

  // 1. FC max exceeded more than once (a single spike is often an optical artefact)
  const maxes = recent.map((x) => x.maxHr).filter(isNum).sort((p, q) => q - p);
  const over = maxes.filter((m) => m >= cfg.maxHr + 2);
  if (over.length >= 2) {
    const suggested = maxes[1]; // second highest: robust to a single spike
    add({ tone: 'warn', title: 'FC max probabilmente più alta', text: `In ${over.length} attività degli ultimi 4 mesi hai superato la FC max impostata (${cfg.maxHr}), fino a ${maxes[0]} bpm. Se i valori sono reali (non picchi del sensore col freddo), aggiorna la FC max a ~${suggested} bpm: tutte le zone salgono di conseguenza.`, action: `FC max → ${suggested}` });
  } else if (over.length === 1) {
    add({ tone: 'info', title: 'Picco isolato sopra la FC max', text: `Una sola attività ha toccato ${over[0]} bpm (max impostata ${cfg.maxHr}): probabile artefatto ottico. Non cambiare nulla finché non si ripete.` });
  }

  // 2. FC max possibly overestimated: many hard sessions, never close to it
  const hard = recent.filter((x) => x.hard && isNum(x.maxHr));
  if (hard.length >= 5 && maxes.length && maxes[0] < cfg.maxHr - 8)
    add({ tone: 'info', title: 'FC max forse sovrastimata', text: `In ${hard.length} sedute dure degli ultimi 4 mesi non sei mai andato oltre ${maxes[0]} bpm (max impostata ${cfg.maxHr}). Con una FC max troppo alta le zone di soglia sono irraggiungibili: un test (es. 3 × 3’ in salita a tutta) ti darebbe zone più precise.` });

  // 3. measured resting HR vs the one used for the zones (% FCR depends on it)
  const measured = a.longevity.averages.rhr;
  if (cfg.method === 'HR_RESERVE' && isNum(measured) && Math.abs(measured - cfg.restHr) >= 4) {
    const shift = Math.round((measured - cfg.restHr) * (1 - cfg.pct[2] / 100));
    add({ tone: Math.abs(shift) >= 3 ? 'warn' : 'info', title: 'FC a riposo cambiata', text: `La tua FC a riposo misurata (media 30 giorni) è ${round(measured, 0)} bpm, nelle zone c’è ${cfg.restHr}. Con il metodo % FCR questo sposta il tetto della Z2 di circa ${shift > 0 ? '+' : ''}${shift} bpm. Aggiornala in Garmin Connect (o attiva l’aggiornamento automatico della FC a riposo).`, action: `FC riposo → ${round(measured, 0)}` });
  }

  // 4. Garmin's lactate threshold should sit at the top of Z4
  const lt = dataset?.profile?.lactateThreshold;
  if (isNum(lt?.hr)) {
    const z = zoneOf(lt.hr, cfg);
    const fresh = lt.date ? diffDays(a.today, String(lt.date).slice(0, 10)) <= 60 : true;
    if (z < 4 || lt.hr > cfg.floors[4] + 3)
      add({ tone: 'warn', title: 'Soglia fuori posto nelle zone', text: `Garmin stima la tua soglia del lattato a ${lt.hr} bpm${lt.date ? ` (${String(lt.date).slice(0, 10)})` : ''}, che con le zone attuali cade in Z${z}: dovrebbe stare in alto nella Z4 (${cfg.floors[3]}–${cfg.floors[4] - 1}). Le zone non sono allineate: valuta in Garmin Connect le zone basate sulla soglia del lattato.` });
    else if (fresh && isNum(cfg.lthr) && Math.abs(lt.hr - cfg.lthr) >= 3)
      add({ tone: 'info', title: 'Nuova soglia rilevata', text: `Garmin ha rilevato una nuova soglia (${lt.hr} bpm, prima ${cfg.lthr}). Se usi zone a % soglia aggiornale.` });
  }

  // 5. easy runs at the plan's easy pace end up in Z3
  const easyAtPace = (a.plan?.weeks ?? [])
    .filter((w) => w.weekState !== 'future' && diffDays(a.today, w.end) < 35)
    .flatMap((w) => w.sessions)
    .filter((s) => (s.type === 'Easy' || (s.type === 'Long Run' && !s.block)) && s.match)
    .map((s) => s.match.run)
    .filter((r) => isNum(r.pace) && r.pace >= 385 && r.pace <= 440 && isNum(r.avgHr));
  const inZ3 = easyAtPace.filter((r) => r.avgHr >= cfg.floors[2] + 2);
  if (easyAtPace.length >= 2 && inZ3.length / easyAtPace.length >= 0.5)
    add({ tone: 'warn', title: 'Ritmo facile, FC da Z3', text: `${inZ3.length}/${easyAtPace.length} uscite facili del piano a 6:25–7:20/km hanno FC media in Z3 (≥ ${cfg.floors[2]} bpm, es. ${inZ3.map((r) => r.avgHr).join(', ')}). O il ritmo facile oggi è troppo veloce per te (rallenta finché la FC resta in Z2), oppure la Z2 è impostata troppo bassa: un test di soglia lo chiarisce.` });

  // keep the plan's coach numbers visible when they differ from the active zones
  const z2TopPlan = 153;
  const z2Top = cfg.floors[2] - 1;
  if (Math.abs(z2Top - z2TopPlan) >= 3)
    add({ tone: 'info', title: 'Zone del piano diverse dalle tue', text: `Il piano scritto usa Z2 fino a ${z2TopPlan} bpm, le tue zone attive fino a ${z2Top}. I tetti FC nelle descrizioni delle sessioni restano quelli del piano; per le analisi uso le tue zone.` });

  const rank = { warn: 0, info: 1 };
  return out.sort((p, q) => rank[p.tone] - rank[q.tone]);
}

export const zoneSummary = (cfg) => cfg.ranges.map(([lo, hi], i) => ({ z: `Z${i + 1}`, name: ZONE_NAMES[i], lo, hi, pct: `${cfg.pct[i]}–${i < 4 ? cfg.pct[i + 1] : 100}%` }));
