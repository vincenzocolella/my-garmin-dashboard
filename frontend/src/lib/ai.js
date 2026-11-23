import { apiFetch } from './api';
import { fmtDuration, fmtH, fmtPace, round } from './util';
import { overtrainingRisk } from './insights';
import { dailySummary } from './summary';

export const PROVIDERS = {
  backend: 'Backend FastAPI (Gemini su server)',
  gemini: 'Gemini (chiave nel browser)',
  openai: 'OpenAI (chiave nel browser)',
  heuristic: 'Solo motore euristico',
};

export function aiAvailable(settings, backendStatus) {
  switch (settings.aiProvider) {
    case 'backend': return Boolean(backendStatus?.ai);
    case 'gemini': return Boolean(settings.geminiKey);
    case 'openai': return Boolean(settings.openaiKey);
    default: return false;
  }
}

// --------------------------------------------------------------------- context
export function buildContext(a) {
  const intr = a.ans.intraday;
  const r = a.readiness;
  const p = a.pmc.latest;
  const loadByDate = new Map();
  a.activities.forEach((x) => loadByDate.set(x.date, (loadByDate.get(x.date) ?? 0) + x.pmcLoad));
  return {
    oggi: a.today,
    finestra: a.rangeLabel,
    sorgente: a.scenario ? `${a.source}:${a.scenario}` : a.source,
    profilo: { fc_max: a.profile.maxHr, fc_riposo: a.profile.restHr, vo2max: a.race.vo2max, bisogno_sonno_h: a.sleep.need },
    readiness: {
      scala: '75 = tua norma, ogni deviazione standard dalla tua baseline 60gg vale 15 punti',
      score: r.score, fascia: r.band.label, delta_vs_media30: r.delta, media_periodo: r.periodMean,
      componenti_0_100: { sistema_nervoso_40pct: r.autonomic, sonno_30pct: r.sleep, stress_ieri_15pct: r.stress, carico_allenamento_15pct: r.load },
      hrv_notte_z_ln: round(r.hrvZ, 2), hrv_7gg_in_unita_swc: round(r.hrv7Z, 2), hrv_7gg_ms: r.hrv7ms, zona_normale_hrv_ms: [round(r.hrvBase.swcLo), round(r.hrvBase.swcHi)], fc_riposo_delta: round(r.rhrDelta, 1), rapporto_fatica_forma: r.loadRatio,
    },
    oggi_vitali: { hrv_ms: a.latest.hrv, hrv_status: a.latest.hrvStatus, fc_riposo: a.latest.rhr, stress_medio: a.latest.stress, bb_max: a.latest.bbMax, bb_min: a.latest.bbMin, passi: a.latest.steps, sonno: fmtH(a.sleep.lastNight?.hours), sonno_score: a.sleep.lastNight?.score },
    longevity: {
      score: a.longevity.score, finestra_giorni: a.longevity.window, eta: a.longevity.age, sesso: a.longevity.sex, copertura_pct: a.longevity.coverage,
      componenti: a.longevity.parts.map((x) => ({ voce: x.label, peso_pct: x.weight, punteggio: x.score, valore: x.value, riferimento: x.ref })),
      leve_principali: a.longevity.levers.map((x) => x.label),
    },
    riepilogo: dailySummary(a).context,
    sonno: { media7: fmtH(a.sleep.avg7), debito7: fmtH(a.sleep.debt7), efficienza7_pct: a.sleep.efficiency7, deep7_pct: a.sleep.deepPct7, rem7_pct: a.sleep.remPct7, score7: a.sleep.score7, periodo: { media: fmtH(a.sleep.period.avg), score: a.sleep.period.score, efficienza_pct: a.sleep.period.efficiency, deep_pct: a.sleep.period.deepPct, rem_pct: a.sleep.period.remPct, notti_sotto_6h: `${a.sleep.period.shortNights}/${a.sleep.period.nights}` } },
    stress_energia_periodo: a.ans.period,
    sistema_nervoso_oggi: intr ? { stress_notturno: intr.nightStress, ricarica_bb_notte: intr.bbGain, stress_medio_veglia: intr.dayMean, finestre: intr.windows.map((w) => `${w.label} ${intr.rows[w.from].label}-${intr.rows[w.to].label}`) } : null,
    carico: p ? { ctl: p.ctl, atl: p.atl, tsb: p.tsb, acwr: p.acwr, zona_tsb: a.pmc.zone?.label, ramp_rate_ctl_sett: a.pmc.rampRate } : null,
    corsa: {
      km_settimana_4sett: a.race.weeklyKm,
      ef_trend_pct: a.efficiency.trendPct,
      decoupling_medio_pct: a.efficiency.avgDecoupling,
      zone_pct_z12_z3_z45: a.zones.pct,
      easy_troppo_veloci: `${a.zones.easyTooHard}/${a.zones.easyCount}`,
      previsioni: Object.fromEntries(a.race.predictions.map((x) => [x.label, { modello: fmtDuration(x.model), garmin: x.garmin ? fmtDuration(x.garmin) : null }])),
    },
    forza: {
      sedute_settimana: a.strength.perWeek,
      tonnellaggio_periodo_kg: a.strength.tonnage,
      rpe_medio: a.strength.avgRpe,
      quota_neuromuscolare_pct: a.strength.nmShare,
      conflitti: a.strength.conflicts.slice(0, 6).map((c) => `${c.date} ${c.strength.strength?.focus ?? 'forza'} → ${c.run.name} (${c.gapH} h)`),
    },
    rischio_overtraining_0_100: overtrainingRisk(a),
    sonno_regolarita: { letto_medio: a.sleep.bedtimeAvg, sveglia_media: a.sleep.wakeAvg, sd_letto_min: a.sleep.bedtimeSdMin, sd_sveglia_min: a.sleep.wakeSdMin, corr_sonno_hrv: a.sleep.sleepHrvCorr, hrv_ms_per_ora_sonno: a.sleep.hrvPerHour, notti_sotto_6h_14gg: a.sleep.shortNights14 },
    malesseri: {
      attivo_ora: a.illness.current.active,
      segnali_oggi: a.illness.current.today?.signals,
      giorni_analizzati: a.illness.stats.daysScanned,
      episodi: a.illness.episodes.slice(0, 8).map((e) => ({ dal: e.start, al: e.end, giorni: e.days, tipo: e.label, confidenza: e.confidence, fc_riposo_max_delta: e.markers.rhr, hrv_min_pct: e.markers.hrv, carico_prima_x: e.loadRatio, sonno_prima_delta: fmtH(e.sleepBefore, { signed: true }), sedute_dure_durante: e.hardDuring.length, rientro_giorni: e.recoveryDays })),
    },
    piano_mezza: planContext(a.plan),
    zone_fc: { fonte: a.hrZoneCfg.label, zone_bpm: a.hrZoneCfg.ranges.map(([lo, hi], i) => `Z${i + 1} ${lo}-${hi}`) },
    serie_giornaliere: {
      colonne: ['data', 'hrv', 'fc_riposo', 'sonno', 'sonno_score', 'stress', 'bb_max', 'carico'],
      righe: a.hrvRhr.map((d, i) => {
        const s = a.sleep.rows[i];
        const day = a.ans.daily[i];
        return [d.date, d.hrv, d.rhr, fmtH(s?.total), s?.score, day?.stress, day?.bbMax, round(loadByDate.get(d.date) ?? 0)];
      }),
    },
    attivita: a.activities
      .filter((x) => x.date >= a.rangeStart)
      .slice(-30)
      .map((x) => ({
        data: x.date, tipo: x.kind, nome: x.name,
        km: x.distance ? round(x.distance / 1000, 2) : undefined,
        min: round(x.duration / 60), passo: x.pace ? fmtPace(x.pace) : undefined,
        fc: x.avgHr, fc_max: x.maxHr, cadenza: x.cadence ?? undefined,
        te: x.aerobicTE != null ? `${x.aerobicTE}/${x.anaerobicTE}` : undefined,
        decoupling: x.decoupling ?? undefined, rpe: x.rpe ?? undefined,
        focus: x.strength?.focus ?? undefined, volume_kg: x.strength?.volumeKg ?? undefined,
        carico: round(x.pmcLoad),
      })),
  };
}

function planContext(p) {
  const brief = (s) => ({ id: s.id, tipo: s.type, titolo: s.title, km: s.targetKm, ritmo: s.pace, fc: s.hr, facoltativa: s.optional, stato: s.state, corsa_abbinata: s.match ? { data: s.match.run.date, km: round(s.match.run.distance / 1000, 2), passo: fmtPace(s.match.run.pace), fc: s.match.run.avgHr, punteggio: s.match.score } : null, note: s.compliance?.notes.map((n) => n.text) });
  return {
    obiettivo: 'mezza maratona sotto le 2 ore (gara 4 aprile 2027), 1 uscita chiave a settimana + 1 facoltativa a settimane alterne',
    settimana: `${p.weekNo}/${p.totalWeeks}`, fase: p.current.phaseTitle, tag: p.current.tag ?? null,
    obiettivo_attuale: p.goal, ritmo_gara_garmin: p.goalPace,
    aderenza_pct: p.adherence, chiavi_fatte: p.keyDone, chiavi_parziali: p.keyPartial, chiavi_saltate: p.keyMissed, saltate_di_fila: p.consecutiveMissed,
    questa_settimana: p.current.sessions.map(brief),
    settimana_scorsa: p.weeks.find((w) => w.week === p.weekNo - 1)?.sessions.map(brief) ?? [],
    prossima_settimana: p.weeks.find((w) => w.week === p.weekNo + 1)?.sessions.map((s) => ({ titolo: s.title, desc: s.desc, km: s.targetKm, facoltativa: s.optional })) ?? [],
    consiglio_facoltativa: p.optionalAdvice?.text ?? null,
    controlli: p.gates.map((g) => ({ settimana: g.week, quando: g.when, esito: g.grade, dettaglio: g.detail })),
    abitudini: { giorno_lungo: p.habits.longDayName, leg_day: p.habits.legDays, leg_day_nelle_48h_prima_del_lungo: p.habits.legClash },
    fc_riposo_allarme_3gg: p.rhrAlarm,
  };
}

// --------------------------------------------------------------------- prompts
const BASE = `Sei l’assistente di Garmin Dashboard, esperto di dati Garmin, fisiologia dello sport e allenamento di corsa e forza.
Rispondi SEMPRE in italiano. Basati solo sui dati JSON forniti: se un dato manca dillo, non inventarlo.
Cita numeri precisi (con unità). Scrivi sempre le durate in ore e minuti (es. 7h10, 45 min), mai in ore decimali. Non fare diagnosi mediche: se i dati suggeriscono un problema di salute, consiglia di consultare un medico.
Formato: testo semplice, elenchi con "•", niente markdown con asterischi o titoli con #.`;

const PERSONA_PROMPTS = {
  quant: 'Stile: Analista Quantitativo. Chirurgico, statistico: delta %, z-score, deviazioni standard, baseline. Compatto, zero retorica.',
  sergeant: 'Stile: Sergente Istruttore. Spietato, sarcastico, diretto. Smonta ogni scusa su sonno e allenamenti saltati. Frasi brevi e taglienti. Il bersaglio sono le abitudini, mai la persona.',
  strategist: 'Stile: Longevity & Performance Strategist. Proattivo, orientato al lungo termine (mesi/anni): collega i dati a longevità, prevenzione infortuni e picco di forma. Prescrizioni concrete e prioritarie.',
};

const TASKS = {
  judge: 'GIUDIZIO GLOBALE: giudica la giornata e le ultime settimane (recupero, bilanciamento corsa/pesi, sonno). Dimmi esattamente cosa sto sbagliando e la sessione ideale di oggi. Massimo 250 parole.',
  summary: 'COME STAI: racconta il mio stato complessivo come farebbe una persona esperta che conosce bene i miei dati, in modo interpretativo e poco tecnico. Usa soprattutto "riepilogo" (ieri, stanotte, oggi_finora, settimana) e il resto dei dati come contesto. Focus su salute, sonno, stress, energia e recupero; nomina l’allenamento solo se spiega qualcosa. Niente sigle (HRV, TSB, ACWR, z-score) senza tradurle in parole semplici, pochi numeri e solo quelli che contano. Struttura: una frase di sintesi; "Ieri:" (giornata e come si è chiusa); "Stanotte:"; "Oggi:" SOLO se riepilogo.oggi_disponibile è true, altrimenti non nominare la giornata di oggi oltre al risveglio; "Settimana:" (tendenze e cosa le spiega); "Per oggi:" 2-3 consigli pratici di stile di vita. Massimo 230 parole. Questo stile semplice vale qualunque sia la personalità impostata, che ne cambia solo il tono.',
  runningCoach: 'AI RUNNING COACH: analizza il macro-ciclo (PMC, ACWR, distribuzione zone 80/20, Efficiency Factor, decoupling). Segnala se le corse facili sono troppo forti, stima il rischio di overtraining e genera la prossima sessione ideale con passi (min/km) e FC precisi. Massimo 250 parole.',
  sleep: 'AI SLEEP COACH: analizza architettura del sonno (profondo, REM, veglia), debito, regolarità degli orari, legame tra ore di sonno e HRV, effetto di allenamenti serali e stress notturno. Chiudi con prescrizioni concrete e personalizzate (orario di letto preciso calcolato dalla sveglia media). Massimo 230 parole.',
  illness: 'AI HEALTH DETECTIVE: analizza gli episodi di malessere rilevati (malattia, sovraccarico, debito di sonno, stress), il loro contesto (carico e sonno prima, allenamenti durante, tempi di rientro) e lo stato attuale. Individua i trigger ricorrenti e dai un protocollo di prevenzione e di rientro. Ricorda che è un’analisi statistica e non una diagnosi. Massimo 230 parole.',
  plan: 'AI PLAN COACH del piano mezza maratona sub-2:00: valuta la settimana corrente e le sessioni abbinate automaticamente (aderenza a distanza, ritmi dei blocchi e FC di controllo), decidi se fare la seconda uscita facoltativa in base a readiness, carico e malesseri, applica le regole del piano (chiave saltata → ripeti la settimana, 2 saltate → rivedi obiettivo B/C, niente gambe pesanti nelle 48 h prima delle chiavi, gel dai lunghi della settimana 6, FC riposo +5 per 3 giorni → alleggerisci) e adatta i consigli ai dati reali. Indica giorno, ritmi e FC della prossima uscita. Massimo 250 parole.',
  hybrid: 'AI HYBRID STRATEGIST: valuta l’equilibrio tra forza e resistenza, i conflitti di interferenza e quando inserire le sedute di pesi rispetto ai lunghi e all’andamento HRV. Proponi una settimana tipo. Massimo 220 parole.',
};

export const INSIGHT_KEYS = ['readiness', 'longevity', 'hrvRhr', 'sleep', 'ans', 'pmc', 'ef', 'zones', 'race', 'runs', 'hybrid', 'volume', 'planOverview', 'planWeek', 'planGates', 'illnessNow', 'illnessTimeline', 'illnessPatterns'];

export function systemFor(persona) {
  return `${BASE}\n${PERSONA_PROMPTS[persona] ?? PERSONA_PROMPTS.quant}`;
}

export function taskPrompt(task, a, extra = {}) {
  const ctx = JSON.stringify(buildContext(a));
  if (task === 'insights')
    return `Per ciascuna card della dashboard genera UNA frase interpretativa (max 160 caratteri) che dica cosa significano i dati e cosa ne consegue, SENZA ripetere i numeri già mostrati nella card (KPI e grafici sono già visibili). Esempio: "HRV in calo da 3 giorni senza un aumento di allenamento: probabile stress extra-sportivo, proteggi il sonno".
Card: readiness (recupero di stamattina vs la tua norma: sistema nervoso, sonno, stress di ieri, carico), longevity (abitudini e fitness vs popolazione), hrvRhr (HRV e FC riposo vs baseline), sleep (architettura sonno e debito), ans (stress intraday vs Body Battery), pmc (CTL/ATL/TSB/ACWR), ef (efficienza aerobica e decoupling), zones (distribuzione zone 80/20), race (previsioni gara e VO2max), runs (ultime corse), hybrid (interferenza corsa/pesi), volume (volume e tonnellaggio forza), planOverview (andamento piano mezza sub-2), planWeek (sessioni di questa settimana), planGates (controlli A/B/C), illnessNow (radar sintomi: segnali di malessere oggi), illnessTimeline (radar sintomi: storico), illnessPatterns (radar sintomi: trigger).
Rispondi SOLO con un oggetto JSON con esattamente queste chiavi: ${INSIGHT_KEYS.join(', ')}.\n\nDATI:\n${ctx}`;
  if (task === 'chat') {
    const history = (extra.history ?? []).slice(-8).map((m) => `${m.role === 'user' ? 'UTENTE' : 'ASSISTENTE'}: ${m.text}`).join('\n');
    return `Rispondi alla domanda dell’utente usando i suoi dati Garmin. Se è una decisione (es. "posso fare un lungo?"), inizia con un verdetto chiaro (Sì / Sì con condizioni / No) e poi le condizioni. Massimo 180 parole.\n\nDATI:\n${ctx}\n\nCONVERSAZIONE:\n${history}\nUTENTE: ${extra.question}`;
  }
  const run = extra.run
    ? `\n\nANALIZZA IN DETTAGLIO ANCHE QUESTA SESSIONE:\n${JSON.stringify({ data: extra.run.date, nome: extra.run.name, km: round(extra.run.distance / 1000, 2), durata: fmtDuration(extra.run.duration), passo: fmtPace(extra.run.pace), fc: extra.run.avgHr, fc_max: extra.run.maxHr, cadenza: extra.run.cadence, te: [extra.run.aerobicTE, extra.run.anaerobicTE], zone_s: extra.run.zones, decoupling: extra.run.decoupling, ef: round(extra.run.ef, 3) })}`
    : '';
  return `${TASKS[task]}${run}\n\nDATI:\n${ctx}`;
}

// --------------------------------------------------------------------- transport
export async function callAI(settings, { system, prompt, json = false, signal }) {
  switch (settings.aiProvider) {
    case 'backend': {
      const data = await apiFetch(settings, '/ai', { method: 'POST', body: { system, prompt, json }, signal });
      return data.text;
    }
    case 'gemini': {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.geminiModel)}:generateContent`, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': settings.geminiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          ...(json ? { generationConfig: { responseMimeType: 'application/json' } } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`Gemini: ${data.error?.message ?? res.status}`);
      return (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    }
    case 'openai': {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.openaiKey}` },
        body: JSON.stringify({
          model: settings.openaiModel,
          messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
          ...(json ? { response_format: { type: 'json_object' } } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`OpenAI: ${data.error?.message ?? res.status}`);
      return data.choices?.[0]?.message?.content ?? '';
    }
    default:
      throw new Error('Nessun provider AI configurato');
  }
}

export function parseJson(text) {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '');
  return JSON.parse(clean);
}

/** Strip markdown emphasis models add despite instructions. */
export const cleanText = (t) => (t ?? '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#+\s*/gm, '').trim();
