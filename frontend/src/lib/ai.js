import { apiFetch } from './api';
import { fmtDuration, fmtPace, round } from './util';
import { overtrainingRisk } from './insights';

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
    finestra_giorni: a.rangeDays,
    sorgente: a.scenario ? `${a.source}:${a.scenario}` : a.source,
    profilo: { fc_max: a.profile.maxHr, fc_riposo: a.profile.restHr, vo2max: a.race.vo2max, bisogno_sonno_h: a.sleep.need },
    readiness: { score: r.score, delta_vs_media30: r.delta, hrv_z: round(r.hrvZ, 2), fc_riposo_delta: round(r.rhrDelta, 1), componenti: { hrv: r.hrv, fc_riposo: r.rhr, sonno: r.sleep, stress: r.stress, body_battery: r.bb } },
    oggi_vitali: { hrv_ms: a.latest.hrv, hrv_status: a.latest.hrvStatus, fc_riposo: a.latest.rhr, stress_medio: a.latest.stress, bb_max: a.latest.bbMax, bb_min: a.latest.bbMin, passi: a.latest.steps, sonno_h: a.sleep.lastNight?.hours, sonno_score: a.sleep.lastNight?.score },
    longevity: { score: a.longevity.score, medie_30gg: a.longevity.averages },
    sonno: { media7_h: a.sleep.avg7, debito7_h: a.sleep.debt7, efficienza7_pct: a.sleep.efficiency7, deep7_pct: a.sleep.deepPct7, rem7_pct: a.sleep.remPct7, score7: a.sleep.score7 },
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
    serie_giornaliere: {
      colonne: ['data', 'hrv', 'fc_riposo', 'sonno_h', 'sonno_score', 'stress', 'bb_max', 'carico'],
      righe: a.hrvRhr.map((d, i) => {
        const s = a.sleep.rows[i];
        const day = a.ans.daily[i];
        return [d.date, d.hrv, d.rhr, s?.total, s?.score, day?.stress, day?.bbMax, round(loadByDate.get(d.date) ?? 0)];
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

// --------------------------------------------------------------------- prompts
const BASE = `Sei BIO-OS, un sistema esperto di telemetria biometrica, fisiologia dello sport e biohacking.
Rispondi SEMPRE in italiano. Basati solo sui dati JSON forniti: se un dato manca dillo, non inventarlo.
Cita numeri precisi (con unità). Non fare diagnosi mediche: se i dati suggeriscono un problema di salute, consiglia di consultare un medico.
Formato: testo semplice, elenchi con "•", niente markdown con asterischi o titoli con #.`;

const PERSONA_PROMPTS = {
  quant: 'Stile: Analista Quantitativo. Chirurgico, statistico: delta %, z-score, deviazioni standard, baseline. Compatto, zero retorica.',
  sergeant: 'Stile: Sergente Istruttore. Spietato, sarcastico, diretto. Smonta ogni scusa su sonno e allenamenti saltati. Frasi brevi e taglienti. Il bersaglio sono le abitudini, mai la persona.',
  strategist: 'Stile: Longevity & Performance Strategist. Proattivo, orientato al lungo termine (mesi/anni): collega i dati a longevità, prevenzione infortuni e picco di forma. Prescrizioni concrete e prioritarie.',
};

const TASKS = {
  judge: 'GIUDIZIO GLOBALE: giudica la giornata e le ultime settimane (recupero, bilanciamento corsa/pesi, sonno). Dimmi esattamente cosa sto sbagliando e la sessione ideale di oggi. Massimo 250 parole.',
  bioAudit: 'BIO-AUDIT: incrocia sonno, stress, HRV, FC a riposo e Body Battery. Valuta (in termini fisiologici) segni di infiammazione latente, sovraccarico del sistema nervoso o cattiva igiene del sonno. Chiudi con 3-5 prescrizioni pratiche per oggi. Massimo 220 parole.',
  runningCoach: 'AI RUNNING COACH: analizza il macro-ciclo (PMC, ACWR, distribuzione zone 80/20, Efficiency Factor, decoupling). Segnala se le corse facili sono troppo forti, stima il rischio di overtraining e genera la prossima sessione ideale con passi (min/km) e FC precisi. Massimo 250 parole.',
  hybrid: 'AI HYBRID STRATEGIST: valuta l’equilibrio tra forza e resistenza, i conflitti di interferenza e quando inserire le sedute di pesi rispetto ai lunghi e all’andamento HRV. Proponi una settimana tipo. Massimo 220 parole.',
};

export const INSIGHT_KEYS = ['readiness', 'longevity', 'hrvRhr', 'sleep', 'ans', 'pmc', 'ef', 'zones', 'race', 'runs', 'hybrid', 'volume'];

export function systemFor(persona) {
  return `${BASE}\n${PERSONA_PROMPTS[persona] ?? PERSONA_PROMPTS.quant}`;
}

export function taskPrompt(task, a, extra = {}) {
  const ctx = JSON.stringify(buildContext(a));
  if (task === 'insights')
    return `Per ciascuna card della dashboard genera UNA frase diagnostica (max 160 caratteri), specifica e numerica, come "HRV in calo del 14% per 3 giorni consecutivi nonostante volume stabile: possibile stress extra-sportivo".
Card: readiness (readiness score e anelli), longevity (indice longevità), hrvRhr (HRV e FC riposo vs baseline), sleep (architettura sonno e debito), ans (stress intraday vs Body Battery), pmc (CTL/ATL/TSB/ACWR), ef (efficienza aerobica e decoupling), zones (distribuzione zone 80/20), race (previsioni gara e VO2max), runs (ultime corse), hybrid (interferenza corsa/pesi), volume (volume e tonnellaggio forza).
Rispondi SOLO con un oggetto JSON con esattamente queste chiavi: ${INSIGHT_KEYS.join(', ')}.\n\nDATI:\n${ctx}`;
  if (task === 'chat') {
    const history = (extra.history ?? []).slice(-8).map((m) => `${m.role === 'user' ? 'UTENTE' : 'BIO-OS'}: ${m.text}`).join('\n');
    return `Rispondi alla domanda dell’utente usando i dati biometrici. Se è una decisione (es. "posso fare un lungo?"), inizia con un verdetto chiaro (Sì / Sì con condizioni / No) e poi le condizioni. Massimo 180 parole.\n\nDATI:\n${ctx}\n\nCONVERSAZIONE:\n${history}\nUTENTE: ${extra.question}`;
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
