// Heuristic engine: deterministic diagnostics computed from the analytics object.
// Used when no AI provider is configured, and as instant "first draft" before an AI call.
import { clamp, diffDays, fmt, fmtDuration, fmtPace, isNum, mean, round, signed } from './util';

export const PERSONAS = {
  quant: { label: 'Analista Quantitativo', short: 'Quant', desc: 'Chirurgico, statistico: delta, z-score, deviazioni standard.' },
  sergeant: { label: 'Sergente Istruttore', short: 'Sergente', desc: 'Spietato e sarcastico. Nessuna scusa su sonno e allenamenti saltati.' },
  strategist: { label: 'Longevity & Performance Strategist', short: 'Strategist', desc: 'Proattivo, orientato all’ottimizzazione a lungo termine.' },
};

const SEV = { 3: 'CRITICO', 2: 'ATTENZIONE', 1: 'NOTA', 0: 'OK' };
const toneOf = (sev) => (sev >= 3 ? 'bad' : sev === 2 ? 'warn' : sev === 1 ? 'info' : 'good');

// --------------------------------------------------------------------- derived helpers
export function hrZones(a) {
  const { restHr: r, maxHr: m } = a.profile;
  const at = (p) => Math.round(r + p * (m - r));
  return { z2Top: at(0.7), z3Top: at(0.8), threshold: at(0.88) };
}

export function trainingPaces(a) {
  const p10 = a.race.predictions.find((p) => p.key === '10k')?.pace;
  const pHalf = a.race.predictions.find((p) => p.key === 'half')?.pace;
  if (!isNum(p10)) return null;
  return { easy: [p10 + 60, p10 + 80], threshold: (pHalf ?? p10 + 12) - 5, tenK: p10, long: p10 + 70 };
}

export function overtrainingRisk(a) {
  const r = a.readiness;
  const parts = [
    isNum(r.hrvZ) ? clamp(-r.hrvZ * 25, 0, 30) : 0,
    isNum(r.rhrDelta) ? clamp(r.rhrDelta * 4, 0, 20) : 0,
    isNum(a.pmc.latest?.acwr) ? clamp((a.pmc.latest.acwr - 1.2) * 60, 0, 20) : 0,
    isNum(a.pmc.latest?.tsb) ? clamp((-a.pmc.latest.tsb - 15) * 1.2, 0, 15) : 0,
    clamp((a.sleep.debt7 ?? 0) * 2, 0, 10),
    a.zones.easyCount ? clamp((a.zones.easyTooHard / a.zones.easyCount) * 10, 0, 5) : 0,
  ];
  return Math.round(clamp(parts.reduce((s, x) => s + x, 0)));
}

const lastOf = (a, pred) => a.activities.filter(pred).at(-1);

// --------------------------------------------------------------------- findings
export function findings(a) {
  const f = [];
  const r = a.readiness;
  const L = a.latest;
  const add = (x) => f.push({ tone: toneOf(x.sev), ...x });

  if (isNum(r.hrvZ)) {
    const pct = round(((L.hrv - r.hrvBase.mean) / r.hrvBase.mean) * 100);
    if (r.hrvZ <= -1)
      add({
        id: 'hrv', area: 'recovery', sev: r.hrvZ <= -1.8 || a.hrvTrend.consecutiveBelow >= 3 ? 3 : 2,
        fact: `HRV ${L.hrv} ms, ${signed(pct)}% vs baseline 30gg (${fmt(r.hrvBase.mean, 1)} ± ${fmt(r.hrvBase.sd, 1)} ms, z = ${fmt(r.hrvZ, 2)})${a.hrvTrend.consecutiveBelow >= 3 ? ', sotto baseline da 3 giorni consecutivi' : ''}`,
        advice: 'niente intensità oggi: Z2 ≤ 45’ o riposo attivo',
        jab: 'Il tuo sistema nervoso sta chiedendo pietà e tu gli rispondi con le ripetute.',
        longTerm: 'un HRV cronicamente soppresso erode la capacità di adattamento',
      });
    else if (r.hrvZ >= 1)
      add({ id: 'hrv', area: 'recovery', sev: 0, fact: `HRV ${L.hrv} ms, ${signed(pct)}% sopra baseline (z = ${fmt(r.hrvZ, 2)})`, advice: 'finestra ideale per una seduta di qualità', jab: 'Per una volta il corpo collabora. Non sprecarlo sul divano.', longTerm: 'tono parasimpatico in crescita: l’adattamento sta funzionando' });
  }
  if (isNum(r.rhrDelta) && r.rhrDelta >= 3)
    add({ id: 'rhr', area: 'recovery', sev: r.rhrDelta >= 5 ? 3 : 2, fact: `FC a riposo ${L.rhr} bpm, ${signed(r.rhrDelta, 1)} bpm vs baseline`, advice: 'idratazione, zero alcol, sonno anticipato; valuta segni di malattia', jab: 'Il cuore batte come se avessi fatto festa. Hai fatto festa?', longTerm: 'una FC a riposo in salita è uno dei marker più predittivi di affaticamento sistemico' });

  if ((a.sleep.debt7 ?? 0) >= 3)
    add({ id: 'sleepdebt', area: 'sleep', sev: a.sleep.debt7 >= 6 ? 3 : 2, fact: `debito di sonno 7gg ${fmt(a.sleep.debt7, 1)} h (media ${fmt(a.sleep.avg7, 1)} h vs bisogno ${a.sleep.need} h)`, advice: `anticipa di 45’ l’orario di letto per 4 notti, schermi off 60’ prima`, jab: 'Dormire non è opzionale. Netflix non ti farà correre più veloce.', longTerm: 'il debito cronico riduce sensibilità insulinica, testosterone e consolidamento motorio' });
  if (isNum(a.sleep.efficiency7) && a.sleep.efficiency7 < 87)
    add({ id: 'sleepeff', area: 'sleep', sev: 1, fact: `efficienza del sonno ${fmt(a.sleep.efficiency7, 1)}% (target > 90%)`, advice: 'camera a 18-19 °C, buio totale, caffeina entro le 14:00', jab: 'Ti giri nel letto più che sul tapis roulant.', longTerm: 'frammentazione = meno sonno profondo = meno GH notturno' });
  if (isNum(a.sleep.deepPct7) && a.sleep.deepPct7 < 13)
    add({ id: 'deep', area: 'sleep', sev: 1, fact: `sonno profondo ${fmt(a.sleep.deepPct7, 1)}% (range ottimale 15-25%)`, advice: 'evita allenamenti intensi dopo le 20:00 e pasti pesanti a cena', jab: 'Sonno profondo da neonato? No, da insonne cronico.', longTerm: 'il sonno profondo è la fase di riparazione tissutale' });

  const intr = a.ans.intraday;
  if (intr) {
    if ((intr.nightStress ?? 0) > 22 || (isNum(intr.bbGain) && intr.bbGain < 25))
      add({ id: 'night', area: 'stress', sev: 2, fact: `recupero notturno inefficace: stress medio notturno ${fmt(intr.nightStress)}, Body Battery +${fmt(intr.bbGain)}`, advice: 'cena 3 h prima di dormire, respirazione 4-7-8 per 5’ a letto', jab: 'Hai dormito, tecnicamente. Il tuo sistema nervoso no.', longTerm: 'notti in simpaticotonia bloccano la supercompensazione' });
    for (const w of intr.windows.filter((x) => x.tone === 'warn'))
      add({ id: `win-${w.from}`, area: 'stress', sev: 1, fact: `${w.label.toLowerCase()} tra le ${intr.rows[w.from].label} e le ${intr.rows[w.to].label}`, advice: w.label.includes('post') ? 'pasto con meno carboidrati raffinati + 10’ di camminata dopo pranzo' : 'stacca da lavoro/schermi dopo le 21:00, 10’ di downregulation', jab: 'Lo stress non sparisce perché lo ignori.', longTerm: 'picchi ripetuti nello stesso orario indicano un pattern comportamentale correggibile' });
  }
  if (isNum(L.bbMax) && L.bbMax < 50)
    add({ id: 'bb', area: 'stress', sev: 2, fact: `Body Battery massima oggi ${L.bbMax}/100`, advice: 'giornata a bassa richiesta: sposta la qualità a domani', jab: 'Batteria al 40% e pretendi prestazioni da 100%.', longTerm: 'ricariche notturne insufficienti ripetute = fatica cumulativa' });

  const p = a.pmc.latest;
  if (p) {
    if (p.tsb < -30) add({ id: 'tsb', area: 'run', sev: 3, fact: `TSB ${fmt(p.tsb, 1)} (CTL ${fmt(p.ctl, 1)}, ATL ${fmt(p.atl, 1)}): zona ad alto rischio`, advice: 'scarico di 3-4 giorni con volume −40%', jab: 'Stai scavando una buca di fatica e chiami “costanza” la pala.', longTerm: 'fatica acuta oltre questa soglia aumenta il rischio infortuni senza benefici aggiuntivi' });
    else if (p.tsb > 20) add({ id: 'tsb', area: 'run', sev: 1, fact: `TSB +${fmt(p.tsb, 1)}: zona di transizione, la fitness (CTL ${fmt(p.ctl, 1)}) sta calando`, advice: 'reintroduci gradualmente volume se non sei in scarico pre-gara', jab: 'Freschissimo. Anche troppo: si chiama detraining.', longTerm: 'stimolo insufficiente = perdita di adattamenti aerobici in 2-3 settimane' });
    else if (p.tsb <= -10) add({ id: 'tsb', area: 'run', sev: 0, fact: `TSB ${fmt(p.tsb, 1)}: zona di carico ottimale`, advice: 'mantieni, ma proteggi il sonno', jab: 'Stai lavorando sul serio. Non rovinarlo.', longTerm: 'zona produttiva per costruire fitness' });
    const peak = a.pmc.acwrPeak14;
    if (isNum(p.acwr) && p.acwr <= 1.3 && (peak?.value ?? 0) > 1.5)
      add({ id: 'acwr', area: 'run', sev: 2, fact: `ACWR oggi ${fmt(p.acwr, 2)} ma ha toccato ${fmt(peak.value, 2)} il ${peak.date.slice(8)}/${peak.date.slice(5, 7)}: il cronico si è alzato inseguendo un picco, non per una progressione sana`, advice: 'consolida il volume attuale per 2 settimane prima di aumentare ancora', jab: 'Il rapporto sembra normale solo perché ti sei abituato a esagerare.', longTerm: 'i picchi di ACWR > 1.5 lasciano un rischio infortunio elevato per le 2-4 settimane successive' });
    if (isNum(p.acwr) && p.acwr > 1.3)
      add({ id: 'acwr', area: 'run', sev: p.acwr > 1.5 ? 3 : 2, fact: `ACWR ${fmt(p.acwr, 2)} (sweet spot 0.8-1.3)`, advice: 'limita il volume dei prossimi 7 giorni al livello medio delle ultime 4 settimane', jab: 'Hai aumentato il carico come un principiante a gennaio.', longTerm: 'picchi acuti rispetto al cronico sono il principale predittore di infortunio da sovraccarico' });
    else if (isNum(p.acwr) && p.acwr < 0.8)
      add({ id: 'acwr', area: 'run', sev: 1, fact: `ACWR ${fmt(p.acwr, 2)}: carico acuto sotto il cronico`, advice: 'ok se scarico programmato, altrimenti riprendi la progressione', jab: 'Settimana in vacanza mentale?', longTerm: 'sottocarico prolungato rende fragile il ritorno al volume' });
    if ((a.pmc.rampRate ?? 0) > 7)
      add({ id: 'ramp', area: 'run', sev: 2, fact: `ramp rate CTL +${fmt(a.pmc.rampRate, 1)}/settimana (sicuro ≤ 5-7)`, advice: 'rallenta la progressione', jab: 'La fitness non si compra in saldo.', longTerm: 'progressioni troppo ripide anticipano i plateau e gli infortuni' });
  }
  if (a.zones.easyCount >= 2 && a.zones.easyTooHard / a.zones.easyCount >= 0.4)
    add({ id: 'easyhard', area: 'run', sev: 2, fact: `${a.zones.easyTooHard}/${a.zones.easyCount} corse facili con > 30% del tempo in Z3+`, advice: `easy run sotto ${hrZones(a).z2Top} bpm, anche a costo di camminare in salita`, jab: 'Le tue “corse facili” sono tempo run travestite. Il tuo ego non è un piano di allenamento.', longTerm: 'la zona grigia accumula fatica senza costruire base aerobica' });
  if (a.zones.pct && a.zones.pct.mid >= 25)
    add({ id: 'polar', area: 'run', sev: 2, fact: `distribuzione ${a.zones.pct.low}/${a.zones.pct.mid}/${a.zones.pct.high} (Z1-2 / Z3 / Z4-5): troppa zona grigia`, advice: 'obiettivo 80/5/15: rallenta i facili, rendi davvero dure le sedute dure', jab: 'Né carne né pesce. Allenamento “medio” = risultati medi.', longTerm: 'il modello polarizzato massimizza VO2max e soglia nel lungo periodo' });
  else if (a.zones.pct && a.zones.pct.low >= 75)
    add({ id: 'polar', area: 'run', sev: 0, fact: `distribuzione polarizzata corretta (${a.zones.pct.low}% in Z1-2)`, advice: 'mantieni', jab: 'Finalmente disciplina.', longTerm: 'base aerobica in costruzione' });
  if (isNum(a.efficiency.trendPct)) {
    if (a.efficiency.trendPct >= 2)
      add({ id: 'ef', area: 'run', sev: 0, fact: `Efficiency Factor easy run ${signed(a.efficiency.trendPct, 1)}% nel periodo`, advice: 'la base aerobica sta migliorando: continua col volume facile', jab: 'Stai migliorando. Non montarti la testa.', longTerm: 'più velocità a parità di battito = economia aerobica' });
    else if (a.efficiency.trendPct <= -2)
      add({ id: 'ef', area: 'run', sev: 2, fact: `Efficiency Factor ${signed(a.efficiency.trendPct, 1)}% nel periodo`, advice: 'fatica accumulata o caldo: più Z2, meno intensità', jab: 'Corri più piano con lo stesso battito. Complimenti, al contrario.', longTerm: 'EF in calo è un segnale precoce di overreaching' });
  }
  if ((a.efficiency.avgDecoupling ?? 0) > 5)
    add({ id: 'decoupling', area: 'run', sev: 2, fact: `decoupling Pa:HR medio ${fmt(a.efficiency.avgDecoupling, 1)}% (soglia aerobica < 5%)`, advice: 'allunga gradualmente i lunghi a ritmo più lento e cura l’idratazione', jab: 'Dopo metà corsa il cuore va per conto suo.', longTerm: 'il decoupling misura la durabilità aerobica, chiave per la mezza' });

  const recentConflicts = a.strength.conflicts.filter((c) => diffDays(a.today, c.date) <= 14);
  if (recentConflicts.length)
    add({ id: 'conflict', area: 'hybrid', sev: recentConflicts.some((c) => c.severity === 'high') ? 3 : 2, fact: `${recentConflicts.length} conflitti di interferenza negli ultimi 14 giorni (es. ${recentConflicts[0].strength.strength?.focus ?? 'forza'} → ${recentConflicts[0].run.name} dopo ${recentConflicts[0].gapH} h)`, advice: 'separa leg day e sedute dure di almeno 48 h, oppure fai pesi e qualità nello stesso giorno (corsa prima, pesi 6 h dopo)', jab: 'Squat pesante e poi ripetute: o sei un genio o non hai letto niente.', longTerm: 'l’interferenza cronica limita sia forza che endurance' });
  if (a.strength.perWeek < 1)
    add({ id: 'strfreq', area: 'hybrid', sev: 1, fact: `forza ${fmt(a.strength.perWeek, 1)} sedute/settimana`, advice: '2 sedute da 40’ (1 lower, 1 full) migliorano economia di corsa e prevengono infortuni', jab: 'I pesi non mordono.', longTerm: 'la forza è il fattore di longevità più sottovalutato dopo i 30 anni' });

  return f.sort((x, y) => y.sev - x.sev);
}

// --------------------------------------------------------------------- micro-insights per card
export function cardInsights(a) {
  const r = a.readiness;
  const L = a.latest;
  const p = a.pmc.latest;
  const intr = a.ans.intraday;
  const weakest = Object.entries({ HRV: r.autonomic, Sonno: r.sleep, Stress: r.stress, 'Body Battery': r.bb })
    .filter(([, v]) => isNum(v))
    .sort((x, y) => x[1] - y[1])[0];
  const out = {};
  out.readiness = {
    text: `Readiness ${fmt(r.score)} (${signed(r.delta)} vs media 30gg).${weakest ? ` Anello più debole: ${weakest[0]} (${weakest[1]}).` : ''}`,
    tone: (r.score ?? 50) >= 65 ? 'good' : (r.score ?? 50) >= 45 ? 'warn' : 'bad',
  };
  out.hrvRhr =
    a.hrvTrend.consecutiveBelow >= 3
      ? { text: `HRV sotto baseline da 3 giorni consecutivi (${signed(a.hrvTrend.pct3d, 0)}%)${(r.rhrDelta ?? 0) > 2 ? ` con FC riposo +${fmt(r.rhrDelta, 1)} bpm: probabile stress sistemico` : (a.pmc.load7 ?? 0) > (a.pmc.load28avg7 ?? 0) * 1.15 || (a.pmc.acwrPeak14?.value ?? 0) > 1.4 ? ' dopo un blocco di carico elevato: risposta al sovraccarico' : ' nonostante volume stabile: possibile stress extra-sportivo'}.`, tone: 'bad' }
      : { text: `HRV ${fmt(L.hrv)} ms (z ${fmt(r.hrvZ, 2)}), FC riposo ${fmt(L.rhr)} bpm (${signed(r.rhrDelta, 1)} vs baseline).`, tone: (r.hrvZ ?? 0) <= -1 ? 'warn' : 'good' };
  out.sleep = {
    text: `Debito 7gg ${fmt(a.sleep.debt7, 1)} h · media ${fmt(a.sleep.avg7, 1)} h · efficienza ${fmt(a.sleep.efficiency7, 1)}% · deep ${fmt(a.sleep.deepPct7, 0)}%.`,
    tone: (a.sleep.debt7 ?? 0) >= 6 ? 'bad' : (a.sleep.debt7 ?? 0) >= 3 ? 'warn' : 'good',
  };
  out.ans = intr
    ? (() => {
        const bad = intr.windows.filter((w) => w.tone !== 'good');
        return bad.length
          ? { text: `${bad.map((w) => `${w.label} ${intr.rows[w.from].label}-${intr.rows[w.to].label}`).join(' · ')}.`, tone: bad.some((w) => w.tone === 'bad') ? 'bad' : 'warn' }
          : { text: `Notte efficace (stress ${fmt(intr.nightStress)}, BB +${fmt(intr.bbGain)}), nessun picco anomalo oggi.`, tone: 'good' };
      })()
    : { text: 'Nessun dato intraday disponibile per oggi.', tone: 'info' };
  out.pmc = p
    ? { text: `CTL ${fmt(p.ctl, 1)} · ATL ${fmt(p.atl, 1)} · TSB ${fmt(p.tsb, 1)} → ${a.pmc.zone?.label}. ACWR ${fmt(p.acwr, 2)}${(p.acwr ?? 1) > 1.3 ? ' (oltre lo sweet spot)' : ''}.`, tone: (p.acwr ?? 1) > 1.5 || p.tsb < -30 ? 'bad' : (p.acwr ?? 1) > 1.3 ? 'warn' : 'good' }
    : { text: 'Carico insufficiente per il PMC.', tone: 'info' };
  out.ef = {
    text: isNum(a.efficiency.trendPct)
      ? `EF easy run ${signed(a.efficiency.trendPct, 1)}% nel periodo${isNum(a.efficiency.avgDecoupling) ? `, decoupling medio ${fmt(a.efficiency.avgDecoupling, 1)}%` : ''}${a.efficiency.trendPct >= 2 ? ': adattamento aerobico reale.' : a.efficiency.trendPct <= -2 ? ': segnale di fatica.' : ': stabile.'}`
      : 'Servono almeno 3 corse facili per il trend.',
    tone: (a.efficiency.trendPct ?? 0) <= -2 ? 'warn' : 'good',
  };
  out.zones = a.zones.pct
    ? { text: `${a.zones.pct.low}/${a.zones.pct.mid}/${a.zones.pct.high} (Z1-2/Z3/Z4-5). ${a.zones.pct.mid >= 25 ? 'Troppa zona grigia: non è 80/20.' : a.zones.pct.low >= 75 ? 'Polarizzazione corretta.' : 'Vicino all’80/20, rallenta i facili.'}${a.zones.easyTooHard ? ` ${a.zones.easyTooHard} easy run troppo veloci.` : ''}`, tone: a.zones.pct.mid >= 25 ? 'warn' : 'good' }
    : { text: 'Nessuna corsa con dati di frequenza cardiaca.', tone: 'info' };
  const half = a.race.predictions.find((x) => x.key === 'half');
  out.race = {
    text: `Mezza stimata ${fmtDuration(half?.model)} (${fmtPace(half?.pace)}/km) da ${a.race.vdotSource}${isNum(a.race.vo2max) ? ` ${fmt(a.race.vo2max, 1)}` : ''}; volume ${fmt(a.race.weeklyKm, 1)} km/sett${a.race.weeklyKm < 35 ? ': sotto i 35 km la mezza paga dazio.' : '.'}`,
    tone: a.race.weeklyKm < 25 ? 'warn' : 'info',
  };
  const recentConf = a.strength.conflicts.filter((c) => diffDays(a.today, c.date) <= 14);
  out.hybrid = recentConf.length
    ? { text: `${recentConf.length} conflitti recupero (leg day ↔ qualità) negli ultimi 14 giorni. Quota neuromuscolare ${fmt(a.strength.nmShare)}% del carico.`, tone: 'warn' }
    : { text: `Nessun conflitto di interferenza. Quota neuromuscolare ${fmt(a.strength.nmShare)}% del carico totale.`, tone: 'good' };
  out.volume = {
    text: `${a.totals.strength} sedute (${fmt(a.strength.perWeek, 1)}/sett) · tonnellaggio ${fmt(a.strength.tonnage)} kg · RPE medio ${fmt(a.strength.avgRpe, 1)}.`,
    tone: a.strength.perWeek < 1 ? 'warn' : 'good',
  };
  out.longevity = {
    text: `Indice ${fmt(a.longevity.score)} da FC riposo ${fmt(a.longevity.averages.rhr, 1)}, HRV ${fmt(a.longevity.averages.hrv, 1)}, sonno ${fmt(a.longevity.averages.sleepH, 1)} h, VO2max ${fmt(a.longevity.averages.vo2max, 1)}.`,
    tone: 'info',
  };
  out.runs = {
    text: `${a.totals.runs} corse · ${fmt(a.totals.km, 1)} km nel periodo.${a.zones.easyTooHard ? ` ${a.zones.easyTooHard} facili con troppo tempo in Z3+.` : ''}`,
    tone: a.zones.easyTooHard ? 'warn' : 'info',
  };
  return out;
}

// --------------------------------------------------------------------- persona rendering
function render(list, persona, header, footer) {
  const lines = [header];
  if (!list.length) lines.push(persona === 'sergeant' ? 'Nessun problema rilevato. Sospetto. Continua così e non farmi cambiare idea.' : 'Nessuna anomalia significativa rilevata.');
  for (const x of list) {
    if (persona === 'quant') lines.push(`• [${SEV[x.sev]}] ${x.fact} → ${x.advice}.`);
    else if (persona === 'sergeant') lines.push(`• ${x.fact[0].toUpperCase()}${x.fact.slice(1)}. ${x.jab} → ${x.advice}.`);
    else lines.push(`• ${x.fact[0].toUpperCase()}${x.fact.slice(1)}: ${x.longTerm}. Strategia: ${x.advice}.`);
  }
  if (footer) lines.push('', footer);
  return lines.join('\n');
}

const openers = {
  quant: (a) => `REPORT QUANTITATIVO · ${a.latestDate} · finestra ${a.rangeDays}gg · readiness ${fmt(a.readiness.score)} (${signed(a.readiness.delta)} vs μ30)`,
  sergeant: (a, worst) =>
    worst >= 3 ? 'ATTENTI! Ho visto i tuoi dati e non mi piacciono. Per niente.' : worst === 2 ? 'Riposo! Non male, ma non ti ho chiesto “non male”.' : 'Oggi non ho materiale per umiliarti. Goditela, non durerà.',
  strategist: (a) => `Visione strategica · longevity index ${fmt(a.longevity.score)}/100 · readiness ${fmt(a.readiness.score)}.`,
};

export function nextSession(a) {
  const r = a.readiness.score ?? 50;
  const risk = overtrainingRisk(a);
  const tsb = a.pmc.latest?.tsb ?? 0;
  const z = hrZones(a);
  const paces = trainingPaces(a);
  const lastHard = lastOf(a, (x) => x.kind === 'run' && x.hard);
  const lastLong = lastOf(a, (x) => x.kind === 'run' && x.long);
  const lastLeg = lastOf(a, (x) => x.kind === 'strength' && ['Lower', 'Full Body'].includes(x.strength?.focus));
  const since = (x) => (x ? diffDays(a.today, x.date) : 99);
  const easy = paces ? `${fmtPace(paces.easy[0])}-${fmtPace(paces.easy[1])}/km` : `FC < ${z.z2Top} bpm`;
  if (r < 40 || risk >= 60) return { title: 'Riposo o mobilità 20-30’', why: `readiness ${r}, rischio overtraining ${risk}/100`, kind: 'rest' };
  if (r < 55 || tsb < -20) return { title: `Easy run 40-50’ in Z2 (${easy}, FC < ${z.z2Top})`, why: `readiness ${r}, TSB ${fmt(tsb, 1)}`, kind: 'easy' };
  if (since(lastLeg) <= 1) return { title: `Easy run 45’ (${easy}) oppure forza upper body`, why: `leg day ${since(lastLeg) === 0 ? 'oggi' : 'ieri'}: niente qualità per 48 h`, kind: 'easy' };
  if (since(lastHard) >= 3 && r >= 62)
    return { title: paces ? `Qualità: 5×1000 m a ${fmtPace(paces.tenK)}/km, rec 2’ jog` : `Qualità: 5×4’ in Z4 (${z.z3Top}-${z.threshold} bpm), rec 2’`, why: `ultima seduta dura ${since(lastHard)} giorni fa, readiness ${r}`, kind: 'quality' };
  if (since(lastLong) >= 6) {
    const longest = Math.max(0, ...a.activities.filter((x) => x.kind === 'run' && diffDays(a.today, x.date) < 28).map((x) => x.distance / 1000));
    const km = Math.round(Math.min(tsb > 15 ? longest * 0.75 || 10 : longest * 1.1 || 12, 22)); // no progression while tapering
    return { title: `Lungo progressivo ${km} km (${paces ? fmtPace(paces.long) + '/km' : `FC < ${z.z2Top}`}, ultimi 3 km a ritmo mezza)`, why: `ultimo lungo ${since(lastLong)} giorni fa`, kind: 'long' };
  }
  return { title: `Easy 45’ (${easy}) + 6 allunghi da 20”`, why: 'mantenimento tra due sedute chiave', kind: 'easy' };
}

export function judgeText(a, persona) {
  const f = findings(a);
  const worst = Math.max(0, ...f.map((x) => x.sev));
  const n = nextSession(a);
  const footer = persona === 'sergeant' ? `ORDINE DEL GIORNO: ${n.title}. Motivo: ${n.why}. Esegui.` : persona === 'quant' ? `Sessione consigliata: ${n.title} [${n.why}]. Rischio overtraining stimato: ${overtrainingRisk(a)}/100.` : `Prossimo passo: ${n.title} (${n.why}). Proteggi il sonno: è il moltiplicatore di tutto il resto.`;
  return render(f.slice(0, 7), persona, openers[persona](a, worst), footer);
}

export function bioAuditText(a, persona) {
  const f = findings(a).filter((x) => ['recovery', 'sleep', 'stress'].includes(x.area));
  const r = a.readiness;
  const diag = [];
  if ((r.hrvZ ?? 0) <= -1 && (r.rhrDelta ?? 0) >= 3) diag.push('Pattern compatibile con infiammazione latente / inizio di malattia (HRV ↓ + FC riposo ↑).');
  if ((r.hrvZ ?? 0) <= -1 && (a.latest.stress ?? 0) >= 35 && (a.pmc.latest?.tsb ?? 0) < -15) diag.push('Sovraccarico del sistema nervoso: allenamento e stress quotidiano si sommano.');
  if ((a.sleep.debt7 ?? 0) >= 3 || (a.sleep.efficiency7 ?? 100) < 87 || a.ans.intraday?.windows.some((w) => w.label.startsWith('Stress serale'))) diag.push('Igiene del sonno migliorabile (debito, efficienza o attivazione serale).');
  if (!diag.length) diag.push('Nessun pattern patologico: sistema autonomico in equilibrio.');
  const presc = [
    (r.hrvZ ?? 0) <= -1 ? 'Allenamento: solo Z1-Z2 o riposo, niente sedute neuromuscolari pesanti.' : 'Allenamento: via libera secondo il piano.',
    (a.sleep.debt7 ?? 0) >= 3 ? `Stasera a letto entro le 22:45 (+45’), obiettivo ${a.sleep.need} h.` : 'Mantieni l’orario di sonno attuale (±30’).',
    'Luce naturale 10’ entro un’ora dal risveglio; caffeina non oltre le 14:00.',
    a.ans.intraday?.windows.some((w) => w.label.includes('post-prandiale')) ? 'Dopo pranzo: 10’ di camminata, riduci carboidrati raffinati.' : 'Idratazione: 35 ml/kg + elettroliti nei giorni di corsa.',
  ];
  return render(f, persona, `${openers[persona](a, Math.max(0, ...f.map((x) => x.sev)))}\n\nDIAGNOSI\n${diag.map((d) => `• ${d}`).join('\n')}\n\nEVIDENZE`, `PRESCRIZIONI PER OGGI\n${presc.map((p) => `• ${p}`).join('\n')}`);
}

export function sessionCritique(a, run) {
  if (!run) return '';
  const z = hrZones(a);
  const out = [`${run.name} · ${run.date} · ${fmt(run.distance / 1000, 2)} km in ${fmtDuration(run.duration)} (${fmtPace(run.pace)}/km), FC ${fmt(run.avgHr)}/${fmt(run.maxHr)} bpm.`];
  if (run.easyTooHard) out.push(`✗ Doveva essere facile ma ${fmt(100 - (run.zones ? (run.zones[0] + run.zones[1]) / run.zones.reduce((s, x) => s + x, 0) * 100 : 0))}% del tempo è sopra Z2: la prossima volta FC < ${z.z2Top} bpm.`);
  else if (run.intendedEasy) out.push('✓ Intensità facile rispettata.');
  if (run.hard) out.push(`Seduta dura (TE anaerobico ${fmt(run.anaerobicTE, 1)}): servono 48 h prima della prossima qualità.`);
  if (isNum(run.decoupling)) out.push(run.decoupling > 5 ? `✗ Decoupling ${fmt(run.decoupling, 1)}%: deriva cardiaca, durabilità aerobica da costruire (idratazione, ritmo iniziale più lento).` : `✓ Decoupling ${fmt(run.decoupling, 1)}%: accoppiamento aerobico solido.`);
  if (isNum(run.cadence)) out.push(run.cadence < 165 ? `Cadenza ${run.cadence} spm: prova +5% per ridurre il carico articolare.` : `Cadenza ${run.cadence} spm: ok.`);
  if (isNum(run.ef)) {
    const avgEf = mean(a.efficiency.points.filter((p) => !p.hard).map((p) => p.y));
    if (isNum(avgEf)) out.push(`EF ${fmt(run.ef, 3)} vs media facili ${fmt(avgEf, 3)} (${signed(((run.ef - avgEf) / avgEf) * 100, 1)}%).`);
  }
  return out.join('\n');
}

export function runningCoachText(a, persona, run) {
  const f = findings(a).filter((x) => x.area === 'run');
  const n = nextSession(a);
  const risk = overtrainingRisk(a);
  const header = `${openers[persona](a, Math.max(0, ...f.map((x) => x.sev)))}\nRischio overtraining: ${risk}/100 · CTL ${fmt(a.pmc.latest?.ctl, 1)} · TSB ${fmt(a.pmc.latest?.tsb, 1)} · ${fmt(a.race.weeklyKm, 1)} km/sett`;
  const critique = run ? `\n\nCRITICA SESSIONE\n${sessionCritique(a, run)}` : '';
  return render(f, persona, header + critique + '\n\nMACRO-CICLO', `PROSSIMA SESSIONE IDEALE\n• ${n.title}\n  motivo: ${n.why}`);
}

export function hybridText(a, persona) {
  const f = findings(a).filter((x) => x.area === 'hybrid' || ['hrv', 'tsb', 'acwr'].includes(x.id));
  const long = lastOf(a, (x) => x.kind === 'run' && x.long);
  const longDow = long ? new Date(`${long.date}T00:00:00Z`).getUTCDay() : 0;
  const dayName = (d) => ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'][(d + 7) % 7];
  const plan = [
    `Lungo di ${dayName(longDow)}: leg day non prima di ${dayName(longDow + 2)} e non oltre ${dayName(longDow - 3)}.`,
    'Qualità e lower body nello stesso giorno (corsa al mattino, pesi ≥ 6 h dopo) per concentrare la fatica e liberare i giorni facili.',
    (a.readiness.hrvZ ?? 0) <= -1 ? 'HRV sotto baseline: questa settimana solo upper body e core, riduci il volume lower del 30%.' : 'HRV stabile: mantieni 2 sedute di forza (1 lower pesante, 1 full body leggera).',
    'Lower body: 3-5 ripetizioni pesanti (RPE 7-8) per massimizzare la forza con il minimo danno muscolare per la corsa.',
  ];
  return render(f, persona, openers[persona](a, Math.max(0, ...f.map((x) => x.sev))), `PIANO DI INTEGRAZIONE\n${plan.map((p) => `• ${p}`).join('\n')}`);
}

// --------------------------------------------------------------------- heuristic chat
export function chatAnswer(a, question) {
  const q = question.toLowerCase();
  const kmMatch = q.match(/(\d+(?:[.,]\d+)?)\s*(km|k\b|chilometri)/);
  const r = a.readiness;
  const z = hrZones(a);
  const paces = trainingPaces(a);
  const issues = [];
  if ((a.sleep.debt7 ?? 0) >= 4) issues.push(`debito di sonno ${fmt(a.sleep.debt7, 1)} h`);
  if ((r.hrvZ ?? 0) <= -1) issues.push(`HRV sotto baseline (z ${fmt(r.hrvZ, 2)})`);
  if ((a.pmc.latest?.acwr ?? 1) > 1.3) issues.push(`ACWR ${fmt(a.pmc.latest.acwr, 2)}`);
  if ((a.pmc.latest?.tsb ?? 0) < -25) issues.push(`TSB ${fmt(a.pmc.latest.tsb, 1)}`);

  if (kmMatch || /lung|long run|correre|corsa|uscita/.test(q)) {
    const km = kmMatch ? parseFloat(kmMatch[1].replace(',', '.')) : null;
    const longest = Math.max(0, ...a.activities.filter((x) => x.kind === 'run' && diffDays(a.today, x.date) < 28).map((x) => x.distance / 1000));
    if (km && longest && km > longest * 1.15) issues.push(`${km} km è +${Math.round((km / longest - 1) * 100)}% rispetto al lungo più lungo delle ultime 4 settimane (${fmt(longest, 1)} km)`);
    const verdict = issues.length >= 3 || (r.score ?? 50) < 40 ? 'No' : issues.length ? 'Sì, con condizioni' : 'Sì';
    return [
      `${verdict}.`,
      issues.length ? `Fattori limitanti: ${issues.join('; ')}.` : `Readiness ${fmt(r.score)}, TSB ${fmt(a.pmc.latest?.tsb, 1)}, sonno medio ${fmt(a.sleep.avg7, 1)} h: semaforo verde.`,
      verdict === 'No' ? `Alternativa: easy ${Math.min(km ?? 10, 10)} km sotto ${z.z2Top} bpm e rivaluta tra 48 h.` : `Esecuzione: ${paces ? `${fmtPace(paces.long)}/km` : 'ritmo conversazionale'}, FC < ${z.z2Top} bpm per i primi 2/3, 30-60 g di carboidrati/ora oltre i 75’.`,
      '(motore euristico: configura un provider AI per risposte libere)',
    ].join('\n');
  }
  if (/sonn|dorm|sleep|letto/.test(q))
    return `Ultimi 7 giorni: media ${fmt(a.sleep.avg7, 1)} h, debito ${fmt(a.sleep.debt7, 1)} h, efficienza ${fmt(a.sleep.efficiency7, 1)}%, deep ${fmt(a.sleep.deepPct7, 0)}%, REM ${fmt(a.sleep.remPct7, 0)}%. ${(a.sleep.debt7 ?? 0) >= 3 ? 'Recupera anticipando l’orario di letto, non con sonnellini lunghi.' : 'Quantità adeguata.'}`;
  if (/pesi|forza|palestra|squat|leg|gamb/.test(q)) return hybridText(a, 'quant');
  if (/gara|tempo|previs|mezza|maratona|10k|5k/.test(q))
    return a.race.predictions.map((p) => `${p.label}: ${fmtDuration(p.model)} (${fmtPace(p.pace)}/km)${p.garmin ? ` · Garmin ${fmtDuration(p.garmin)}` : ''}`).join('\n') + `\nBasato su ${a.race.vdotSource}${isNum(a.race.vo2max) ? ` ${fmt(a.race.vo2max, 1)}` : ''} e ${fmt(a.race.weeklyKm, 1)} km/sett.`;
  if (/hrv|stress|recuper|stanc|riposo|battery/.test(q)) return bioAuditText(a, 'quant');
  return `${judgeText(a, 'quant')}\n\n(motore euristico: per domande libere configura Gemini/OpenAI nelle impostazioni)`;
}
