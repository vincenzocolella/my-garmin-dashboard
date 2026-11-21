import { useRef, useState } from 'react';
import { CheckCircle2, Download, Loader2, Upload, X, XCircle } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { PROVIDERS } from '../lib/ai';
import { SCENARIOS } from '../lib/demo';
import { PERSONAS } from '../lib/insights';
import { REPO_RAW } from '../lib/settings';
import { Button } from './ui';

const input = 'w-full rounded-md border border-edge bg-void px-3 py-2 text-sm text-gray-100 outline-none placeholder:text-gray-600 focus:border-cyan/60';

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-gray-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-gray-600">{hint}</span>}
    </label>
  );
}

function Section({ title, children }) {
  return (
    <fieldset className="space-y-3 rounded-lg border border-edge p-4">
      <legend className="px-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan">{title}</legend>
      {children}
    </fieldset>
  );
}

async function downloadFile(url, name) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch {
    window.open(url, '_blank', 'noopener');
  }
}

export function SettingsModal({ settings, onSave, onClose, onImport, onClearCache, dataset, notice }) {
  const [draft, setDraft] = useState(settings);
  const [test, setTest] = useState(null);
  const [importError, setImportError] = useState('');
  const fileRef = useRef(null);
  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  const testConnection = async () => {
    setTest({ state: 'loading' });
    try {
      const st = await apiFetch(draft, '/status');
      setTest({ state: 'ok', text: `Connesso · Garmin ${st.garmin ? 'configurato' : 'NON configurato'} · AI ${st.ai ? st.model : 'non configurata'}` });
    } catch (e) {
      setTest({ state: 'error', text: e.status === 401 ? 'Token di accesso errato' : e.message });
    }
  };

  const importJson = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.days) || !Array.isArray(data.activities)) throw new Error('Formato non valido: servono i campi "days" e "activities" (come GET /api/telemetry)');
      onImport({ ...data, source: 'import', today: data.today ?? data.days.at(-1)?.date });
      setImportError('');
      onClose();
    } catch (err) {
      setImportError(err.message);
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(dataset, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `garmin-dashboard-${dataset?.today ?? 'export'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="glass my-8 w-full max-w-2xl rounded-xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-edge px-6 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan">Configurazione</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-white"><X size={18} /></button>
        </header>
        <form className="space-y-5 px-6 py-5" onSubmit={(e) => { e.preventDefault(); onSave(draft); onClose(); }}>
          {notice && <p className="rounded-md border border-amber/40 bg-amber/10 px-3 py-2 text-xs text-amber">{notice}</p>}

          <Section title="Sorgente dati">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Modalità">
                <select className={input} value={draft.dataSource} onChange={set('dataSource')}>
                  <option value="garmin">Garmin live (proxy FastAPI)</option>
                  <option value="demo">Dataset demo simulato</option>
                  {dataset?.source === 'import' && <option value="import">JSON importato</option>}
                </select>
              </Field>
              <Field label="Scenario demo" hint={SCENARIOS[draft.scenario]?.desc}>
                <select className={input} value={draft.scenario} onChange={set('scenario')}>
                  {Object.entries(SCENARIOS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
                </select>
              </Field>
            </div>
          </Section>

          <Section title="Garmin Personal API (proxy FastAPI)">
            <p className="text-[11px] leading-relaxed text-gray-500">
              Garmin non offre API key personali: il proxy Python accede al tuo account con i token OAuth generati da <code className="text-gray-300">login.py</code> e
              li tiene sul server. Il browser parla solo con il proxy, protetto dal tuo APP_TOKEN.
            </p>
            <Field label="URL proxy FastAPI"><input className={input} value={draft.apiBase} onChange={set('apiBase')} placeholder="https://…onrender.com/api" /></Field>
            <Field label="Chiave di accesso proxy (APP_TOKEN)"><input className={input} type="password" value={draft.appToken} onChange={set('appToken')} autoComplete="off" /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Polling (minuti)" hint="Il backend mette in cache per 5 min"><input className={input} type="number" min="2" max="120" value={draft.pollMinutes} onChange={set('pollMinutes')} /></Field>
              <div className="flex items-end gap-2">
                <Button onClick={testConnection}>{test?.state === 'loading' ? <Loader2 size={12} className="animate-spin" /> : null}Test connessione</Button>
              </div>
            </div>
            {test && test.state !== 'loading' && (
              <p className={`flex items-center gap-1.5 text-xs ${test.state === 'ok' ? 'text-emerald' : 'text-crimson'}`}>
                {test.state === 'ok' ? <CheckCircle2 size={13} /> : <XCircle size={13} />}{test.text}
              </p>
            )}
          </Section>

          <Section title="Intelligenza artificiale">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Provider">
                <select className={input} value={draft.aiProvider} onChange={set('aiProvider')}>
                  {Object.entries(PROVIDERS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </Field>
              <Field label="Personalità predefinita">
                <select className={input} value={draft.persona} onChange={set('persona')}>
                  {Object.entries(PERSONAS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
                </select>
              </Field>
            </div>
            {draft.aiProvider === 'gemini' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Gemini API key"><input className={input} type="password" value={draft.geminiKey} onChange={set('geminiKey')} autoComplete="off" /></Field>
                <Field label="Modello"><input className={input} value={draft.geminiModel} onChange={set('geminiModel')} /></Field>
              </div>
            )}
            {draft.aiProvider === 'openai' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="OpenAI API key"><input className={input} type="password" value={draft.openaiKey} onChange={set('openaiKey')} autoComplete="off" /></Field>
                <Field label="Modello"><input className={input} value={draft.openaiModel} onChange={set('openaiModel')} /></Field>
              </div>
            )}
            <p className="text-[11px] leading-relaxed text-gray-500">
              {draft.aiProvider === 'backend' && 'Consigliato: la chiave Gemini resta sul server (GEMINI_API_KEY su Render), il browser non la vede mai.'}
              {(draft.aiProvider === 'gemini' || draft.aiProvider === 'openai') && 'La chiave viene salvata in chiaro nel localStorage di questo browser e inviata direttamente al provider. Usala solo su un dispositivo tuo.'}
              {draft.aiProvider === 'heuristic' && 'Nessuna chiamata esterna: tutte le analisi vengono dal motore euristico locale.'}
            </p>
          </Section>

          <Section title="Profilo atleta">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="FC max" hint="vuoto = dalle zone"><input className={input} type="number" value={draft.maxHr} onChange={set('maxHr')} placeholder="auto" /></Field>
              <Field label="FC riposo" hint="vuoto = dalle zone"><input className={input} type="number" value={draft.restHr} onChange={set('restHr')} placeholder="auto" /></Field>
              <Field label="Bisogno sonno (h)"><input className={input} type="number" step="0.25" value={draft.sleepNeedH} onChange={set('sleepNeedH')} /></Field>
            </div>
            <Field label="Zone FC" hint="Auto = lette da Garmin Connect a ogni sincronizzazione; FC max/riposo qui sopra, se compilate, hanno la precedenza nei calcoli">
              <select className={input} value={draft.zoneSource} onChange={set('zoneSource')}>
                <option value="auto">Automatiche da Garmin (standard se non disponibili)</option>
                <option value="standard">Standard: % FCR, max 195, riposo 57</option>
              </select>
            </Field>
            <Field label="Sensibilità Radar sintomi" hint="Alta = segnala anche deviazioni deboli (più falsi allarmi)">
              <select className={input} value={draft.illnessSensitivity} onChange={set('illnessSensitivity')}>
                <option value="bassa">Bassa</option><option value="media">Media</option><option value="alta">Alta</option>
              </select>
            </Field>
          </Section>

          <Section title="Strumenti">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => downloadFile(`${REPO_RAW}/main.py`, 'main.py')}><Download size={12} />Proxy main.py</Button>
              <Button onClick={() => downloadFile(`${REPO_RAW}/login.py`, 'login.py')}><Download size={12} />login.py</Button>
              <Button onClick={() => downloadFile(`${REPO_RAW}/requirements.txt`, 'requirements.txt')}><Download size={12} />requirements.txt</Button>
              <Button onClick={exportJson} disabled={!dataset}><Download size={12} />Esporta JSON attivo</Button>
              <Button onClick={() => fileRef.current?.click()}><Upload size={12} />Importa JSON</Button>
              {onClearCache && <Button onClick={() => { onClearCache(); onClose(); }}>Svuota cache storico</Button>}
              <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={importJson} />
            </div>
            {importError && <p className="text-xs text-crimson">{importError}</p>}
          </Section>

          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>Annulla</Button>
            <Button variant="primary" type="submit">Salva</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
