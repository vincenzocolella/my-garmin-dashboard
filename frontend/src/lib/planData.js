// Ported from github.com/vincenzocolella/training-app (src/App.tsx). Edit the plan here.

export const PLAN_START = '2026-11-02'; // Monday of week 1
export const RACE_DATE = '2027-04-04';

const run = (id, type, title, desc, targetKm, pace, hr, optional) => ({ id, type, title, desc, targetKm, pace, hr, optional: Boolean(optional) });

export const TRAINING_PLAN = [
  {
    phase: 1, phaseTitle: "Recupero e base di tenuta", weeks: [
      { week: 1, tag: "RECUPERO", runs: [
        run("w1r1", "Easy", "Ripartenza dopo il 10 km", "6 km facili e costanti, gambe libere. Dopo la mezza del 25 ottobre e il 10 km a tutta del 1° novembre è l'unica uscita: se le gambe sono pesanti o la FC a riposo è oltre 62, cammina e rimanda.", 6, "6:45–7:30/km", "≤ 150"),
      ] },
      { week: 2, runs: [
        run("w2r1", "Long Run", "Lungo di base", "12 km costanti a ritmo da chiacchierata (frasi complete). Obiettivo: rimettere chilometri nelle gambe senza stress.", 12, "6:30–7:10/km", "136–153"),
      ] },
      { week: 3, runs: [
        run("w3r1", "Tempo", "Tempo breve", "8 km: 2 km facili → 2 × 8 min a 5:28/km (“comodamente duro”, recupero 3 min di trotto) → facile fino a 8 km.", 8, "5:25–5:30/km nei blocchi", "172–180 nei blocchi", true),
        run("w3r2", "Long Run", "Lungo", "13 km facili e costanti.", 13, "6:30–7:10/km", "136–153"),
      ] },
      { week: 4, runs: [
        run("w4r1", "Tempo", "Tempo continuo", "9 km: 2 km facili → 20 min a 5:28/km → facile fino a 9 km.", 9, "5:25–5:30/km nel blocco", "172–180 nel blocco", true),
        run("w4r2", "Long Run", "Lungo con finale", "14 km: 11 km facili → 3 km a 6:00/km (Z3, ancora in controllo).", 14, "6:30–7:10/km → 6:00/km", "≤ 153 → ≤ 165"),
      ] },
      { week: 5, tag: "SCARICO", runs: [
        run("w5r1", "Easy", "Scarico con allunghi", "10 km facili. Alla fine 4 allunghi da 20 s (≈4:50/km, veloci ma rilassati) camminando 40 s tra uno e l'altro.", 10, "6:30–7:15/km", "≤ 153"),
      ] },
      { week: 6, runs: [
        run("w6r1", "Long Run", "Lungo progressivo e gel", "15 km: 11 km facili → 4 km a 5:50/km. Prova il fueling: gel ai minuti 30, 60 e 90, ognuno con acqua.", 15, "6:30–7:10/km → 5:50/km", "≤ 153 → ≤ 168"),
      ] },
      { week: 7, runs: [
        run("w7r1", "Tempo", "Tempo spezzato", "9 km: 2 km facili → 3 × 8 min a 5:28/km (recupero 2 min di trotto) → facile.", 9, "5:25–5:30/km nei blocchi", "172–180 nei blocchi", true),
        run("w7r2", "Long Run", "Lungo con ritmo", "16 km: 12 km facili → 4 km a 5:45/km. Gel ai minuti 30, 60 e 90.", 16, "6:30–7:10/km → 5:45/km", "≤ 153 → ≤ 170"),
      ] },
      { week: 8, tag: "FESTE: FLESSIBILE", runs: [
        run("w8r1", "Speed", "Fartlek 1 min/1 min", "8 km: 3 km facili → 8 × 1 min a 5:00/km con 1 min facile in mezzo → facile fino a 8 km.", 8, "≈ 5:00/km nelle ripetute", "leggila a fine ripetuta", true),
        run("w8r2", "Long Run", "Lungo con ritmo", "17 km: 12 km facili → 5 km a 5:40/km. Gel ai minuti 30, 60 e 90.", 17, "6:30–7:10/km → 5:40/km", "≤ 153 → ≤ 172"),
      ] },
      { week: 9, tag: "SCARICO + CONTROLLO", runs: [
        run("w9r1", "Tempo", "Controllo ritmo gara", "12 km: 3 km facili → 6 km a 5:36/km (ritmo gara sub-2) → 3 km facili. Gel al minuto 30. Esito (FC e sforzo negli ultimi 2 km del blocco): FC ≤ 175 e ≤ 7/10 → A in rotta · FC 176–178 o 8/10 → punta al B (2:03) · FC > 178 o ≥ 9/10 → punta al C (2:10).", 12, "5:36/km nel blocco", "controllo ≤ 175"),
      ] },
    ]
  },
  {
    phase: 2, phaseTitle: "Costruzione della resistenza", weeks: [
      { week: 10, runs: [
        run("w10r1", "Long Run", "Lungo con ritmo gara", "18 km: 12 km facili → 6 km a 5:38/km. Gel ai minuti 30, 60 e 90.", 18, "6:30–7:10/km → 5:38/km", "≤ 153 → ≤ 175"),
      ] },
      { week: 11, runs: [
        run("w11r1", "Tempo", "Doppio tempo", "10 km: 2 km facili → 2 × 15 min a 5:28/km (recupero 3 min di trotto) → facile.", 10, "5:25–5:30/km nei blocchi", "172–180 nei blocchi", true),
        run("w11r2", "Long Run", "Lungo facile", "16 km facili con gel ai minuti 30, 60 e 90. Settimana di accumulo: nessun ritmo da inseguire.", 16, "6:30–7:10/km", "136–153"),
      ] },
      { week: 12, runs: [
        run("w12r1", "Speed", "Ripetute da 1000", "10 km: 2 km facili → 5 × 1000 m a 4:58/km (recupero 2 min di trotto) → facile.", 10, "4:58–5:03/km nelle ripetute", "leggila a fine ripetuta", true),
        run("w12r2", "Long Run", "Lungo con 8 km a ritmo gara", "18 km: 10 km facili → 8 km a 5:36/km. Gel ai minuti 30, 60 e 90.", 18, "6:30–7:10/km → 5:36/km", "≤ 153 → ≤ 175"),
      ] },
      { week: 13, tag: "SCARICO + TEST 10 KM", runs: [
        run("w13r1", "Speed", "TEST 10 KM", "13 km totali: 2 km di riscaldamento + 4 allunghi → 10 km al massimo regolare (primi 2 km a 5:25, poi libero) → 1 km di defaticamento. Mattina, colazione e scarpe di gara. Riferimento: 53:27 del 1° novembre. Esito: ≤ 53:00 → A · 53:00–54:30 → B · oltre 54:30 → C (e controlla stanchezza o fastidi).", 13, "≈ 5:15/km", "180+ nel finale"),
      ] },
      { week: 14, runs: [
        run("w14r1", "Long Run", "Lungo con ritmo gara", "19 km: 11 km facili → 8 km a 5:36/km. Gel ai minuti 30, 60 e 90.", 19, "6:30–7:10/km → 5:36/km", "≤ 153 → ≤ 175"),
      ] },
      { week: 15, runs: [
        run("w15r1", "Tempo", "Tempo 25 min", "10 km: 2 km facili → 25 min a 5:28/km → facile.", 10, "5:25–5:30/km nel blocco", "172–180 nel blocco", true),
        run("w15r2", "Long Run", "SIMULATORE 1 (20 km)", "20 km: 10 km facili → 10 km a 5:36/km. Stessa colazione e stessi gel della gara (minuti 30, 60, 90). Annota FC e sforzo (1–10) agli ultimi 3 km: FC ≤ 175 e ≤ 7/10 → A in rotta · FC 176–178 o 8/10 → B · FC > 178 o ≥ 9/10 → C.", 20, "6:30–7:10/km → 5:36/km", "≤ 153 → ≤ 175"),
      ] },
      { week: 16, runs: [
        run("w16r1", "Speed", "Ripetute da 800", "9 km: 2 km facili → 6 × 800 m a 4:55/km (recupero 400 m di trotto) → facile.", 9, "4:55–5:00/km nelle ripetute", "leggila a fine ripetuta", true),
        run("w16r2", "Long Run", "Lungo di recupero con finale", "18 km: 14 km facili → 4 km a 5:36/km.", 18, "6:30–7:10/km → 5:36/km", "≤ 153 → ≤ 175"),
      ] },
    ]
  },
  {
    phase: 3, phaseTitle: "Ritmo gara", weeks: [
      { week: 17, tag: "SCARICO", runs: [
        run("w17r1", "Tempo", "3 × 2 km a ritmo gara", "12 km: 3 km facili → 3 × 2 km a 5:36/km (recupero 2 min di trotto) → facile.", 12, "5:36/km nei blocchi", "≤ 175 nei blocchi"),
      ] },
      { week: 18, runs: [
        run("w18r1", "Tempo", "Soglia lunga", "10 km: 2 km facili → 2 × 12 min a 5:28/km (recupero 3 min di trotto) → facile.", 10, "5:25–5:30/km nei blocchi", "172–180 nei blocchi", true),
        run("w18r2", "Long Run", "SIMULATORE 2 (20 km, picco)", "20 km: 8 km facili → 12 km a 5:36/km. Colazione e gel come in gara. È la prova finale: FC ≤ 175 e sforzo ≤ 7/10 agli ultimi 3 km → A · altrimenti scegli B o C. Se arrivi stanco, riduci il blocco a 8 km.", 20, "6:30–7:10/km → 5:36/km", "≤ 153 → ≤ 175"),
      ] },
      { week: 19, runs: [
        run("w19r1", "Tempo", "2 × 4 km a ritmo gara", "11 km: 2 km facili → 2 × 4 km a 5:36/km (recupero 3 min di trotto) → facile.", 11, "5:36/km nei blocchi", "≤ 175 nei blocchi", true),
        run("w19r2", "Long Run", "Lungo con finale", "16 km: 12 km facili → 4 km a 5:36/km.", 16, "6:30–7:10/km → 5:36/km", "≤ 153 → ≤ 175"),
      ] },
      { week: 20, runs: [
        run("w20r1", "Long Run", "Rifinitura", "14 km: 9 km facili → 5 km a 5:36/km. Da qui in poi si scarica.", 14, "6:30–7:10/km → 5:36/km", "≤ 153 → ≤ 175"),
      ] },
    ]
  },
  {
    phase: 4, phaseTitle: "Scarico e gara", weeks: [
      { week: 21, tag: "TAPER", runs: [
        run("w21r1", "Tempo", "Richiamo ritmo gara", "10 km: 2 km facili → 3 × 1,5 km a 5:36/km (recupero 2 min di trotto) → facile.", 10, "5:36/km nei blocchi", "≤ 175 nei blocchi"),
      ] },
      { week: 22, tag: "SETTIMANA DI GARA", runs: [
        run("w22r1", "Easy", "Scarico pre-gara", "5 km: 2 km facili → 3 × 1 min a 5:36/km (recupero 2 min) → facile. Poi riposo, carboidrati e sonno.", 5, "5:36/km nelle ripetute", "≤ 153 facile", true),
        run("w22r2", "Race", "🏁 GIORNO DI GARA — Mezza maratona", "Km 1–5: 5:41 → Km 6–16: 5:36 → Km 17–21,1: tieni, accelera dal 19 se hai gambe. Gel ai minuti 30, 60 e 90. Nessun km sotto 5:31 prima del km 16.", 21.1, "5:36/km sul Garmin (obiettivo 1:59)", "controllo ≤ 178 nei km 6–15"),
      ] },
    ]
  }
];

const RUN_INFO = {
  w1r1: { zones: [{ z: "Z2", what: "6 km facili" }], why: "Smaltire la fatica di mezza e 10 km a tutta, senza aggiungere stress." },
  w2r1: { zones: [{ z: "Z2", what: "12 km" }], why: "Rimette chilometri nelle gambe e ricostruisce la base aerobica." },
  w3r1: { zones: [{ z: "Z2", what: "riscaldamento e resto" }, { z: "Z4", what: "2 × 8 min a 5:28" }], why: "Alza la soglia: il ritmo che reggi a lungo senza accumulare fatica." },
  w3r2: { zones: [{ z: "Z2", what: "13 km" }], why: "Allunga la tenuta aerobica di un chilometro alla volta." },
  w4r1: { zones: [{ z: "Z2", what: "riscaldamento e resto" }, { z: "Z4", what: "20 min a 5:28" }], why: "Un blocco unico a soglia: impari a reggere lo sforzo costante." },
  w4r2: { zones: [{ z: "Z2", what: "11 km" }, { z: "Z3", what: "ultimi 3 km a 6:00" }], why: "Finire più veloce abitua le gambe a spingere da stanche." },
  w5r1: { zones: [{ z: "Z2", what: "10 km" }, { z: "Z5", what: "4 allunghi da 20 s" }], why: "Settimana di scarico: gambe fresche e allunghi per restare brillante." },
  w6r1: { zones: [{ z: "Z2", what: "11 km" }, { z: "Z3–Z4", what: "ultimi 4 km a 5:50" }], why: "Prova insieme finale veloce e gel, i due punti deboli della mezza." },
  w7r1: { zones: [{ z: "Z2", what: "riscaldamento e resto" }, { z: "Z4", what: "3 × 8 min a 5:28" }], why: "Più minuti a soglia in blocchi brevi, con meno fatica." },
  w7r2: { zones: [{ z: "Z2", what: "12 km" }, { z: "Z3–Z4", what: "ultimi 4 km a 5:45" }], why: "Spingere a gambe già stanche: è il tuo punto debole." },
  w8r1: { zones: [{ z: "Z2", what: "riscaldamento e resto" }, { z: "Z5", what: "8 × 1 min a 5:00" }], why: "Ripetute brevi per mantenere velocità e meccanica di corsa." },
  w8r2: { zones: [{ z: "Z2", what: "12 km" }, { z: "Z4", what: "ultimi 5 km a 5:40" }], why: "Il blocco veloce cresce: 5 km ormai vicini al ritmo gara." },
  w9r1: { zones: [{ z: "Z2", what: "3 km iniziali e 3 km finali" }, { z: "Z4", what: "6 km a 5:36" }], why: "Primo controllo: capisci se il 5:36 è sostenibile e scegli tra A, B e C." },
  w10r1: { zones: [{ z: "Z2", what: "12 km" }, { z: "Z4", what: "6 km a 5:38" }], why: "Il blocco a ritmo gara si allunga: allena la resistenza dopo i 12 km." },
  w11r1: { zones: [{ z: "Z2", what: "riscaldamento e resto" }, { z: "Z4", what: "2 × 15 min a 5:28" }], why: "Trenta minuti a soglia in due blocchi: alzano il ritmo che reggi a lungo." },
  w11r2: { zones: [{ z: "Z2", what: "16 km con gel" }], why: "Settimana di accumulo: chilometri facili e prova dei gel, senza ritmi." },
  w12r1: { zones: [{ z: "Z2", what: "riscaldamento e resto" }, { z: "Z5", what: "5 × 1000 m a 4:58" }], why: "Ripetute più lunghe per spingere in alto la velocità aerobica massima." },
  w12r2: { zones: [{ z: "Z2", what: "10 km" }, { z: "Z4", what: "8 km a 5:36" }], why: "Otto km a ritmo gara con le gambe già cariche: allena la tenuta." },
  w13r1: { zones: [{ z: "Z2", what: "2 km + 1 km" }, { z: "Z4–Z5", what: "10 km a tutta, regolare" }], why: "Test: misura la tua velocità e conferma se resti sull'obiettivo A." },
  w14r1: { zones: [{ z: "Z2", what: "11 km" }, { z: "Z4", what: "8 km a 5:36" }], why: "Lungo più lungo con lo stesso blocco: allunga la resistenza." },
  w15r1: { zones: [{ z: "Z2", what: "riscaldamento e resto" }, { z: "Z4", what: "25 min a 5:28" }], why: "Tiene alta la soglia nella settimana del primo simulatore." },
  w15r2: { zones: [{ z: "Z2", what: "10 km" }, { z: "Z4", what: "10 km a 5:36" }], why: "Simulatore: mezza gara a ritmo gara dopo 10 km, con colazione e gel di gara." },
  w16r1: { zones: [{ z: "Z2", what: "riscaldamento e resto" }, { z: "Z5", what: "6 × 800 m a 4:55" }], why: "Ripetute brevi per tenere vivace la velocità dopo il simulatore." },
  w16r2: { zones: [{ z: "Z2", what: "14 km" }, { z: "Z4", what: "4 km a 5:36" }], why: "Lungo di recupero con finale a ritmo gara: scarichi senza perdere il passo." },
  w17r1: { zones: [{ z: "Z2", what: "3 km iniziali e finali" }, { z: "Z4", what: "3 × 2 km a 5:36" }], why: "Settimana di scarico: ritmo gara in blocchi corti per abituarti al passo." },
  w18r1: { zones: [{ z: "Z2", what: "riscaldamento e resto" }, { z: "Z4", what: "2 × 12 min a 5:28" }], why: "Soglia lunga prima del simulatore finale." },
  w18r2: { zones: [{ z: "Z2", what: "8 km" }, { z: "Z4", what: "12 km a 5:36" }], why: "Prova finale: 12 km a ritmo gara dopo 8 facili, come in gara." },
  w19r1: { zones: [{ z: "Z2", what: "riscaldamento e resto" }, { z: "Z4", what: "2 × 4 km a 5:36" }], why: "Blocchi a ritmo gara con recupero: consolidano il passo." },
  w19r2: { zones: [{ z: "Z2", what: "12 km" }, { z: "Z4", what: "4 km a 5:36" }], why: "Lungo più corto dopo il picco, con un finale a ritmo gara." },
  w20r1: { zones: [{ z: "Z2", what: "9 km" }, { z: "Z4", what: "5 km a 5:36" }], why: "Ultima prova lunga di ritmo prima di scaricare." },
  w21r1: { zones: [{ z: "Z2", what: "riscaldamento e resto" }, { z: "Z4", what: "3 × 1,5 km a 5:36" }], why: "Taper: ritmo gara in piccole dosi per restare brillante senza fatica." },
  w22r1: { zones: [{ z: "Z2", what: "riscaldamento e resto" }, { z: "Z4", what: "3 × 1 min a 5:36" }], why: "Ultimo richiamo: sveglia le gambe prima della gara." },
  w22r2: { zones: [{ z: "Z4", what: "km 1–16: 5:41 poi 5:36" }, { z: "Z4–Z5", what: "km 17–21: tieni, volata nell'ultimo" }], why: "È il giorno: parti prudente, tieni 5:36 e accelera solo dal km 19." },
};

TRAINING_PLAN.forEach((p) => p.weeks.forEach((w) => w.runs.forEach((r) => Object.assign(r, RUN_INFO[r.id] ?? {}))));

export const ZONE_COLORS = { Z1: "#6B8EFF", Z2: "#00C4A7", Z3: "#D4A017", Z4: "#FF4B00", Z5: "#E23B3B" };

export const TYPE_COLORS = {
  "Speed": { bg: "#FF4B00", light: "rgba(255,75,0,0.12)", text: "#FF4B00" },
  "Tempo": { bg: "#D4A017", light: "rgba(212,160,23,0.12)", text: "#D4A017" },
  "Long Run": { bg: "#00C4A7", light: "rgba(0,196,167,0.12)", text: "#00C4A7" },
  "Easy": { bg: "#6B8EFF", light: "rgba(107,142,255,0.12)", text: "#6B8EFF" },
  "Race": { bg: "#CC2A2A", light: "rgba(204,42,42,0.15)", text: "#FF4444" },
};

export const TYPE_LABELS = {
  "Speed": "Veloce",
  "Tempo": "Soglia",
  "Long Run": "Lungo",
  "Easy": "Facile",
  "Race": "Gara",
};

export const RACE_GOALS = [
  { label: "A (sub-2)", time: "1:59", real: "5:38", garmin: "5:36", note: "Il tuo 10 km del 1° novembre (53:27) vale una mezza in 1:58:27: serve la resistenza per tenerlo." },
  { label: "B", time: "2:03", real: "5:50", garmin: "5:48", note: "Se i controlli (sett. 9, 13, 15, 18) sono a metà strada." },
  { label: "C", time: "2:10", real: "6:10", garmin: "6:07", note: "Se salti molte uscite chiave o i controlli sono deboli: resta un miglioramento sui 2:12:02." },
];

export const PASSAGES = [
  { goal: "A · 1:59", k5: "28:10", k10: "56:20", k15: "1:24:30", k20: "1:52:40", fin: "1:58:51" },
  { goal: "B · 2:03", k5: "29:10", k10: "58:20", k15: "1:27:30", k20: "1:56:40", fin: "2:03:04" },
  { goal: "C · 2:10", k5: "30:50", k10: "1:01:40", k15: "1:32:30", k20: "2:03:20", fin: "2:10:06" },
];

export const GATES = [
  { when: "Sett. 9 · 6 km a 5:36 (in 12 km)", a: "FC ≤ 175 e sforzo ≤ 7/10", b: "FC 176–178 o 8/10", c: "FC > 178 o ≥ 9/10" },
  { when: "Sett. 13 · test 10 km", a: "≤ 53:00", b: "53:00–54:30", c: "oltre 54:30" },
  { when: "Sett. 15 · 10 km a 5:36 (in 20 km)", a: "FC ≤ 175 e ≤ 7/10 agli ultimi 3 km", b: "FC 176–178 o 8/10", c: "FC > 178 o ≥ 9/10" },
  { when: "Sett. 18 · 12 km a 5:36 (in 20 km)", a: "FC ≤ 175 e ≤ 7/10 agli ultimi 3 km", b: "FC 176–178 o 8/10", c: "FC > 178 o ≥ 9/10" },
];

export const PACE_TABLE = [
  { t: "Facile / lungo (parte facile)", pace: "6:30–7:10", hr: "≤ 153", feel: "Frasi complete" },
  { t: "Progressivo (Z3)", pace: "5:50–6:10", hr: "154–165", feel: "Frasi brevi" },
  { t: "Tempo (soglia)", pace: "5:25–5:30", hr: "172–180", feel: "Comodamente duro" },
  { t: "Ritmo gara A (sub-2)", pace: "5:36", hr: "172–178", feel: "Sforzo 6–7 su 10" },
  { t: "Ripetute da 800–1000 m", pace: "4:55–5:03", hr: "a fine ripetuta", feel: "Duro ma controllato" },
  { t: "Allunghi da 20 s", pace: "≈ 4:50", hr: "—", feel: "Veloci ma rilassati" },
];

export const HR_ZONES = [
  { z: "Z1", bpm: "≤ 135", pct: "30–57% FCR", use: "Riscaldamento, camminata" },
  { z: "Z2", bpm: "136–153", pct: "57–70%", use: "Facili e parte facile dei lunghi" },
  { z: "Z3", bpm: "154–165", pct: "70–79%", use: "Progressivi" },
  { z: "Z4", bpm: "166–180", pct: "79–90%", use: "Ritmo gara e soglia" },
  { z: "Z5", bpm: "≥ 181", pct: "90–100%", use: "Ripetute, volata finale" },
];

