// Heuristic engine: deterministic diagnostics computed from the analytics object.
// Used when no AI provider is configured, and as instant "first draft" before an AI call.
import { PLAN_START, RACE_DATE } from './planData';
import { summaryText } from './summary';
import { clamp, diffDays, fmt, fmtDuration, fmtH, fmtPace, isNum, mean, round, signed } from './util';

export const PERSONAS = {
  quant: { label: 'Analista Quantitativo', short: 'Quant', desc: 'Chirurgico, statistico: delta, z-score, deviazioni standard.' },
  sergeant: { label: 'Sergente Istruttore', short: 'Sergente', desc: 'Spietato e sarcastico. Nessuna scusa su sonno e allenamenti saltati.' },
  strategist: { label: 'Longevity & Performance Strategist', short: 'Strategist', desc: 'Proattivo, orientato all’ottimizzazione a lungo termine.' },
};

const SEV = { 3: 'CRITICO', 2: 'ATTENZIONE', 1: 'NOTA', 0: 'OK' };
const toneOf = (sev) => (sev >= 3 ? 'bad' : sev === 2 ? 'warn' : sev === 1 ? 'info' : 'good');

// --------------------------------------------------------------------- derived helpers
export function hrZones(a) {
  const f = a.hrZoneCfg.floors; // Z1..Z5 lower bounds
  return { z2Top: f[2] - 1, z3Top: f[3] - 1, threshold: f[4] - 1 };
}

export function trainingPaces(a) {
  // while the half-marathon plan is running, its paces (calibrated on the 10 km test) win over the VO2max model
  if (a.plan && a.today >= PLAN_START && a.today <= RACE_DATE) {
    const race = Number(a.plan.goalPace.split(':')[0]) * 60 + Number(a.plan.goalPace.split(':')[1]);
    return { easy: [390, 430], threshold: 328, tenK: 298, long: 410, race };
  }
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
        fact: `HRV ${L.hrv} ms, ${signed(pct)}% vs baseline 60gg (${fmt(r.hrvBase.mean, 1)} ± ${fmt(r.hrvBase.sd, 1)} ms, z = ${fmt(r.hrvZ, 2)})${a.hrvTrend.consecutiveBelow >= 3 ? ', sotto baseline da 3 giorni consecutivi' : ''}`,
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
    add({ id: 'sleepdebt', area: 'sleep', sev: a.sleep.debt7 >= 6 ? 3 : 2, fact: `debito di sonno 7gg ${fmtH(a.sleep.debt7)} (media ${fmtH(a.sleep.avg7)} vs bisogno ${fmtH(a.sleep.need)})`, advice: `anticipa di 45’ l’orario di letto per 4 notti, schermi off 60’ prima`, jab: 'Dormire non è opzionale. Netflix non ti farà correre più veloce.', longTerm: 'il debito cronico riduce sensibilità insulinica, testosterone e consolidamento motorio' });
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
// One interpretive sentence per card: what the numbers mean, never a re-listing of the KPIs shown below it.
/** Lower-case the first letter unless it starts an acronym (VO2max, HRV, FC). */
const lc = (s) => (s && !/^[A-Z]{2}/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
const COMP_LABEL = { autonomic: 'il sistema nervoso', sleep: 'il sonno', stress: 'lo stress di ieri', load: 'il carico di allenamento' };
const COMP_FIX = {
  autonomic: 'serve una giornata tranquilla e una notte senza alcol per farlo risalire',
  sleep: 'una notte più lunga lo riporta su rapidamente',
  stress: 'una serata di vero stacco aiuta più di qualsiasi integratore',
  load: 'un giorno facile o di riposo riequilibra',
};
export function cardInsights(a) {
  const r = a.readiness;
  const p = a.pmc.latest;
  const intr = a.ans.intraday;
  const out = {};

  const comps = [['autonomic', r.autonomic], ['sleep', r.sleep], ['stress', r.stress], ['load', r.load]].filter(([, v]) => isNum(v)).sort((x, y) => x[1] - y[1]);
  const weak = comps[0];
  out.readiness = !isNum(r.score)
    ? { text: 'Dati di stanotte non ancora sincronizzati.', tone: 'info' }
    : weak && weak[1] < 65
      ? { text: `${r.band.label}: a pesare è soprattutto ${COMP_LABEL[weak[0]]}; ${COMP_FIX[weak[0]]}.`, tone: r.score >= 65 ? 'warn' : 'bad' }
      : { text: `${r.band.label}: nessun componente sotto la tua norma${r.score >= 85 ? ', è un buon giorno per uno sforzo impegnativo' : ''}.`, tone: 'good' };

  const L = a.longevity;
  const strong = [...L.parts].filter((x) => isNum(x.score)).sort((x, y) => y.score * y.weight - x.score * x.weight)[0];
  out.longevity = {
    text: L.levers.length ? `Punto di forza: ${lc(strong?.label)}. La leva che sposta di più l’indice è ${lc(L.levers[0].label)} (pesa ${L.levers[0].weight}%).` : `Le abitudini su cui puoi agire sono tutte in fascia di rischio basso${strong ? `, con ${lc(strong.label)} come punto di forza` : ''}: mantienile.`,
    tone: (L.score ?? 0) >= 70 ? 'good' : (L.score ?? 0) >= 50 ? 'warn' : 'bad',
  };

  const per = a.hrvTrend.period;
  out.hrvRhr =
    a.hrvTrend.consecutiveBelow >= 3
      ? { text: `HRV sotto la tua media da 3 giorni${(r.rhrDelta ?? 0) > 2 ? ' con FC a riposo in salita: probabile stress sistemico o malessere in arrivo' : (a.pmc.load7 ?? 0) > (a.pmc.load28avg7 ?? 0) * 1.15 || (a.pmc.acwrPeak14?.value ?? 0) > 1.4 ? ' dopo un blocco di carico elevato: è la risposta al sovraccarico' : ' senza un aumento di allenamento: probabile stress extra-sportivo'}.`, tone: 'bad' }
      : (r.hrv7Z ?? 0) <= -1
        ? { text: 'La media dei 7 giorni è uscita sotto la tua zona normale: il recupero sta faticando, anche se la singola notte può sembrare ok.', tone: 'warn' }
        : (r.hrv7Z ?? 0) >= 1
          ? { text: 'Media dei 7 giorni sopra la zona normale: il sistema nervoso sta assorbendo bene allenamento e stress.', tone: 'good' }
          : { text: `Sistema nervoso stabile, dentro la tua zona normale${isNum(per.hrvChangePct) && Math.abs(per.hrvChangePct) >= 8 ? `; nel periodo l’HRV è ${per.hrvChangePct > 0 ? 'in crescita' : 'in calo'}` : ''}.`, tone: 'good' };

  const s = a.sleep;
  const sleepIssues = [
    (s.debt7 ?? 0) >= 3 && [s.debt7 / 3, `il debito della settimana (${fmtH(s.debt7)}) è il primo freno al recupero`],
    (s.bedtimeSdMin ?? 0) > 45 && [s.bedtimeSdMin / 45, `più della durata pesa l’irregolarità: l’orario di letto varia di ± ${s.bedtimeSdMin} min`],
    (s.period.deepPct ?? 20) < 13 && [1, 'poco sonno profondo: sedute intense serali, alcol e cene tardive sono i sospettati principali'],
    (s.period.efficiency ?? 100) < 87 && [0.9, 'molti risvegli: il tempo a letto non si traduce tutto in sonno'],
  ].filter(Boolean).sort((x, y) => y[0] - x[0]);
  out.sleep = sleepIssues.length
    ? { text: `${sleepIssues[0][1][0].toUpperCase()}${sleepIssues[0][1].slice(1)}.`, tone: (s.debt7 ?? 0) >= 6 ? 'bad' : 'warn' }
    : { text: 'Durata, regolarità e fasi nella norma: il sonno sta lavorando per te.', tone: 'good' };

  out.ans = intr
    ? (() => {
        const bad = intr.windows.filter((w) => w.tone !== 'good');
        return bad.length
          ? { text: `${bad.map((w) => `${w.label} ${intr.rows[w.from].label}-${intr.rows[w.to].label}`).join(' · ')}.`, tone: bad.some((w) => w.tone === 'bad') ? 'bad' : 'warn' }
          : { text: 'Notte che ha ricaricato e nessun picco di stress anomalo finora.', tone: 'good' };
      })()
    : { text: 'Nessun dato intraday disponibile per oggi.', tone: 'info' };

  out.pmc = p
    ? (p.acwr ?? 1) > 1.5 || p.tsb < -30
      ? { text: 'Il carico è salito più in fretta di quanto il fisico riesca ad assorbire: è la zona in cui arrivano infortuni e malanni.', tone: 'bad' }
      : (p.acwr ?? 1) > 1.3 || (a.pmc.rampRate ?? 0) > 7
        ? { text: 'Stai aumentando un po’ troppo in fretta: consolida questo volume prima di aggiungere.', tone: 'warn' }
        : p.tsb > 20
          ? { text: 'Molto fresco ma la forma di fondo sta calando: va bene solo se è uno scarico voluto.', tone: 'info' }
          : { text: `Progressione sostenibile: ${a.pmc.zone?.key === 'optimal' ? 'stai costruendo forma senza esagerare' : 'carico in equilibrio con il recupero'}.`, tone: 'good' }
    : { text: 'Carico insufficiente per il PMC.', tone: 'info' };
  out.ef = {
    text: isNum(a.efficiency.trendPct)
      ? a.efficiency.trendPct >= 2 ? 'Vai più veloce a parità di battiti: la base aerobica sta migliorando davvero.' : a.efficiency.trendPct <= -2 ? 'A parità di battiti vai più piano: fatica accumulata, caldo o un periodo di malessere.' : 'Efficienza stabile: per migliorarla serve più volume facile, non più intensità.'
      : 'Servono almeno 3 corse facili per il trend.',
    tone: (a.efficiency.trendPct ?? 0) <= -2 ? 'warn' : 'good',
  };
  out.zones = a.zones.pct
    ? { text: `${a.zones.pct.mid >= 25 ? 'Troppo tempo nella zona grigia: le facili non sono abbastanza facili e le dure non abbastanza dure.' : a.zones.pct.low >= 75 ? 'Distribuzione polarizzata corretta.' : 'Vicino all’80/20: rallenta un po’ le uscite facili.'}${a.zones.easyTooHard ? ` ${a.zones.easyTooHard} easy run troppo veloci.` : ''}`, tone: a.zones.pct.mid >= 25 ? 'warn' : 'good' }
    : { text: 'Nessuna corsa con dati di frequenza cardiaca.', tone: 'info' };
  const half = a.race.predictions.find((x) => x.key === 'half');
  out.race = {
    text: `Potenziale sulla mezza ${fmtDuration(half?.model)}${a.race.weeklyKm < 35 ? ': sotto i 35 km a settimana la tenuta degli ultimi km è il vero limite.' : ': il volume attuale lo sostiene.'}`,
    tone: a.race.weeklyKm < 25 ? 'warn' : 'info',
  };
  const recentConf = a.strength.conflicts.filter((c) => diffDays(a.today, c.date) <= 14);
  out.hybrid = recentConf.length
    ? { text: `${recentConf.length} volte negli ultimi 14 giorni le gambe pesanti sono arrivate a ridosso di una corsa importante: è la causa più comune di sedute fallite.`, tone: 'warn' }
    : { text: 'Pesi e corsa ben separati: nessuna interferenza di recupero.', tone: 'good' };
  out.volume = {
    text: a.strength.perWeek < 1 ? 'Meno di una seduta a settimana: due brevi sedute bastano per proteggere tendini e articolazioni.' : (a.strength.avgRpe ?? 0) >= 8.5 ? 'Sedute molto dure in media: tienine conto prima dei lunghi.' : 'Frequenza e intensità della forza adeguate.',
    tone: a.strength.perWeek < 1 || (a.strength.avgRpe ?? 0) >= 8.5 ? 'warn' : 'good',
  };
  out.runs = {
    text: a.zones.easyTooHard ? `${a.zones.easyTooHard} uscite facili con troppo tempo sopra la Z2 (⚠): rallentale.` : 'Le uscite facili rispettano l’intensità prevista.',
    tone: a.zones.easyTooHard ? 'warn' : 'good',
  };
  return { ...out, ...extraCardInsights(a) };
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
  const r = a.readiness.score ?? 80;
  const risk = overtrainingRisk(a);
  const tsb = a.pmc.latest?.tsb ?? 0;
  const z = hrZones(a);
  const paces = trainingPaces(a);
  const lastHard = lastOf(a, (x) => x.kind === 'run' && x.hard);
  const lastLong = lastOf(a, (x) => x.kind === 'run' && x.long);
  const lastLeg = lastOf(a, (x) => x.kind === 'strength' && ['Lower', 'Full Body'].includes(x.strength?.focus));
  const since = (x) => (x ? diffDays(a.today, x.date) : 99);
  const easy = paces ? `${fmtPace(paces.easy[0])}-${fmtPace(paces.easy[1])}/km` : `FC < ${z.z2Top} bpm`;
  if (r < 50 || risk >= 60 || a.illness?.current?.active) return { title: 'Riposo o mobilità 20-30’', why: a.illness?.current?.active ? 'segnali di malessere in corso' : `readiness ${r}, rischio overtraining ${risk}/100`, kind: 'rest' };
  if (r < 68 || tsb < -20) return { title: `Easy run 40-50’ in Z2 (${easy}, FC < ${z.z2Top})`, why: `readiness ${r}, TSB ${fmt(tsb, 1)}`, kind: 'easy' };
  if (since(lastLeg) <= 1) return { title: `Easy run 45’ (${easy}) oppure forza upper body`, why: `leg day ${since(lastLeg) === 0 ? 'oggi' : 'ieri'}: niente qualità per 48 h`, kind: 'easy' };
  // while the half-marathon plan runs, the next session is the plan's, not a generic one
  if (a.plan && a.today >= PLAN_START && a.today <= RACE_DATE) {
    const key = a.plan.current.sessions.find((x) => !x.optional);
    const opt = a.plan.current.sessions.find((x) => x.optional);
    if (key?.state === 'todo') return { title: `${key.title} · ${key.targetKm} km (${key.pace ?? ''}, FC ${key.hr ?? '—'})`, why: `uscita chiave della settimana ${a.plan.weekNo}, idealmente ${a.plan.habits.longDayName}`, kind: 'plan' };
    if (opt?.state === 'todo' && a.plan.optionalAdvice?.verdict === 'do') return { title: `${opt.title} · ${opt.targetKm} km (${opt.pace ?? ''})`, why: 'seconda uscita consigliata questa settimana', kind: 'plan' };
    return { title: 'Riposo, oppure corsa libera facile ≤ 45’ in Z2', why: `le sessioni del piano della settimana ${a.plan.weekNo} sono coperte`, kind: 'easy' };
  }
  if (since(lastHard) >= 3 && r >= 75)
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
  if ((a.sleep.debt7 ?? 0) >= 4) issues.push(`debito di sonno ${fmtH(a.sleep.debt7)}`);
  if ((r.hrvZ ?? 0) <= -1) issues.push(`HRV sotto baseline (z ${fmt(r.hrvZ, 2)})`);
  if ((a.pmc.latest?.acwr ?? 1) > 1.3) issues.push(`ACWR ${fmt(a.pmc.latest.acwr, 2)}`);
  if ((a.pmc.latest?.tsb ?? 0) < -25) issues.push(`TSB ${fmt(a.pmc.latest.tsb, 1)}`);

  if (kmMatch || /lung|long run|correre|corsa|uscita/.test(q)) {
    const km = kmMatch ? parseFloat(kmMatch[1].replace(',', '.')) : null;
    const longest = Math.max(0, ...a.activities.filter((x) => x.kind === 'run' && diffDays(a.today, x.date) < 28).map((x) => x.distance / 1000));
    if (km && longest && km > longest * 1.15) issues.push(`${km} km è +${Math.round((km / longest - 1) * 100)}% rispetto al lungo più lungo delle ultime 4 settimane (${fmt(longest, 1)} km)`);
    const verdict = issues.length >= 3 || (r.score ?? 80) < 50 || a.illness?.current?.active ? 'No' : issues.length ? 'Sì, con condizioni' : 'Sì';
    return [
      `${verdict}.`,
      issues.length ? `Fattori limitanti: ${issues.join('; ')}.` : `Readiness ${fmt(r.score)}, TSB ${fmt(a.pmc.latest?.tsb, 1)}, sonno medio ${fmtH(a.sleep.avg7)}: semaforo verde.`,
      verdict === 'No' ? `Alternativa: easy ${Math.min(km ?? 10, 10)} km sotto ${z.z2Top} bpm e rivaluta tra 48 h.` : `Esecuzione: ${paces ? `${fmtPace(paces.long)}/km` : 'ritmo conversazionale'}, FC < ${z.z2Top} bpm per i primi 2/3, 30-60 g di carboidrati/ora oltre i 75’.`,
      '(motore euristico: configura un provider AI per risposte libere)',
    ].join('\n');
  }
  if (/sonn|dorm|sleep|letto/.test(q))
    return `Ultimi 7 giorni: media ${fmtH(a.sleep.avg7)}, debito ${fmtH(a.sleep.debt7)}, efficienza ${fmt(a.sleep.efficiency7, 1)}%, deep ${fmt(a.sleep.deepPct7, 0)}%, REM ${fmt(a.sleep.remPct7, 0)}%. ${(a.sleep.debt7 ?? 0) >= 3 ? 'Recupera anticipando l’orario di letto, non con sonnellini lunghi.' : 'Quantità adeguata.'}`;
  if (/pesi|forza|palestra|squat|leg|gamb/.test(q)) return hybridText(a, 'quant');
  if (/gara|tempo|previs|mezza|maratona|10k|5k/.test(q))
    return a.race.predictions.map((p) => `${p.label}: ${fmtDuration(p.model)} (${fmtPace(p.pace)}/km)${p.garmin ? ` · Garmin ${fmtDuration(p.garmin)}` : ''}`).join('\n') + `\nBasato su ${a.race.vdotSource}${isNum(a.race.vo2max) ? ` ${fmt(a.race.vo2max, 1)}` : ''} e ${fmt(a.race.weeklyKm, 1)} km/sett.`;
  if (/hrv|stress|recuper|stanc|riposo|battery|come sto|stato/.test(q)) return summaryText(a);
  return `${judgeText(a, 'quant')}\n\n(motore euristico: per domande libere configura Gemini/OpenAI nelle impostazioni)`;
}

// --------------------------------------------------------------------- sleep coach
export function sleepCoachText(a, persona) {
  const s = a.sleep;
  const ln = s.lastNight;
  const lines = [openers[persona](a, (s.debt7 ?? 0) >= 6 ? 3 : (s.debt7 ?? 0) >= 3 ? 2 : 0), ''];
  lines.push('ARCHITETTURA');
  if (ln) lines.push(`• Stanotte ${fmtH(ln.hours)}, score ${fmt(ln.score)}: profondo ${fmt((ln.deep / ln.total) * 100, 0)}%, REM ${fmt((ln.rem / ln.total) * 100, 0)}%, veglia ${fmt((ln.awake ?? 0) / 60, 0)} min.`);
  lines.push(`• Media 7 notti: ${fmtH(s.avg7)}, efficienza ${fmt(s.efficiency7, 1)}%, profondo ${fmt(s.deepPct7, 0)}% (ottimale 15-25%), REM ${fmt(s.remPct7, 0)}% (ottimale 20-25%).`);
  lines.push('', 'REGOLARITÀ');
  lines.push(`• A letto in media alle ${s.bedtimeAvg ?? '—'} (± ${fmt(s.bedtimeSdMin)} min), sveglia alle ${s.wakeAvg ?? '—'} (± ${fmt(s.wakeSdMin)} min).${(s.bedtimeSdMin ?? 0) > 45 ? persona === 'sergeant' ? ' Orari da studente fuori sede: il tuo orologio biologico non sa più che fuso orario è.' : ' Variabilità oltre 45’: il ritmo circadiano ne risente più della durata stessa.' : ' Regolarità buona.'}`);
  if (s.shortNights14) lines.push(`• ${s.shortNights14} notti sotto le 6 h nelle ultime 2 settimane.`);
  lines.push('', 'LEGAME SONNO → RECUPERO');
  if (isNum(s.sleepHrvCorr)) {
    const strong = Math.abs(s.sleepHrvCorr) >= 0.3;
    lines.push(`• Correlazione ore di sonno / HRV notturno nel periodo: r = ${fmt(s.sleepHrvCorr, 2)}${strong && (s.hrvPerHour ?? 0) > 0 ? `: ogni ora di sonno in più vale circa +${fmt(s.hrvPerHour, 1)} ms di HRV.` : strong ? '.' : ': legame debole, il tuo HRV dipende più da carico e stress che dalla durata.'}`);
  } else lines.push('• Servono almeno 7 notti con HRV per stimare il legame.');
  const late = a.activities.filter((x) => diffDays(a.today, x.date) < 14 && x.hard && Number((x.start ?? '').slice(11, 13)) >= 19);
  if (late.length) lines.push(`• ${late.length} sedute dure dopo le 19:00 nelle ultime 2 settimane: alzano FC e temperatura notturne e tagliano il sonno profondo.`);
  const evening = a.ans.intraday?.windows.find((w) => w.label.startsWith('Stress serale'));
  if (evening) lines.push(`• Oggi stress serale elevato (${evening.label}): attivazione che ritarda l’addormentamento.`);
  if ((a.ans.intraday?.nightStress ?? 0) > 22) lines.push(`• Stress medio notturno ${fmt(a.ans.intraday.nightStress)}: il sistema nervoso non è sceso in modalità recupero.`);
  const wakeH = s.wakeAvg ? Number(s.wakeAvg.slice(0, 2)) + Number(s.wakeAvg.slice(3)) / 60 : 7;
  const bed = wakeH - s.need - 0.25;
  const bedClock = `${String(Math.floor((bed + 24) % 24)).padStart(2, '0')}:${String(Math.round(((bed % 1) + 1) % 1 * 60) % 60).padStart(2, '0')}`;
  lines.push('', 'PRESCRIZIONI');
  lines.push(`• A letto entro le ${bedClock} per coprire ${fmtH(s.need)} con la tua sveglia media${(s.debt7 ?? 0) >= 3 ? `; per 4 notti anticipa di altri 30’ per ripagare ${fmtH(s.debt7)} di debito` : ''}.`);
  lines.push('• Stessa sveglia anche nel weekend (± 30’), luce naturale entro 30’ dal risveglio.');
  lines.push('• Caffeina entro le 14:00, alcol zero nelle 3 h prima di dormire, camera 18-19 °C e buio totale.');
  if ((s.deepPct7 ?? 20) < 15 || late.length) lines.push('• Sedute intense entro le 19:00; dopo, solo mobilità o upper body leggero.');
  if ((s.efficiency7 ?? 100) < 88) lines.push('• Se non dormi dopo 20’ alzati, luce bassa, torna a letto solo con sonno.');
  return lines.join('\n');
}

// --------------------------------------------------------------------- wellness / illness
export function illnessText(a, persona) {
  const il = a.illness;
  const st = { ...il.stats, ...il.view.stats };
  const episodes = il.view.episodes;
  const lines = [openers[persona](a, il.current.active ? 3 : st.count ? 1 : 0), ''];
  lines.push('STATO ATTUALE');
  if (il.current.active) {
    const e = il.current.episode;
    lines.push(`• Segnali attivi${e ? ` da ${e.days} giorni (${e.label.toLowerCase()}, confidenza ${e.confidence}%)` : ' negli ultimi giorni'}: ${(il.current.today?.signals ?? []).join(', ') || 'deviazioni autonomiche'}.`);
    lines.push(persona === 'sergeant' ? '• Oggi l’unico allenamento autorizzato è dormire. Se ti vedo con le ripetute ti radio io.' : '• Niente intensità finché FC a riposo e HRV non tornano in baseline per 2 giorni consecutivi.');
  } else lines.push(`• Nessun segnale attivo: ${st.healthyStreak} giorni consecutivi nella norma.`);
  lines.push('', `STORICO (ultimi ${il.view.days} giorni)`);
  if (!episodes.length) lines.push('• Nessun episodio rilevato con la sensibilità attuale.');
  else {
    const byType = {};
    episodes.forEach((e) => (byType[e.label] = (byType[e.label] ?? 0) + 1));
    lines.push(`• ${st.count} episodi: ${Object.entries(byType).map(([k, v]) => `${v} × ${k.toLowerCase()}`).join(', ')}. Durata media ${fmt(st.avgDays, 1)} giorni, rientro in baseline in ${fmt(st.avgRecovery, 1)} giorni.`);
    episodes.slice(0, 3).forEach((e) => lines.push(`• ${e.start.slice(8)}/${e.start.slice(5, 7)}–${e.end.slice(8)}/${e.end.slice(5, 7)}: ${e.label.toLowerCase()} · FC riposo ${signed(e.markers.rhr, 1)} bpm, HRV ${signed(e.markers.hrv)}%${e.hardDuring.length ? ` · ${e.hardDuring.length} ${e.hardDuring.length === 1 ? 'seduta dura' : 'sedute dure'} durante l’episodio` : ''}.`));
  }
  lines.push('', 'PATTERN');
  if (st.afterHighLoad) lines.push(`• ${st.afterHighLoad}/${st.count} episodi preceduti da un carico settimanale ≥ 1,3× il normale: il tuo punto di rottura è il picco di volume, non il volume in sé.`);
  if (st.afterShortSleep) lines.push(`• ${st.afterShortSleep}/${st.count} episodi preceduti da notti più corte della tua media: il sonno è la tua prima linea di difesa.`);
  if (st.trainedHard) lines.push(`• In ${st.trainedHard} ${st.trainedHard === 1 ? 'episodio' : 'episodi'} hai continuato con sedute dure: allunga i tempi di recupero.`);
  if (!st.afterHighLoad && !st.afterShortSleep && st.count) lines.push('• Nessun trigger dominante tra carico e sonno: guarda a fattori esterni (stress lavorativo, viaggi, stagionalità).');
  if (!st.count) lines.push('• Dati insufficienti per un pattern.');
  lines.push('', 'PROTOCOLLO');
  lines.push('• Sintomi sopra il collo (naso, gola) e niente febbre: solo Z1-Z2 ≤ 40’. Sotto il collo (petto, febbre, dolori): riposo completo.');
  lines.push('• Rientro: 2 giorni di FC a riposo e HRV in baseline → 2-3 uscite facili → poi la qualità.');
  lines.push('• Analisi statistica su dati dell’orologio, non una diagnosi: con febbre, dolore toracico o sintomi persistenti consulta un medico.');
  return lines.join('\n');
}

// --------------------------------------------------------------------- half-marathon plan coach
export function planCoachText(a, persona) {
  const p = a.plan;
  const w = p.current;
  const key = w.sessions.find((s) => !s.optional);
  const opt = w.sessions.find((s) => s.optional);
  const prevWeek = p.weeks.find((x) => x.week === w.week - 1);
  const prevKey = prevWeek?.sessions.find((s) => !s.optional);
  const lines = [openers[persona](a, p.consecutiveMissed >= 2 || a.illness.current.active ? 3 : p.consecutiveMissed ? 2 : 0), ''];
  lines.push(`SETTIMANA ${w.week}/${p.totalWeeks} · ${w.phaseTitle}${w.tag ? ` · ${w.tag}` : ''} · obiettivo ${p.goal} (${p.goalPace}/km sul Garmin)`);
  if (key) {
    lines.push(`• Chiave: ${key.title} (${key.targetKm} km, ${key.pace ?? ''}, FC ${key.hr ?? '—'}) → ${key.state === 'done' ? 'FATTA ✓' : key.state === 'partial' ? 'fatta in parte' : `da fare, idealmente ${p.habits.longDayName}`}.`);
    (key.compliance?.notes ?? []).forEach((n) => lines.push(`  ${n.tone === 'good' ? '✓' : '•'} ${n.text}`));
  }
  if (opt) lines.push(`• Facoltativa: ${opt.title}. ${p.optionalAdvice?.text ?? (opt.state === 'done' ? 'Fatta ✓' : '')}`);
  if (prevKey) lines.push(`• Settimana scorsa: ${prevKey.title} → ${{ done: 'fatta ✓', partial: 'fatta in parte', missed: 'saltata ✗' }[prevKey.state] ?? prevKey.state}.${prevKey.compliance?.notes?.filter((n) => n.tone === 'warn').map((n) => ` ${n.text}.`).join('') ?? ''}`);
  lines.push('', 'REGOLE DEL PIANO APPLICATE AI TUOI DATI');
  if (p.consecutiveMissed >= 2) lines.push(`• ${p.consecutiveMissed} uscite chiave saltate di fila: l’obiettivo scende a ${p.goal}. Ripeti la settimana prima di andare avanti.`);
  else if (p.consecutiveMissed === 1) lines.push('• Hai saltato l’ultima uscita chiave: ripeti quella settimana invece di saltare avanti.');
  if (a.illness.current.active) lines.push('• Segnali di malessere in corso: rimanda la chiave di 2-3 giorni, il piano assorbe lo spostamento.');
  if (p.rhrAlarm) lines.push('• FC a riposo +5 bpm per 3 giorni: alleggerisci questa settimana (regola del piano).');
  if (p.habits.legClash.length) lines.push(`• I tuoi leg day di ${p.habits.legClash.join(' e ')} cadono nelle 48 h prima del lungo di ${p.habits.longDayName}: spostali a lunedì-mercoledì.`);
  else lines.push('• Pesi: nessun leg day nelle 48 h prima del lungo. Perfetto.');
  if (p.gelsActive && key?.targetKm >= 14) lines.push('• Gel ai minuti 30, 60 e 90, stesso prodotto della gara.');
  const next = p.gates.find((g) => !g.grade && (g.week ?? 99) >= w.week);
  if (next) lines.push(`• Prossimo controllo: settimana ${next.week} (${next.when}). A se ${next.a}.`);
  const graded = p.gates.filter((g) => g.grade);
  if (graded.length) lines.push(`• Controlli: ${graded.map((g) => `sett. ${g.week} → ${g.grade}`).join(', ')}.`);
  lines.push('', persona === 'sergeant' ? `ORDINE: ${nextSession(a).title}. Il sub-2 non arriva per grazia ricevuta.` : `Oggi: ${nextSession(a).title} (${nextSession(a).why}).`);
  return lines.join('\n');
}

export function extraCardInsights(a) {
  const p = a.plan;
  const il = a.illness;
  const key = p.current.sessions.find((s) => !s.optional);
  return {
    planOverview: { text: `Settimana ${p.weekNo}/${p.totalWeeks} · obiettivo ${p.goal} a ${p.goalPace}/km · aderenza chiavi ${fmt(p.adherence)}% (${p.keyDone} fatte, ${p.keyMissed} saltate).`, tone: p.consecutiveMissed >= 2 ? 'bad' : p.consecutiveMissed ? 'warn' : 'good' },
    planWeek: key ? { text: `${key.title}: ${key.state === 'done' ? 'fatta ✓' : key.state === 'partial' ? 'fatta in parte' : 'da fare'}. ${p.optionalAdvice ? p.optionalAdvice.text : ''}`, tone: key.state === 'done' ? 'good' : 'info' } : { text: 'Nessuna uscita in programma.', tone: 'info' },
    planGates: (() => {
      const g = [...p.gates].reverse().find((x) => x.grade);
      return g ? { text: `Ultimo controllo (sett. ${g.week}): ${g.grade}. ${g.detail}.`, tone: g.grade === 'A' ? 'good' : g.grade === 'B' ? 'warn' : 'bad' } : { text: 'Nessun controllo ancora eseguito: il primo è in settimana 9.', tone: 'info' };
    })(),
    illnessNow: il.current.active
      ? { text: `Segnali attivi: ${(il.current.today?.signals ?? []).join(', ') || 'deviazione autonomica'}. Niente intensità oggi.`, tone: 'bad' }
      : (il.current.today?.index ?? 0) >= 50
        ? { text: `Da monitorare: ${(il.current.today?.signals ?? []).join(', ')}, ma senza il quadro tipico di malessere (FC riposo ↑ con HRV ↓).`, tone: 'warn' }
        : { text: `Nessun segnale attivo · ${il.stats.healthyStreak} giorni consecutivi nella norma.`, tone: 'good' },
    illnessTimeline: { text: il.view.stats.count ? `${il.view.stats.count} ${il.view.stats.count === 1 ? 'episodio' : 'episodi'} negli ultimi ${il.view.days} giorni${il.view.stats.illness ? `, di cui ${il.view.stats.illness} compatibili con malattia` : ''}: picchi isolati di un giorno sono spesso alcol o una notte storta.` : `Nessun episodio negli ultimi ${il.view.days} giorni: il fisico ha retto bene.`, tone: il.view.stats.illness ? 'warn' : 'info' },
    illnessPatterns: { text: il.view.stats.count ? (il.view.stats.afterHighLoad >= il.view.stats.afterShortSleep && il.view.stats.afterHighLoad ? 'Il tuo punto debole sono i picchi di carico: la maggior parte degli episodi arriva dopo una settimana troppo piena.' : il.view.stats.afterShortSleep ? 'Il tuo punto debole è il sonno: gli episodi arrivano dopo notti più corte del solito.' : 'Nessun trigger dominante tra carico e sonno: guarda a stress, viaggi o stagionalità.') : 'Nessun episodio nel periodo: nessun pattern da analizzare.', tone: 'info' },
  };
}
