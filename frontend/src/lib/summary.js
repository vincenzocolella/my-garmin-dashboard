// "Come stai": a plain-language reading of yesterday, last night, today so far and the last 7 days.
// Health first (sleep, stress, energy, recovery); training only when it explains something.
import { addDays, fmt, fmtH, isNum, mean, round, sd, toDate } from './util';

const longDay = new Intl.DateTimeFormat('it-IT', { weekday: 'long', timeZone: 'UTC' });
const dayName = (iso) => longDay.format(toDate(iso));

/** Personal norm: mean and SD of the 30 days before `endIdx` (exclusive). */
function norm(rows, endIdx, get, minSd) {
  const v = rows.slice(Math.max(0, endIdx - 30), Math.max(0, endIdx)).map(get).filter(isNum);
  if (v.length < 7) return null;
  return { m: mean(v), s: Math.max(sd(v) ?? 0, minSd) };
}
const zOf = (v, n) => (isNum(v) && n ? (v - n.m) / n.s : null);
const hoursOf = (r) => (r?.sleep?.total ? r.sleep.total / 3600 : null);
/** "un po’" / "decisamente" / "molto" for a deviation in SD units. */
const amount = (z) => (Math.abs(z) >= 2 ? 'molto' : Math.abs(z) >= 1.2 ? 'decisamente' : 'un po’');
const clock = (h) => `${String(Math.floor((h + 24) % 24)).padStart(2, '0')}:${String(Math.round((((h % 1) + 1) % 1) * 60) % 60).padStart(2, '0')}`;
const thousand = (n) => (isNum(n) ? (n >= 1000 ? `${fmt(n / 1000, 1)} mila` : fmt(n)) : '—');

function sleepQuality(score) {
  if (!isNum(score)) return null;
  if (score >= 85) return 'ottima';
  if (score >= 75) return 'buona';
  if (score >= 60) return 'discreta';
  return 'scarsa';
}

export function dailySummary(a, now = new Date()) {
  const rows = a.rowsAll;
  const ti = rows.length - 1; // today
  const T = rows[ti];
  const yi = ti - 1;
  const Y = rows[yi];
  const need = a.sleep.need;
  const R = a.readinessAll;
  const rT = R[ti];
  const ill = new Map(a.illness.series.map((d) => [d.date, d]));
  const intr = a.ans.intraday?.rows?.length && a.ans.intraday ? a.ans.intraday : null;

  const nStress = norm(rows, yi, (r) => r.stress, 4);
  const nSteps = norm(rows, yi, (r) => r.steps, 1200);
  const nSleep = norm(rows, ti, hoursOf, 0.4);
  const nDrain = norm(rows, yi, (r) => r.bbDrained, 6);
  const issues = []; // {key, weight} used to pick the headline cause and the advice
  const sections = [];

  // ------------------------------------------------------------------ yesterday
  {
    const text = [];
    const facts = [];
    const zS = zOf(Y?.stress, nStress);
    if (isNum(Y?.stress)) {
      let feel;
      if (Y.stress <= 22) feel = 'una giornata molto tranquilla per il sistema nervoso';
      else if (!isNum(zS) || Math.abs(zS) < 0.5) feel = 'una giornata nella tua media come tensione';
      else if (zS > 0) feel = `una giornata ${amount(zS)} più tesa del solito`;
      else feel = `una giornata ${amount(zS)} più rilassata del solito`;
      text.push(`Ieri (${dayName(Y.date)}) è stata ${feel}.`);
      facts.push({ label: 'Stress medio', value: fmt(Y.stress), tone: (zS ?? 0) >= 1 ? 'warn' : (zS ?? 0) <= -0.5 ? 'good' : undefined });
      if ((zS ?? 0) >= 1) issues.push({ key: 'stressY', weight: zS });
    } else text.push(`Per ieri (${dayName(Y?.date ?? addDays(a.today, -1))}) non ho dati sullo stress.`);

    if (isNum(Y?.bbCharged) && isNum(Y?.bbDrained)) {
      const bal = Y.bbCharged - Y.bbDrained;
      const zD = zOf(Y.bbDrained, nDrain);
      const low = isNum(Y.bbMin) && Y.bbMin <= 15;
      if (bal <= -15) text.push(`Hai speso più energia di quanta ne avessi recuperata${low ? ', arrivando a sera con la batteria quasi a terra' : ''}${(zD ?? 0) >= 1 ? ': consumo più alto del tuo solito' : ''}.`);
      else if (bal >= 15) text.push('Il bilancio energetico è stato positivo: hai recuperato più di quanto hai consumato.');
      else text.push(`Energia consumata e recuperata più o meno in pari${low ? ', anche se in serata la batteria era molto bassa' : ''}.`);
      facts.push({ label: 'Batteria', value: `+${fmt(Y.bbCharged)} / −${fmt(Y.bbDrained)}`, tone: bal <= -15 ? 'warn' : bal >= 15 ? 'good' : undefined });
      if (bal <= -15) issues.push({ key: 'energy', weight: 1 });
    }

    if (isNum(Y?.steps)) {
      const zP = zOf(Y.steps, nSteps);
      if (Y.steps < 4000) text.push(`Poco movimento: ${thousand(Y.steps)} passi.`);
      else if ((zP ?? 0) >= 1) text.push(`Giornata molto attiva: ${thousand(Y.steps)} passi, più del solito.`);
      else if ((zP ?? 0) <= -1) text.push(`Movimento sotto la tua media (${thousand(Y.steps)} passi).`);
      facts.push({ label: 'Passi', value: thousand(Y.steps), tone: Y.steps < 4000 ? 'warn' : undefined });
      if (Y.steps < 4000) issues.push({ key: 'steps', weight: 0.6 });
    }

    const acts = a.activities.filter((x) => x.date === Y?.date);
    if (acts.length) {
      const hard = acts.some((x) => x.hard || x.long || (x.kind === 'strength' && (x.rpe ?? 0) >= 8));
      const names = acts.map((x) => (x.kind === 'run' && x.distance ? `${x.name} (${fmt(x.distance / 1000, 1)} km)` : x.name)).join(', ');
      text.push(`In più c’è stato un allenamento${acts.length > 1 ? ' doppio' : ''} — ${names}${hard ? ', piuttosto impegnativo' : ', leggero'}.`);
    }
    if (ill.get(Y?.date)?.flagged) text.push('I segnali del corpo erano già fuori dalla tua norma, come capita quando si sta covando qualcosa.');
    sections.push({ key: 'ieri', title: 'Ieri', text, facts });
  }

  // ------------------------------------------------------------------ last night
  {
    const text = [];
    const facts = [];
    const h = hoursOf(T);
    if (!T?.sleep && !isNum(T?.hrv)) {
      text.push('La notte appena passata non risulta ancora sincronizzata: apri Garmin Connect sul telefono e poi premi Sync.');
    } else {
      if (isNum(h)) {
        const gap = h - need;
        const q = sleepQuality(T.sleep?.score);
        const vsUsual = isNum(nSleep?.m) && Math.abs(h - nSleep.m) >= 0.5 ? `, ${fmtH(Math.abs(h - nSleep.m))} ${h > nSleep.m ? 'più' : 'meno'} del tuo solito` : '';
        const len = gap >= -0.25 ? 'abbastanza per il tuo bisogno' : gap >= -1 ? 'un po’ meno di quanto ti serve' : 'decisamente meno di quanto ti serve';
        text.push(`Stanotte hai dormito ${fmtH(h)}, ${len}${vsUsual}${q ? `, con una qualità ${q}` : ''}.`);
        const s = T.sleep;
        const extra = [];
        if (s.total && isNum(s.deep) && s.deep / s.total < 0.12) extra.push('poco sonno profondo (quello che ripara il fisico)');
        if (s.total && isNum(s.rem) && s.rem / s.total < 0.15) extra.push('poco REM (quello che recupera la mente)');
        if ((s.awake ?? 0) >= 45 * 60) extra.push(`diversi risvegli (${fmt(s.awake / 60)} min svegli)`);
        if (extra.length) text.push(`Da notare: ${extra.join(', ')}.`);
        facts.push({ label: 'Sonno', value: fmtH(h), tone: gap < -1 ? 'bad' : gap < -0.25 ? 'warn' : 'good' });
        if (isNum(s.score)) facts.push({ label: 'Qualità', value: fmt(s.score), tone: s.score < 60 ? 'bad' : s.score < 75 ? 'warn' : 'good' });
        if (gap < -0.75) issues.push({ key: 'sleepNight', weight: -gap });
      }
      // nervous-system recovery: HRV vs your log baseline and resting HR
      const zH = rT?.hrvZ;
      const dR = rT?.rhrDelta;
      if (isNum(zH) || isNum(dR)) {
        const hrvBad = (zH ?? 0) <= -1;
        const hrvGood = (zH ?? 0) >= 0.7;
        const rhrBad = (dR ?? 0) >= 3;
        let msg;
        if (hrvBad && rhrBad) msg = `Il recupero non è stato completo: battito a riposo più alto del solito (+${fmt(dR)}) e variabilità cardiaca bassa. È il quadro tipico di stress accumulato, alcol, cena tardiva o di un malessere in arrivo.`;
        else if (hrvBad) msg = 'La variabilità cardiaca stanotte era sotto la tua norma: il sistema nervoso è ancora in modalità “allerta” più che “recupero”.';
        else if (rhrBad) msg = `Il battito a riposo è più alto del solito (+${fmt(dR)} battiti): spesso è il primo segnale di stanchezza, disidratazione o di qualcosa in arrivo.`;
        else if (hrvGood && (dR ?? 0) <= 0) msg = 'Il sistema nervoso si è ripreso molto bene: battito a riposo basso e variabilità cardiaca sopra la tua media.';
        else msg = 'Dal punto di vista del cuore il recupero notturno è nella tua norma.';
        text.push(msg);
        if (isNum(T.rhr)) facts.push({ label: 'Battito a riposo', value: `${fmt(T.rhr)}`, tone: rhrBad ? 'bad' : (dR ?? 0) <= -1 ? 'good' : undefined });
        if (isNum(T.hrv)) facts.push({ label: 'Variabilità', value: `${fmt(T.hrv)} ms`, tone: hrvBad ? 'bad' : hrvGood ? 'good' : undefined });
        if (hrvBad || rhrBad) issues.push({ key: 'autonomic', weight: 1.5 + (hrvBad && rhrBad ? 1 : 0) });
      }
      const wakeBb = intr && a.ans.intraday.sleepTo != null ? intr.rows[a.ans.intraday.sleepTo]?.bb : T.bbMax;
      if (isNum(wakeBb)) {
        text.push(wakeBb >= 75 ? `Al risveglio la batteria era a ${fmt(wakeBb)}: buona ricarica.` : wakeBb >= 50 ? `Al risveglio la batteria era a ${fmt(wakeBb)}: ricarica parziale.` : `Al risveglio la batteria era solo a ${fmt(wakeBb)}: la notte non è bastata a ricaricarti.`);
        facts.push({ label: 'Batteria al risveglio', value: fmt(wakeBb), tone: wakeBb < 50 ? 'warn' : wakeBb >= 75 ? 'good' : undefined });
        if (wakeBb < 50) issues.push({ key: 'lowBattery', weight: 1 });
      }
    }
    sections.push({ key: 'notte', title: 'Stanotte', text, facts });
  }

  // ------------------------------------------------------------------ today so far (only with enough of the day behind us)
  const hourNow = now.getHours() + now.getMinutes() / 60;
  const intrD = a.ans.intraday;
  const awakeBins = intrD ? intrD.rows.length - (intrD.sleepTo ?? 28) : 0;
  const todayAvailable = Boolean(intrD) && a.ans.intraday.rows.length > 0 && hourNow >= 11 && awakeBins >= 12;
  if (todayAvailable) {
    const text = [];
    const facts = [];
    const cur = intrD.current?.bb;
    const start = intrD.sleepTo != null ? intrD.rows[intrD.sleepTo]?.bb : null;
    const hoursAwake = awakeBins / 4;
    if (isNum(cur) && isNum(start)) {
      const rate = (start - cur) / Math.max(1, hoursAwake);
      text.push(`Finora la batteria è passata da ${fmt(start)} a ${fmt(cur)}${rate >= 6 ? ': stai consumando in fretta, la giornata è intensa' : rate <= 2.5 ? ': giornata finora leggera' : ': consumo regolare'}.`);
      facts.push({ label: 'Batteria ora', value: fmt(cur), tone: cur < 25 ? 'bad' : cur < 45 ? 'warn' : undefined });
      if (cur < 25) issues.push({ key: 'lowBatteryNow', weight: 1 });
    }
    if (isNum(intrD.dayMean)) {
      const z = zOf(intrD.dayMean, nStress);
      text.push(!isNum(z) || Math.abs(z) < 0.5 ? 'Lo stress di oggi è nella tua media.' : z > 0 ? `Oggi lo stress è ${amount(z)} più alto del solito.` : 'Oggi il sistema nervoso è più tranquillo del solito.');
      facts.push({ label: 'Stress finora', value: fmt(intrD.dayMean), tone: (z ?? 0) >= 1 ? 'warn' : undefined });
      if ((z ?? 0) >= 1) issues.push({ key: 'stressToday', weight: z });
    }
    const peaks = intrD.windows.filter((w) => w.tone !== 'good' && w.from >= (intrD.sleepTo ?? 0));
    if (peaks.length) text.push(`Momenti da segnalare: ${peaks.map((w) => `${w.label.replace(/ \(\d+\)$/, '').toLowerCase()} tra le ${intrD.rows[w.from].label} e le ${intrD.rows[w.to].label}`).join('; ')}.`);
    if (isNum(T.steps)) facts.push({ label: 'Passi', value: thousand(T.steps) });
    sections.push({ key: 'oggi', title: 'Oggi finora', text, facts });
  }

  // ------------------------------------------------------------------ last 7 days
  {
    const text = [];
    const facts = [];
    const nights = rows.slice(ti - 6, ti + 1);
    const days = rows.slice(yi - 6, yi + 1);
    const hs = nights.map(hoursOf).filter(isNum);
    const avgH = mean(hs);
    const debt = hs.reduce((s, h) => s + (need - h), 0);
    if (isNum(avgH)) {
      const reg = a.sleep.bedtimeSdMin;
      const regTxt = isNum(reg) ? (reg > 60 ? ' con orari molto variabili' : reg > 40 ? ' con orari un po’ variabili' : ' con orari regolari') : '';
      const shortest = nights.filter((r) => hoursOf(r)).sort((x, y) => hoursOf(x) - hoursOf(y))[0];
      text.push(`Sonno: in media ${fmtH(avgH)} a notte${regTxt}. ${debt >= 5 ? `Hai accumulato un debito importante (${fmtH(debt)} in una settimana): si sente su umore, fame e recupero.` : debt >= 2.5 ? `Manca qualcosa (${fmtH(debt)} sotto il bisogno nella settimana).` : 'Quantità adeguata al tuo bisogno.'}${shortest && hoursOf(shortest) < 6 ? ` La notte più corta è stata quella di ${dayName(shortest.date)} (${fmtH(hoursOf(shortest))}).` : ''}`);
      facts.push({ label: 'Sonno medio', value: fmtH(avgH), tone: debt >= 5 ? 'bad' : debt >= 2.5 ? 'warn' : 'good' });
      if (debt >= 2.5) issues.push({ key: 'sleepDebt', weight: debt / 2.5 });
      if (isNum(reg) && reg > 45) issues.push({ key: 'irregular', weight: 0.8 });
    }
    // recovery trend: readiness over the week and the 7-day HRV vs normal
    const wr = R.slice(ti - 6, ti + 1).filter((r) => isNum(r.score));
    if (wr.length >= 4) {
      const first = mean(wr.slice(0, 3).map((r) => r.score));
      const last = mean(wr.slice(-3).map((r) => r.score));
      const best = wr.reduce((b, r) => (r.score > b.score ? r : b));
      const worst = wr.reduce((b, r) => (r.score < b.score ? r : b));
      const dir = last - first >= 8 ? 'in miglioramento nel corso della settimana' : last - first <= -8 ? 'in calo negli ultimi giorni' : 'abbastanza stabile';
      const z7 = rT?.hrv7Z;
      const hrvTxt = isNum(z7) ? (z7 <= -1 ? ' La variabilità cardiaca media della settimana è sotto la tua norma: il corpo sta lavorando in salita.' : z7 >= 1 ? ' La variabilità cardiaca media è sopra la tua norma: segno di un buon adattamento.' : '') : '';
      text.push(`Recupero ${dir}: il giorno migliore è stato ${dayName(best.date)}, il più faticoso ${dayName(worst.date)}.${hrvTxt}`);
      facts.push({ label: 'Readiness media', value: fmt(mean(wr.map((r) => r.score))) });
      if ((z7 ?? 0) <= -1) issues.push({ key: 'hrvWeek', weight: 1.2 });
    }
    const st = days.map((r) => r.stress).filter(isNum);
    if (st.length >= 4) {
      const z = zOf(mean(st), nStress);
      const tense = days.filter((r) => (zOf(r.stress, nStress) ?? 0) >= 1).length;
      text.push(`Stress: ${!isNum(z) || Math.abs(z) < 0.5 ? 'settimana nella tua media' : z > 0 ? `settimana ${amount(z)} più tesa del solito` : 'settimana più tranquilla del solito'}${tense ? `, con ${tense} ${tense === 1 ? 'giornata' : 'giornate'} sopra le righe` : ''}.`);
      facts.push({ label: 'Stress medio', value: fmt(mean(st)), tone: (z ?? 0) >= 1 ? 'warn' : undefined });
      if ((z ?? 0) >= 0.8) issues.push({ key: 'stressWeek', weight: z });
    }
    const deficit = days.filter((r) => isNum(r.bbCharged) && isNum(r.bbDrained) && r.bbDrained > r.bbCharged + 10).length;
    const steps = mean(days.map((r) => r.steps));
    const move = [];
    if (deficit >= 4) move.push(`in ${deficit} giorni su 7 hai consumato più energia di quanta ne hai recuperata`);
    if (isNum(steps)) move.push(`${thousand(steps)} passi al giorno${steps < 5000 ? ', pochi' : steps >= 9000 ? ', ottimo' : ''}`);
    const load7 = a.pmc.load7;
    const load4 = a.pmc.load28avg7;
    if (isNum(load7) && load4 > 30) {
      if (load7 > load4 * 1.3) move.push('allenamenti più pesanti del tuo solito');
      else if (load7 < load4 * 0.6) move.push('allenamenti più leggeri del solito');
    }
    if (move.length) text.push(`Energia e movimento: ${move.join('; ')}.`);
    if (isNum(steps)) facts.push({ label: 'Passi medi', value: thousand(steps), tone: steps < 5000 ? 'warn' : undefined });
    if (deficit >= 4) issues.push({ key: 'energyWeek', weight: 1 });
    const flagged = days.concat([T]).filter((r) => ill.get(r.date)?.flagged).length;
    if (a.illness.current.active) text.push('Il Radar sintomi vede un probabile malessere in corso: dai priorità al riposo finché i valori non tornano nella norma.');
    else if (flagged) text.push(`In ${flagged} ${flagged === 1 ? 'giorno' : 'giorni'} della settimana i segnali del corpo sono usciti dalla norma, senza però formare un episodio.`);
    sections.push({ key: 'settimana', title: 'Ultimi 7 giorni', text, facts });
  }

  // ------------------------------------------------------------------ headline
  // no night synced yet: don't judge today from yesterday's numbers
  const synced = Boolean(T?.sleep) || isNum(T?.hrv);
  const score = synced ? rT?.score : null;
  const comps = [['autonomic', rT?.autonomic], ['sleep', rT?.sleep], ['stress', rT?.stress], ['load', rT?.load]].filter(([, v]) => isNum(v)).sort((x, y) => x[1] - y[1]);
  const CAUSE = {
    autonomic: 'il sistema nervoso non ha ancora recuperato del tutto',
    sleep: 'il sonno non è stato sufficiente',
    stress: 'la tensione di ieri pesa ancora',
    load: 'gli allenamenti recenti si fanno sentire',
  };
  const cause = comps[0] && comps[0][1] < 65 ? CAUSE[comps[0][0]] : null;
  let headline;
  let tone;
  let chip;
  if (a.illness.current.active) {
    tone = 'bad'; chip = 'Possibile malessere';
    headline = 'Il corpo mostra i segnali tipici di un malessere in arrivo o in corso: oggi è una giornata da prendere con calma.';
  } else if (!isNum(score)) {
    tone = 'neutral'; chip = 'Dati parziali';
    headline = 'Non ho ancora abbastanza dati di stanotte per dirti come stai: sincronizza l’orologio.';
  } else if (score >= 85) {
    tone = 'good'; chip = 'In gran forma';
    headline = issues.some((i) => i.key === 'sleepDebt') ? 'Oggi sei sopra la tua norma, ma la settimana di sonno corto prima o poi presenterà il conto.' : 'Sei in un ottimo momento: il recupero è sopra la tua media e il corpo risponde bene.';
  } else if (score >= 65) {
    tone = 'good'; chip = 'Nella norma';
    const top = [...issues].sort((x, y) => y.weight - x.weight)[0];
    const SOFT = { sleepDebt: 'il sonno della settimana è un po’ corto', stressWeek: 'la settimana è stata più tesa del solito', stressY: 'ieri è stata una giornata tesa', irregular: 'gli orari di sonno sono poco regolari', energyWeek: 'stai spendendo più energia di quanta ne recuperi', sleepNight: 'stanotte hai dormito poco', autonomic: 'il cuore stanotte ha recuperato meno del solito', hrvWeek: 'la variabilità cardiaca della settimana è bassa', lowBattery: 'la ricarica notturna è stata parziale' };
    headline = top && SOFT[top.key] ? `Stai bene, nella tua norma, anche se ${SOFT[top.key]}.` : 'Stai bene: tutti i segnali sono nella tua norma.';
  } else if (score >= 50) {
    tone = 'warn'; chip = 'Un po’ sotto tono';
    headline = `Recupero un po’ sotto tono${cause ? `: ${cause}` : ''}. Niente di grave, ma oggi conviene non tirare troppo la corda.`;
  } else {
    tone = 'bad'; chip = 'In riserva';
    headline = `Il corpo è in riserva${cause ? `: ${cause}` : ''}. Oggi la priorità è recuperare.`;
  }

  // ------------------------------------------------------------------ advice (health first, max 3)
  const has = (k) => issues.some((i) => i.key === k);
  const advice = [];
  if (a.illness.current.active || (isNum(score) && score < 50)) advice.push('Giornata leggera: niente sforzi intensi, bevi bene e mangia a orari regolari.');
  else if (isNum(score) && score < 65) advice.push('Se ti alleni, tienilo facile e breve: oggi il corpo rende meno e recupera peggio.');
  if (has('sleepDebt') || has('sleepNight')) {
    const wake = a.sleep.wakeAvg ? Number(a.sleep.wakeAvg.slice(0, 2)) + Number(a.sleep.wakeAvg.slice(3)) / 60 : 7;
    advice.push(`Stasera a letto entro le ${clock(wake - need - 0.25)} per coprire le tue ${fmtH(need)}: è la cosa che oggi ti rende di più.`);
  } else if (has('irregular')) advice.push('Prova a tenere orari di sonno simili ogni sera, anche nel weekend: la regolarità conta quasi quanto la durata.');
  if (has('stressY') || has('stressToday') || has('stressWeek')) advice.push('Ritagliati 10 minuti di pausa vera nel pomeriggio (camminata all’aperto o respirazione lenta) e stacca dagli schermi un’ora prima di dormire.');
  if (has('autonomic') && !a.illness.current.active) advice.push('Niente alcol stasera e cena non troppo tardi: sono le due cose che più abbassano il recupero notturno.');
  if (has('steps') || has('energyWeek')) advice.push(has('steps') ? 'Inserisci una camminata di 20-30 minuti: muoversi poco non fa recuperare di più.' : 'Bilancia la settimana: qualche serata più tranquilla aiuta la batteria a risalire.');
  if (!advice.length) advice.push('Buon momento per una giornata piena o un allenamento impegnativo, se in programma.', 'Mantieni gli orari di sonno attuali: stanno funzionando.');

  // ------------------------------------------------------------------ compact facts for the AI prompt
  const context = {
    ora_locale: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    oggi_disponibile: todayAvailable,
    giudizio_euristico: { stato: chip, frase: headline },
    ieri: Y ? { data: Y.date, stress_medio: Y.stress, stress_solito: round(nStress?.m), passi: Y.steps, passi_soliti: round(nSteps?.m), batteria_caricata: Y.bbCharged, batteria_consumata: Y.bbDrained, batteria_min: Y.bbMin, attivita: a.activities.filter((x) => x.date === Y.date).map((x) => x.name), fuori_norma: Boolean(ill.get(Y.date)?.flagged) } : null,
    stanotte: T ? { sonno: fmtH(hoursOf(T)), sonno_solito: fmtH(nSleep?.m), bisogno: fmtH(need), qualita: T.sleep?.score ?? null, profondo_min: T.sleep?.deep ? Math.round(T.sleep.deep / 60) : null, rem_min: T.sleep?.rem ? Math.round(T.sleep.rem / 60) : null, sveglio_min: T.sleep?.awake ? Math.round(T.sleep.awake / 60) : null, fc_riposo: T.rhr, fc_riposo_vs_solito: round(rT?.rhrDelta, 1), hrv_ms: T.hrv, hrv_vs_solito_pct: rT?.hrvPct, batteria_max: T.bbMax } : null,
    oggi_finora: todayAvailable ? { batteria_ora: intrD.current?.bb, stress_medio_da_sveglio: intrD.dayMean, passi: T.steps, finestre: intrD.windows.filter((w) => w.tone !== 'good').map((w) => `${w.label} ${intrD.rows[w.from].label}-${intrD.rows[w.to].label}`) } : null,
    settimana: {
      sonno_medio: fmtH(mean(rows.slice(ti - 6, ti + 1).map(hoursOf))),
      debito_sonno: fmtH(a.sleep.debt7),
      variabilita_orario_letto_min: a.sleep.bedtimeSdMin,
      stress_medio: round(mean(rows.slice(yi - 6, yi + 1).map((r) => r.stress))),
      stress_solito: round(nStress?.m),
      passi_medi: round(mean(rows.slice(yi - 6, yi + 1).map((r) => r.steps))),
      readiness_giorni: R.slice(ti - 6, ti + 1).map((r) => [r.date, r.score]),
      hrv_7gg_vs_norma: isNum(rT?.hrv7Z) ? (rT.hrv7Z <= -1 ? 'sotto' : rT.hrv7Z >= 1 ? 'sopra' : 'nella norma') : null,
      carico_allenamento_vs_solito: isNum(a.pmc.load7) && a.pmc.load28avg7 > 0 ? round(a.pmc.load7 / a.pmc.load28avg7, 2) : null,
      malessere_attivo: a.illness.current.active,
    },
  };

  return { headline, tone, chip, score, sections, advice: advice.slice(0, 3), todayAvailable, context };
}

/** Plain-text version (chat fallback, copy). */
export function summaryText(a) {
  const s = dailySummary(a);
  return [s.headline, '', ...s.sections.flatMap((x) => [x.title.toUpperCase(), ...x.text.map((t) => `• ${t}`), '']), 'PER OGGI', ...s.advice.map((t) => `• ${t}`)].join('\n');
}
