// "ⓘ" explanations shown on every card: what the metric is, how it is computed, how to read it.
export const INFO = {
  readiness: {
    what: 'Quanto sei recuperato stamattina rispetto alla TUA normalità (non rispetto agli altri). 75 = il tuo livello abituale.',
    how: 'Quattro componenti, ognuno su scala 0-100 dove 75 = la tua media e ogni deviazione standard di differenza vale 15 punti (+1 DS → 90, −1 DS → 60, −2 DS → 45). Sistema nervoso 40%: media HRV degli ultimi 7 giorni (confrontata con la tua zona normale, baseline 60 giorni ± ½ DS, metodo Plews/Altini) 40%, HRV della notte 30%, FC a riposo 30%; l’HRV è analizzato in scala logaritmica perché la sua distribuzione è asimmetrica. Sonno 30%: score Garmin della notte, ore dormite vs il tuo bisogno e media delle ultime 3 notti (il debito si accumula). Stress di ieri 15%: stress medio della giornata di ieri vs la tua media. Carico allenamento 15%: fatica dei 7 giorni / forma delle 6 settimane (ATL/CTL), 1 = in equilibrio = 75. La Body Battery non è inclusa: Garmin la calcola già da HRV, stress e sonno, la conteremmo due volte.',
    read: '≥ 85 sopra la tua norma (buon giorno per uno sforzo) · 65-84 nella norma · 50-64 ridotta (meglio facile) · < 50 bassa (riposo). Il componente più basso ti dice cosa sta frenando il recupero.',
  },
  longevity: {
    what: 'Indice di salute a lungo termine: abitudini e fitness confrontate con le evidenze degli studi di popolazione, non con te stesso. Si muove lentamente.',
    how: 'Ogni voce è 0-100 (0 = fascia di rischio alto, 100 = fascia di rischio minimo) e pesa quanto predice la mortalità in letteratura: VO2max 25% (percentile tra i coetanei, registro FRIEND), minuti di attività 15% (moderati + 2 × vigorosi, OMS), passi 10%, forza 10% (sedute/settimana), FC a riposo 10%, durata del sonno 10%, regolarità del sonno 10% (variabilità dell’orario di metà sonno), HRV 5% (atteso per età), stress cronico 5%. Finestra = periodo selezionato, minimo 30 giorni. Età e sesso da Garmin Connect o dalle impostazioni.',
    read: '≥ 70 buono · 50-69 migliorabile · < 50 da curare. “Dove guadagni di più” indica le voci con più margine × peso. Non è un dato clinico.',
  },
  summary: {
    what: 'Il punto della situazione in parole semplici: come è andata ieri, com’è andata la notte, la giornata di oggi (solo dopo le 11 e con abbastanza dati) e la tendenza dell’ultima settimana.',
    how: 'Ogni valore (stress, passi, sonno, energia, HRV, FC a riposo) è confrontato con la tua normalità dei 30 giorni precedenti e tradotto in un giudizio (“più teso del solito”, “ricarica parziale”). La frase in alto combina la readiness di stamattina, il Radar sintomi e i segnali della settimana. “Racconta con AI” fa scrivere lo stesso riepilogo al modello configurato.',
    read: 'I chip colorati sono i numeri chiave: verde meglio del solito, ambra da tenere d’occhio, rosso fuori norma. I consigli “Per oggi” riguardano stile di vita e recupero più che l’allenamento.',
  },
  hrvRhr: {
    what: 'HRV notturno (variabilità del battito, ms) e FC a riposo: i due marcatori più sensibili del sistema nervoso autonomo.',
    how: 'L’HRV di una singola notte è rumoroso: la linea spessa è la media mobile di 7 giorni, quella che conta per le decisioni. La banda azzurra è la tua zona normale: baseline dei 60 giorni precedenti ± ½ deviazione standard (la “smallest worthwhile change”), calcolata sul logaritmo dell’HRV. “Nel periodo” = media e tendenza lineare sull’intervallo selezionato.',
    read: 'Media 7gg sotto la banda per più giorni o FC riposo +3 bpm sopra baseline = fatica, stress o inizio di malattia. Media 7gg sopra la banda = buon adattamento.',
  },
  sleep: {
    what: 'Fasi del sonno per notte (profondo, REM, leggero, veglia), score Garmin e debito di sonno.',
    how: 'Debito 7gg = somma di (bisogno − ore dormite) delle ultime 7 notti; le notti lunghe ripagano. Media, efficienza, fasi, orari e notti corte seguono il periodo selezionato. Efficienza = sonno / (sonno + veglia). Il bisogno si imposta in Impostazioni.',
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
    what: 'Per ogni giorno: Body Battery caricata (verde) e consumata (rossa), stress medio (linea), con le medie del periodo selezionato.',
    how: 'Valori giornalieri Garmin; le medie escludono oggi, che non è ancora finito. Giorno in deficit = consumo superiore alla ricarica di oltre 5 punti.',
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
    how: 'Tempo in zona fornito da Garmin (o stimato dalla FC media); Z1-2 facile, Z3 zona grigia, Z4-5 soglia e VO2max. Accanto a ogni zona i tuoi limiti in bpm (passa il mouse per quelli del piano scritto). Una corsa “facile” è troppo veloce se > 30% del tempo è in Z3+.',
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
    what: 'Ritmi del piano da leggere sul Garmin e le regole del piano. Le tue zone FC, con il confronto con quelle scritte nel piano, sono nella card “Zone FC & 80/20”.',
    how: 'Le zone attive sono lette da Garmin Connect a ogni sincronizzazione (profilo corsa, o predefinito). Se non disponibili: standard % FCR con FC max 195, riposo 57 e limiti 29/58/71/80/91%. Puoi forzare le zone standard dalle Impostazioni.',
    read: 'Guida con lo sforzo e il ritmo; la FC è il controllo. Negli allunghi e nelle ripetute brevi la FC non fa in tempo a salire.',
  },
  planRace: {
    what: 'Dove sei oggi rispetto agli obiettivi A/B/C della mezza, con passaggi intermedi e strategia di gara.',
    how: 'Stima di oggi: formula VDOT di Daniels/Gilbert sul VO2max Garmin (o sul miglior sforzo recente), penalizzata se corri meno di 40 km a settimana (+7% sulla mezza); accanto la previsione Garmin. Un obiettivo è “alla portata” se la stima è entro un minuto dal suo tempo. Tempi riferiti ai cartelli ufficiali; i ritmi sono quelli da leggere sul Garmin (misura circa lo 0,6% in più).',
    read: 'Parti prudente: nessun km sotto 5:31 prima del km 16.',
  },
  planRules: { what: 'Le regole del piano originale.', how: 'Applicate automaticamente dall’AI Plan Coach ai tuoi dati.', read: '' },
  planFull: {
    what: 'Tutte le 22 settimane con stato di ogni sessione.',
    how: '✓ fatta · ◐ parziale · ✗ chiave saltata · – facoltativa saltata · ● in corso. Clicca una settimana per i dettagli.',
    read: 'Se salti una chiave, ripeti la settimana. Se ne salti due di fila, rivedi l’obiettivo.',
  },
  illnessNow: {
    what: 'Radar sintomi: se il tuo corpo mostra oggi segnali compatibili con un malessere.',
    how: 'Ogni giorno confronta FC a riposo, HRV, stress, score sonno e Body Battery con la mediana dei tuoi 30 giorni precedenti (robusta: pochi giorni anomali non la spostano). Allarme quando FC riposo ↑ e HRV ↓ insieme oltre 1 deviazione e l’indice combinato supera la soglia, o un solo segnale è molto forte.',
    read: 'Indice 0-100: 50 = soglia di allarme. È statistica sui dati dell’orologio, non una diagnosi.',
  },
  illnessTimeline: {
    what: 'Indice di malessere giorno per giorno sugli ultimi mesi, con gli episodi evidenziati.',
    how: 'Barre = indice combinato (rosse se sopra soglia); passando il mouse vedi gli scarti di FC a riposo e HRV di quel giorno. Mostra il periodo selezionato (minimo 30 giorni); lo storico fino a 12 mesi viene scaricato in background e salvato nel browser.',
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

// New cards
Object.assign(INFO, {
  runDetail: {
    what: 'Analisi completa della corsa selezionata: parziali km per km, gestione dello sforzo, zone, confronto con le uscite simili e risposta del tuo corpo.',
    how: 'Dai lap da 1 km: passo e FC per km, metà distanza per lo split, deviazione standard del passo per la regolarità. Il confronto usa le uscite dello stesso tipo (facile, lungo, qualità) dei 90 giorni precedenti. Il contesto viene dai dati giornalieri di quel giorno e del giorno dopo.',
    read: 'Le note in fondo riassumono cosa è andato bene (verde) e cosa correggere (ambra).',
  },
  runsOverview: {
    what: 'Tutte le corse del periodo selezionato (7, 30, 90 giorni o tutto lo storico) confrontate con il periodo precedente di uguale durata.',
    how: 'Totali sommati sulle corse; passo medio = tempo totale / km totali; FC media pesata sulla durata. Record cercati nei lap degli ultimi 6 mesi (il miglior tratto consecutivo di 5 e 10 km). Le tendenze sono regressioni lineari sulle sole uscite facili, espresse ogni 30 giorni.',
    read: 'Volume in crescita oltre il 30% rispetto al periodo prima = attenzione; FC delle uscite facili in calo = miglioramento aerobico.',
  },
  hrPace: {
    what: 'Efficienza aerobica: quanto vai veloce a parità di battiti. È la prova più diretta che il motore aerobico sta migliorando.',
    how: 'Ogni km di ogni corsa (escluso il primo, dove la FC sta ancora salendo) diventa un punto passo-FC. Dalla relazione media tra passo e FC di tutti i tuoi km stimo che ritmo avresti tenuto al limite della tua Z2. Ogni punto settimanale è la mediana delle 4 settimane precedenti; la finestra è il periodo selezionato, minimo 120 giorni. “FC a ritmo costante” e “passo a FC costante” sono lo stesso dato visto da due lati, per questo il grafico è uno solo. Trend EF = regressione dell’Efficiency Factor (velocità / FC) sulle sole corse facili del periodo. Deriva cardiaca (decoupling) = calo dell’efficienza tra prima e seconda metà di ogni corsa.',
    read: 'Migliori se la linea sale (più veloce a parità di battiti): 10 s/km in 2 mesi sono un miglioramento reale. Deriva < 5% = buona tenuta aerobica. Caldo, salite e stanchezza alzano la FC: conta la tendenza, non il singolo punto.',
  },
});

// "Elemento per elemento": every series, column and KPI with its meaning and the ideal value.
const ITEMS = {
  readiness: [
    ['Numero al centro', 'Readiness di stamattina, 0-100 (75 = la tua norma)', '≥ 65; ≥ 85 per le giornate impegnative'],
    ['Anello azzurro · Sistema nervoso', 'HRV (media 7gg e notte) e FC a riposo rispetto alla tua baseline di 60 giorni', '≥ 65'],
    ['Anello viola · Sonno', 'Score Garmin, ore vs bisogno, ultime 3 notti', '≥ 75'],
    ['Anello ambra · Stress di ieri', 'Stress medio di ieri rispetto al tuo solito', '≥ 65'],
    ['Anello verde · Carico', 'Fatica recente rispetto alla forma di fondo (ATL/CTL)', '≥ 60'],
    ['Media periodo / giorni < 50 / ≥ 85', 'Andamento nel periodo selezionato', 'pochi giorni sotto 50'],
    ['Grafico in basso', 'Readiness giorno per giorno; linea grigia = la tua norma (75)', 'intorno o sopra la linea'],
  ],
  longevity: [
    ['Barre', 'Punteggio di ogni voce: verde fascia di rischio basso, ambra intermedia, rossa alta', 'verdi'],
    ['% accanto alla voce', 'Peso della voce nell’indice (dall’evidenza scientifica)', '—'],
    ['Copertura dati', 'Quanta parte dell’indice è calcolata su dati reali', '100%'],
    ['Dove guadagni di più', 'Le voci con più margine moltiplicato per il peso', '—'],
  ],
  hrvRhr: [
    ['Linea azzurra sottile · HRV notte', 'Variabilità del battito della singola notte (ms)', 'non conta il singolo valore'],
    ['Linea azzurra spessa · media 7gg', 'Media mobile di 7 notti: il segnale affidabile', 'dentro o sopra la banda'],
    ['Banda azzurra', 'Tua zona normale: baseline 60 giorni ± ½ deviazione standard', '—'],
    ['Linea rossa · FC riposo', 'Battiti a riposo (asse destro). Più bassa = cuore riposato', 'sulla o sotto la tratteggiata'],
    ['Tratteggiata rossa', 'Baseline della FC a riposo (60 giorni)', '—'],
    ['Nel periodo', 'Media e variazione lungo l’intervallo selezionato', 'HRV stabile o in crescita, FC stabile o in calo'],
  ],
  sleep: [
    ['Barre viola scuro · Profondo', 'Sonno profondo: riparazione fisica', '15-25% del totale'],
    ['Barre azzurre · REM', 'Sonno REM: recupero mentale e memoria', '20-25%'],
    ['Barre blu · Leggero', 'Sonno leggero', '45-55%'],
    ['Barre ambra · Veglia', 'Risvegli durante la notte', '< 30 min'],
    ['Linea verde · Score', 'Score sonno Garmin (asse destro)', '≥ 80'],
    ['Linea tratteggiata', 'Il tuo bisogno di sonno', 'barre che la raggiungono'],
    ['Debito 7gg', 'Ore mancanti rispetto al bisogno nell’ultima settimana', '< 3 h'],
    ['A letto / Sveglia ±', 'Orario medio e quanto varia di notte in notte', '± < 30-45 min'],
    ['Sonno ↔ HRV', 'Quanto il tuo HRV dipende dalle ore dormite (r da −1 a 1)', 'r > 0,3 = dormire di più ti aiuta subito'],
  ],
  sleepCoach: [
    ['Architettura', 'Durata e fasi di stanotte e della settimana', 'vedi range delle fasi'],
    ['Regolarità', 'Costanza degli orari', '± < 45 min'],
    ['Legame sonno → recupero', 'Effetto del sonno sul tuo HRV', 'r > 0,3'],
    ['Prescrizioni', 'Azioni concrete, con orario di letto calcolato dalla tua sveglia media', '—'],
  ],
  ans: [
    ['Barre', 'Stress ogni 15 minuti: blu riposo (≤ 25), ambra medio, arancio/rosso alto (> 75)', 'blu di notte e nelle pause'],
    ['Area verde · Body Battery', 'La tua “batteria”: sale quando recuperi, scende con stress e attività', 'sale di ≥ 40 punti di notte'],
    ['Finestre colorate', 'Verde = sonno che ricarica; rossa = notte senza recupero; ambra = stress dopo pranzo o serale', 'solo verde'],
    ['Stress notte', 'Stress medio durante il sonno', '< 20'],
    ['Ricarica notte', 'Body Battery guadagnata dormendo', '≥ 40'],
  ],
  dailyAns: [
    ['Barre verdi', 'Body Battery ricaricata nel giorno', 'alte'],
    ['Barre rosse', 'Body Battery consumata', 'simili alle verdi nel lungo periodo'],
    ['Linea ambra', 'Stress medio del giorno (asse destro)', '< 35'],
  ],
  pmc: [
    ['Area azzurra · CTL (fitness)', 'Carico medio delle ultime ~6 settimane: la tua forma di fondo', 'in salita graduale'],
    ['Linea rossa · ATL (fatica)', 'Carico medio dell’ultima settimana', 'sopra la CTL nei blocchi, sotto in scarico'],
    ['Barre grigie · Carico', 'Carico di ogni giorno (TRIMP)', '—'],
    ['Scala “Forma oggi”', 'TSB = CTL − ATL con il cursore sul valore di oggi', '−10…−30 per costruire, +5…+20 il giorno della gara'],
    ['Tooltip', 'Forma (TSB = CTL − ATL) e zona di ogni giorno', '—'],
    ['Linea ACWR', 'Carico ultima settimana / media 4 settimane', '0,8-1,3 (fascia verde); > 1,5 rischio'],
    ['Ramp rate', 'Quanto sale la CTL in una settimana', '≤ 5-7 punti'],
    ['Rischio OT', 'Rischio di sovrallenamento da HRV, FC riposo, ACWR, TSB, sonno', '< 35'],
  ],
  ef: [
    ['Punti azzurri / rossi / viola', 'Corse facili / qualità / lunghi: efficienza = velocità (m/min) / FC', 'in salita nel tempo'],
    ['Linea tratteggiata', 'Tendenza dell’efficienza sulle sole corse facili', 'in salita'],
    ['Trend EF', 'Variazione dell’efficienza nel periodo', '> +2%'],
    ['Barre decoupling', 'Deriva cardiaca di ogni corsa: verde < 5%, ambra > 5%', 'verdi'],
  ],
  zones: [
    ['Barra Z1-2 / Z3 / Z4-5', 'Quota del tempo di corsa per intensità', '≈ 80 / ≤ 10 / 10-15'],
    ['Righe Z1…Z5', 'Ore passate in ogni zona FC', 'Z2 la più lunga'],
    ['Barre settimanali', 'Ore per settimana divise per intensità', 'azzurro dominante'],
    ['Tetto easy run', 'FC da non superare nelle corse facili (limite della tua Z2)', '—'],
  ],
  race: [
    ['VO2max', 'Consumo massimo di ossigeno stimato da Garmin', 'in salita'],
    ['Stima', 'Tempo previsto con allenamento coerente, penalizzato se corri poco', '—'],
    ['Garmin', 'Previsione dell’orologio, per confronto', '—'],
    ['Trend VO2max', 'Andamento del VO2max nel periodo', 'in salita'],
  ],
  runs: [
    ['Passo', 'Minuti per km', '—'],
    ['FC med/max', 'Battiti medi e massimi', 'nelle facili sotto il tetto Z2'],
    ['Cad.', 'Passi al minuto', '165-180'],
    ['TE A/An', 'Training Effect aerobico/anaerobico (0-5)', 'facili 2-3 / 0-1; qualità 3-4 / 2-3'],
    ['Decoup.', 'Deriva cardiaca nella corsa', '< 5%'],
    ['EF', 'Velocità/FC: più alto = più efficiente', 'in salita nel tempo'],
  ],
  runDetail: [
    ['Linea azzurra · Passo', 'Passo di ogni km; più in alto = più veloce', 'piatta nelle uscite continue'],
    ['Linea rossa · FC', 'FC media di ogni km', 'dentro la zona prevista'],
    ['Sfondo colorato', 'Le tue zone FC (blu Z1 … rosso Z5)', '—'],
    ['1ª / 2ª metà', 'Passo e FC delle due metà della corsa', '2ª metà uguale o più veloce (split negativo)'],
    ['Variabilità ritmo', 'Quanto cambia il passo tra i km', '< 5% nelle uscite continue'],
    ['Deriva cardiaca', 'Quanto è salita la FC a parità di ritmo', '< 5%'],
    ['Costo cardiaco', 'Battiti spesi per ogni km (FC × passo)', 'in calo nel tempo a parità di uscita'],
    ['Falcata', 'Metri per passo (velocità / cadenza)', '—'],
    ['Training Effect', 'Stimolo aerobico / anaerobico (0-5)', 'coerente con lo scopo dell’uscita'],
    ['Δ media (parziali)', 'Secondi in più (+) o in meno (−) rispetto al passo medio', 'vicino a 0; verde = km più veloce'],
    ['Tempo in zona', 'Minuti e percentuale in ogni zona FC', 'facili: ≥ 70% in Z1-Z2'],
    ['HRV mattina / giorno dopo', 'HRV rispetto alla tua baseline prima e dopo la corsa', 'sopra −12%'],
    ['Rispetto alle simili', 'Media delle uscite dello stesso tipo negli ultimi 90 giorni', 'passo più veloce a FC uguale o minore'],
  ],
  runsOverview: [
    ['Km / Corse / Tempo', 'Totali del periodo', '—'],
    ['vs periodo prec.', 'Confronto con il periodo precedente di uguale durata', 'volume entro +10-30%'],
    ['Barre azzurre', 'Km della settimana', 'crescita graduale'],
    ['Barre viola', 'Uscita più lunga della settimana', 'in crescita verso i 18-20 km per la mezza'],
    ['Linea ambra', 'Passo medio settimanale (in alto = più veloce)', '—'],
    ['Per tipo di uscita', 'Ripartizione facili / lunghi / qualità', 'qualità ≤ 1 uscita su 3'],
    ['Record', 'Km più veloce e migliori 5/10 km trovati nei tuoi lap', '—'],
    ['Tendenze uscite facili', 'Variazione ogni 30 giorni di FC, passo e cadenza', 'FC in calo, passo stabile o più veloce'],
    ['Costanza', 'Settimane con almeno una corsa e pausa più lunga', 'pausa < 10 giorni'],
  ],
  hrPace: [
    ['Linea verde', 'Passo stimato al limite della tua Z2 settimana per settimana; più in alto = più veloce', 'in salita'],
    ['Linea tratteggiata bianca', 'Tendenza lineare dell’intero periodo', 'in salita'],
    ['vs 2 mesi fa', 'Ultime 4 settimane contro le settimane 8-12 fa (in s/km e l’equivalente in battiti)', '≤ −5 s/km'],
    ['Trend EF facili', 'Variazione dell’efficienza (velocità/FC) sulle corse facili del periodo', '> +2%'],
    ['Barre deriva cardiaca', 'Quanto sale la FC nella seconda metà di ogni corsa: verde < 5%, ambra > 5%', 'verdi'],
  ],
  hybrid: [
    ['Barre azzurre', 'Carico cardiovascolare settimanale (TRIMP)', 'stabile o in crescita graduale'],
    ['Barre viola', 'Carico neuromuscolare dei pesi (durata × RPE / 4)', '20-35% del carico totale'],
    ['Linea ambra', 'Km di corsa a settimana', '—'],
    ['Conflitti', 'Leg day vicino a una seduta dura o a un lungo', 'nessuno'],
  ],
  balance: [
    ['Carico cardio / forza', 'Questa settimana rispetto alla media di 4 settimane (50 = uguale)', '40-65'],
    ['Intensità', 'Quota di tempo in Z4-Z5', '25-40'],
    ['Recupero', 'Readiness', '≥ 75'],
    ['Sonno', 'Ore dormite rispetto al bisogno', '≥ 90'],
    ['Freschezza', 'Dal TSB (50 = neutro)', '40-70'],
  ],
  volume: [
    ['Barre viola', 'Tonnellaggio settimanale (kg sollevati)', 'stabile o in crescita graduale'],
    ['Linea verde', 'Numero di sedute a settimana', '2'],
    ['RPE', 'Sforzo percepito 1-10 (modificabile)', '6-8'],
    ['Focus', 'Gruppo muscolare principale (modificabile)', 'almeno 1 Lower a settimana, lontano dai lunghi'],
  ],
  planOverview: [
    ['Settimana', 'Settimana corrente del piano di 22', '—'],
    ['Obiettivo attuale', 'A = 1:59, B = 2:03, C = 2:10, aggiornato dai controlli', 'A'],
    ['Aderenza chiavi', 'Uscite chiave fatte (parziali al 50%)', '≥ 85%'],
    ['Barra settimane', 'Verde fatta, ambra parziale, rossa saltata, azzurra in corso', 'tutta verde'],
  ],
  planWeek: [
    ['Badge stato', '✓ fatta · ◐ parziale · ✗ saltata · ● da fare', '✓'],
    ['Riquadro Garmin', 'La corsa abbinata automaticamente e quanto è simile alla sessione', 'somiglianza ≥ 75%'],
    ['Note verdi / ambra', 'Blocco e FC rispettati / da correggere', 'verdi'],
    ['Seconda uscita', 'Consiglio sulla facoltativa in base a readiness, carico e malesseri', '—'],
  ],
  planGates: [
    ['A / B / C', 'Esito del controllo e obiettivo che ne deriva', 'A'],
    ['Dettaglio', 'Blocco trovato nei lap, FC degli ultimi km e sforzo', 'FC ≤ 175 e sforzo ≤ 7/10'],
  ],
  planZones: [
    ['Ritmi', 'Passi da tenere sul Garmin per ogni tipo di lavoro', '—'],
    ['% FCR', 'Percentuale della FC di riserva (FC max − FC riposo) di ogni zona', '—'],
    ['Tue (bpm)', 'Le tue zone attive in battiti', '—'],
    ['Piano', 'Le zone scritte nel piano originale, per confronto', '—'],
  ],
  illnessNow: [
    ['Indice', 'Quanto i segnali di oggi si discostano dalla tua normalità (50 = soglia)', '< 35'],
    ['FC riposo vs base', 'Battiti a riposo rispetto alla mediana dei 30 giorni', '< +3 bpm'],
    ['HRV vs base', 'HRV rispetto alla mediana dei 30 giorni', 'sopra −12%'],
    ['Sensibilità', 'Quanto deboli possono essere i segnali per essere segnalati', 'media'],
  ],
  illnessTimeline: [
    ['Barre', 'Indice giornaliero: rosse = giorno anomalo, ambra = vicino alla soglia', 'grigie'],
    ['Linea tratteggiata', 'Soglia di allarme (50)', 'sotto'],
    ['Fasce colorate', 'Episodi rilevati', '—'],
    ['Tooltip', 'Segnali e scarti di FC a riposo e HRV del giorno', '—'],
  ],
  illnessEpisodes: [
    ['Tipo', 'Malattia, sovraccarico, debito di sonno o stress', '—'],
    ['Confidenza', 'Quanto è affidabile la rilevazione (segnali concordi e durata)', '—'],
    ['Rientro', 'Giorni per tornare in baseline dopo l’episodio', '≤ 3'],
    ['Sedute dure durante', 'Allenamenti intensi mentre stavi male', 'nessuna'],
  ],
  illnessPatterns: [
    ['Dopo picchi di carico', 'Episodi preceduti da una settimana ≥ 1,3× il normale', '0'],
    ['Dopo notti corte', 'Episodi preceduti da sonno sotto la tua media', '0'],
    ['Allenato forte da malato', 'Episodi con sedute dure durante', '0'],
  ],
};
Object.entries(ITEMS).forEach(([k, v]) => {
  if (INFO[k]) INFO[k].items = v;
});
