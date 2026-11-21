// "ⓘ" explanations shown on every card: what the metric is, how it is computed, how to read it.
export const INFO = {
  readiness: {
    what: 'Quanto il tuo corpo è pronto oggi rispetto al tuo normale. 100 = meglio della tua media, ~88 = la tua normalità, sotto 65 = recupero ridotto.',
    how: 'Media pesata di 4 anelli: HRV + FC a riposo (35%), sonno (25%), stress (20%), Body Battery (20%). HRV e FC riposo sono confrontati con media e deviazione standard dei tuoi 30 giorni precedenti: alla tua media valgono 88, +1 SD = 100, ogni SD peggiore toglie 30 punti. Stress ≤ 20 = 100. Score sonno Garmin ×1,1.',
    read: '≥ 85 ottimale · 70-84 buona · 55-69 ridotta (solo facile) · < 55 bassa (riposo). Il Longevity index è separato: medie di 30 giorni di FC riposo, HRV, sonno, passi, VO2max e stress, scala 0-100, non clinico.',
  },
  hrvRhr: {
    what: 'HRV notturno (variabilità del battito, ms) e FC a riposo: i due marcatori più sensibili del sistema nervoso autonomo.',
    how: 'La banda azzurra è la tua normalità: media ± 1 deviazione standard dei 30 giorni precedenti a ogni giorno. Le linee tratteggiate sono le baseline. z = (valore − media) / SD.',
    read: 'HRV sotto la banda per 3+ giorni o FC riposo +3 bpm sopra baseline = fatica, stress o inizio di malattia. HRV sopra la banda = buon momento per la qualità.',
  },
  sleep: {
    what: 'Fasi del sonno per notte (profondo, REM, leggero, veglia), score Garmin e debito di sonno.',
    how: 'Debito 7gg = somma di (bisogno − ore dormite) delle ultime 7 notti; le notti lunghe ripagano. Efficienza = sonno / (sonno + veglia). Il bisogno si imposta in Impostazioni.',
    read: 'Debito < 3 h ok, 3-6 h attenzione, > 6 h critico. Profondo 15-25% e REM 20-25% sono i range tipici; efficienza > 90% ottima.',
  },
  sleepCoach: {
    what: 'Analisi del sonno: architettura, regolarità degli orari, legame sonno → HRV e prescrizioni.',
    how: 'Orario medio e deviazione standard di addormentamento e sveglia (14 notti), correlazione di Pearson tra ore dormite e HRV nel periodo, sedute dure serali, stress notturno.',
    read: 'Variabilità degli orari > 45’ pesa sul ritmo circadiano quanto un’ora di sonno in meno. Un r > 0,3 significa che per te dormire di più si vede subito nell’HRV.',
  },
  ans: {
    what: 'Sistema nervoso autonomo di oggi: stress fisiologico (barre) contro ricarica/consumo della Body Battery (area verde), a intervalli di 15 minuti.',
    how: 'Lo stress Garmin deriva dall’HRV continuo (0-100). Finestre evidenziate: sonno (verde = ricarica buona, rosso = stress notturno > 22 o Body Battery +< 25), stress dopo pranzo (13-15:30) e serale (19-23) oltre 40, picchi ≥ 60 per 45’+.',
    read: 'Barre blu = riposo, ambra = attivazione, rosse = stress alto. Una notte rossa significa che hai dormito ma non recuperato.',
  },
  dailyAns: {
    what: 'Per ogni giorno: Body Battery caricata (verde) e consumata (rossa), stress medio (linea).',
    how: 'Valori giornalieri Garmin.',
    read: 'Se il consumo supera la ricarica per più giorni di fila stai andando in debito energetico.',
  },
  pmc: {
    what: 'Performance Management Chart: fitness (CTL), fatica (ATL) e forma (TSB) dal carico di allenamento.',
    how: 'Carico giornaliero = TRIMP (durata × intensità della FC, formula di Banister) per corsa/cardio + metà del session-RPE/4 per la forza. CTL = media esponenziale a 42 giorni, ATL = a 7 giorni, TSB = CTL − ATL. ACWR = carico medio 7gg / carico medio 28gg.',
    read: 'TSB: > +20 transizione (perdi forma), +5…+20 fresco (gara), −10…+5 zona grigia, −30…−10 ottimale per costruire, < −30 alto rischio. ACWR 0,8-1,3 sicuro, > 1,5 rischio infortunio. Ramp rate > 7 punti CTL/settimana = progressione troppo rapida.',
  },
  ef: {
    what: 'Efficienza aerobica: quanto vai veloce per battito. Cresce quando la base aerobica migliora.',
    how: 'Efficiency Factor = velocità (m/min) / FC media. Il trend è una regressione lineare sulle sole corse facili (stessa intensità = confronto onesto). Decoupling Pa:HR = calo dell’EF tra prima e seconda metà della corsa, dai lap.',
    read: 'Trend EF > +2% = adattamento reale. Decoupling < 5% = buona tenuta aerobica; > 5% = deriva cardiaca (calore, disidratazione, fondo da costruire).',
  },
  zones: {
    what: 'Distribuzione del tempo di corsa nelle zone di FC, per verificare il modello polarizzato 80/20.',
    how: 'Tempo in zona fornito da Garmin (o stimato dalla FC media); Z1-2 facile, Z3 zona grigia, Z4-5 soglia e VO2max. Una corsa “facile” è troppo veloce se > 30% del tempo è in Z3+.',
    read: 'Obiettivo ≈ 80% Z1-2, ≤ 5-10% Z3, 10-15% Z4-5. Troppa Z3 accumula fatica senza dare né base né velocità.',
  },
  race: {
    what: 'Previsioni di gara dal VO2max e dal volume recente, confrontate con quelle Garmin.',
    how: 'Formula VDOT di Daniels/Gilbert sul VO2max Garmin (o sul miglior sforzo recente). Per 10K, mezza e maratona il tempo è penalizzato se corri meno di 40 km/settimana (fino a +3%, +7%, +13%).',
    read: 'Sono stime di potenziale con un allenamento coerente, non promesse. Per la mezza conta molto la tenuta dei lunghi.',
  },
  runs: {
    what: 'Le tue ultime corse con tutte le metriche.',
    how: 'Passo = durata / distanza. TE = Training Effect Garmin aerobico/anaerobico (0-5). Decoupling dai lap. EF = velocità / FC. ⚠ = corsa facile con troppo tempo in Z3+.',
    read: 'Clicca una riga per la critica della sessione; clicca le intestazioni per ordinare.',
  },
  hybrid: {
    what: 'Bilanciamento tra carico cardiovascolare (corsa) e neuromuscolare (pesi) e conflitti di recupero.',
    how: 'Cardio = TRIMP; neuromuscolare = durata × RPE / 4 (session-RPE). Conflitto = leg day (Lower/Full Body) seguito entro 48 h da una seduta dura o da un lungo, oppure seduta dura seguita entro 20 h da un leg day.',
    read: 'Pochi conflitti = buona pianificazione. Le gambe pesanti prima delle uscite chiave sono la causa più comune di sedute fallite.',
  },
  balance: {
    what: 'Radar degli ultimi 7 giorni: carico cardio, carico forza, intensità, recupero, sonno, freschezza.',
    how: 'Carichi = ultimi 7gg rispetto alla media settimanale di 4 settimane (×50: 50 = in linea). Intensità = % tempo in Z4-5 × 2,5. Recupero = readiness. Sonno = media 7gg / bisogno. Freschezza = 50 + 1,5 × TSB.',
    read: 'Una forma regolare e ampia è un buon equilibrio; un asse molto basso indica cosa sta trascinando giù il resto.',
  },
  volume: {
    what: 'Sessioni di forza: durata, FC, calorie, tonnellaggio e focus muscolare.',
    how: 'Tonnellaggio = Σ serie × ripetizioni × peso, dagli esercizi registrati sull’orologio. Il focus (Upper/Lower/Full Body/Core) è dedotto dalle categorie di esercizio. RPE e focus sono modificabili per sessione.',
    read: 'RPE medio ≥ 8,5 per settimane = carico neuromuscolare alto, tienine conto prima dei lunghi.',
  },
  planOverview: {
    what: 'Il tuo piano mezza maratona sub-2:00: 22 settimane, 1 uscita chiave a settimana più una facoltativa a settimane alterne.',
    how: 'Ogni corsa Garmin dal 2 novembre è abbinata automaticamente alla sessione più simile della sua settimana: distanza (60%) e tipo (40%: lungo, qualità, facile). Punteggio ≥ 0,75 con ≥ 85% della distanza = fatta, altrimenti parziale.',
    read: 'Aderenza = chiavi fatte (parziali al 50%) / chiavi in calendario. L’obiettivo A/B/C si aggiorna dai controlli e scende se salti 2 chiavi di fila.',
  },
  planWeek: {
    what: 'Le sessioni di questa settimana e cosa fare con la seconda uscita.',
    how: 'Per le sessioni fatte: blocchi a ritmo cercati nei lap da 1 km (il blocco più veloce della lunghezza prevista), FC degli ultimi 2-3 km confrontata col tetto di controllo. La facoltativa è consigliata o sconsigliata da readiness, TSB, ACWR, FC a riposo e segnali di malessere.',
    read: '✓ verde = rispettato, ambra = da correggere. Se la chiave non è ancora fatta, viene prima di tutto.',
  },
  planGates: {
    what: 'I 4 controlli del piano (settimane 9, 13, 15, 18) che decidono tra obiettivo A (1:59), B (2:03) e C (2:10).',
    how: 'Valutati automaticamente dai lap: FC media degli ultimi 2-3 km del blocco a ritmo gara (≤ 175 → A, 176-178 → B, > 178 → C) e sforzo percepito se lo inserisci sull’orologio a fine corsa. Il test 10 km usa i 10 km più veloci consecutivi (≤ 53:00 → A, ≤ 54:30 → B).',
    read: 'Se ti fermi o cammini durante un controllo, scegli direttamente C.',
  },
  planZones: {
    what: 'Ritmi e zone del piano, con le zone ricalcolate sui tuoi dati Garmin.',
    how: 'Zone del piano: FC max 195, FC a riposo 57 (% di FC di riserva). Colonna Garmin: stesse percentuali applicate a FC max e riposo misurati dall’orologio.',
    read: 'Guida con lo sforzo e il ritmo; la FC è il controllo. Negli allunghi e nelle ripetute brevi la FC non fa in tempo a salire.',
  },
  planRace: {
    what: 'Obiettivi di gara, passaggi intermedi e strategia.',
    how: 'Tempi riferiti ai cartelli ufficiali; i ritmi sono quelli da leggere sul Garmin (misura circa lo 0,6% in più).',
    read: 'Parti prudente: nessun km sotto 5:31 prima del km 16.',
  },
  planRules: { what: 'Le regole del piano originale.', how: 'Applicate automaticamente dall’AI Plan Coach ai tuoi dati.', read: '' },
  planFull: {
    what: 'Tutte le 22 settimane con stato di ogni sessione.',
    how: '✓ fatta · ◐ parziale · ✗ chiave saltata · – facoltativa saltata · ● in corso. Clicca una settimana per i dettagli.',
    read: 'Se salti una chiave, ripeti la settimana. Se ne salti due di fila, rivedi l’obiettivo.',
  },
  illnessNow: {
    what: 'Se il tuo corpo mostra oggi segnali compatibili con un malessere.',
    how: 'Ogni giorno confronta FC a riposo, HRV, stress, score sonno e Body Battery con la mediana dei tuoi 30 giorni precedenti (robusta: pochi giorni anomali non la spostano). Allarme quando FC riposo ↑ e HRV ↓ insieme oltre 1 deviazione e l’indice combinato supera la soglia, o un solo segnale è molto forte.',
    read: 'Indice 0-100: 50 = soglia di allarme. È statistica sui dati dell’orologio, non una diagnosi.',
  },
  illnessTimeline: {
    what: 'Indice di malessere giorno per giorno sugli ultimi mesi, con gli episodi evidenziati.',
    how: 'Barre = indice combinato (rosse se sopra soglia). Linee = scarto della FC a riposo (bpm) e dell’HRV (%) dalla baseline. La cronologia fino a 180 giorni viene scaricata in background e salvata nel browser.',
    read: 'I picchi isolati di un giorno sono spesso alcol, cena tardiva o una notte storta; più giorni consecutivi sono un episodio vero.',
  },
  illnessEpisodes: {
    what: 'I periodi in cui stavi probabilmente male, con tipo, durata e cosa hai fatto nel frattempo.',
    how: 'Giorni anomali raggruppati (un giorno normale in mezzo è tollerato). Tipo: malattia se FC riposo ≥ +4 bpm e HRV ≤ −12% per 2+ giorni senza un picco di carico; sovraccarico se il carico dei 7 giorni prima era ≥ 1,3× il normale e non ti sei fermato; debito di sonno se preceduto da notti corte; altrimenti stress/malessere generico.',
    read: 'Confidenza più alta con più segnali concordi e più giorni. Rientro = giorni per tornare in baseline dopo la fine.',
  },
  illnessPatterns: {
    what: 'Cosa precede i tuoi episodi e come li gestisci.',
    how: 'Conta gli episodi preceduti da picchi di carico (≥ 1,3×) o da notti più corte della tua media, e quelli in cui hai continuato ad allenarti forte.',
    read: 'Il trigger più frequente è quello da sorvegliare per primo.',
  },
};
