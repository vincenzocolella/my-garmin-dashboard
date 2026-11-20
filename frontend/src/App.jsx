import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { ChatDrawer } from './components/ChatDrawer';
import { Header } from './components/Header';
import { JudgePanel } from './components/JudgePanel';
import { SettingsModal } from './components/SettingsModal';
import { AIProvider, ErrorBoundary } from './components/ui';
import { aiAvailable } from './lib/ai';
import { computeAnalytics } from './lib/analytics';
import { apiFetch } from './lib/api';
import { generateDemo, SCENARIOS } from './lib/demo';
import { useSettings, useStored } from './lib/settings';
import { HealthTab } from './tabs/HealthTab';
import { RunningTab } from './tabs/RunningTab';
import { StrengthTab } from './tabs/StrengthTab';

export default function App() {
  const [settings, updateSettings] = useSettings();
  const [manualLogs, setManualLogs] = useStored('bio-os-strength-log', []);
  const [overrides, setOverrides] = useStored('bio-os-overrides', {});
  const [range, setRange] = useStored('bio-os-range', 30);
  const [tab, setTab] = useStored('bio-os-tab', 'health');
  const [dataset, setDataset] = useState(null);
  const [imported, setImported] = useState(null);
  const [status, setStatus] = useState({ state: 'idle' });
  const [backendStatus, setBackendStatus] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [judgeTrigger, setJudgeTrigger] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const inflight = useRef(null);

  const { dataSource, scenario, apiBase, appToken } = settings;
  const fetchDays = range > 30 ? 90 : 30; // baselines need 30 days even when showing 7D/14D
  const conn = useMemo(() => ({ apiBase, appToken }), [apiBase, appToken]);

  const load = useCallback(
    async ({ refresh = false } = {}) => {
      if (dataSource === 'demo') {
        setDataset(generateDemo(scenario));
        setStatus({ state: 'demo', at: new Date() });
        return;
      }
      if (dataSource === 'import' && imported) {
        setDataset(imported);
        setStatus({ state: 'import', at: new Date() });
        return;
      }
      inflight.current?.abort();
      const ctrl = new AbortController();
      inflight.current = ctrl;
      setStatus((s) => ({ ...s, state: 'loading' }));
      try {
        const ds = await apiFetch(conn, `/telemetry?days=${fetchDays}${refresh ? '&refresh=true' : ''}`, { signal: ctrl.signal });
        setDataset(ds);
        setStatus({ state: 'live', at: new Date() });
      } catch (e) {
        if (e.name === 'AbortError') return;
        if (e.status === 401) {
          setSettingsNotice('Il proxy ha rifiutato la chiave di accesso: inserisci l’APP_TOKEN corretto.');
          setSettingsOpen(true);
        }
        setStatus({ state: 'error', error: e.message, at: new Date() });
        setDataset((prev) => (prev && prev.source !== 'demo' ? prev : generateDemo(scenario)));
      }
    },
    [dataSource, scenario, imported, conn, fetchDays],
  );

  useEffect(() => {
    load();
  }, [load]);

  // pseudo-live polling
  useEffect(() => {
    if (dataSource !== 'garmin') return undefined;
    const id = setInterval(() => load(), Math.max(2, Number(settings.pollMinutes) || 10) * 60000);
    return () => clearInterval(id);
  }, [load, dataSource, settings.pollMinutes]);

  // backend capabilities (AI on server) — also used while viewing demo data
  useEffect(() => {
    let alive = true;
    apiFetch(conn, '/status').then((s) => alive && setBackendStatus(s)).catch(() => alive && setBackendStatus(null));
    return () => {
      alive = false;
    };
  }, [conn]);

  const analytics = useMemo(
    () =>
      dataset
        ? computeAnalytics(dataset, {
            rangeDays: range,
            settings: { maxHr: settings.maxHr, restHr: settings.restHr, sleepNeedH: settings.sleepNeedH },
            manualLogs,
            overrides,
          })
        : null,
    [dataset, range, settings.maxHr, settings.restHr, settings.sleepNeedH, manualLogs, overrides],
  );

  const syncAndJudge = async () => {
    setSyncing(true);
    await load({ refresh: true });
    setSyncing(false);
    setJudgeTrigger((t) => t + 1);
  };

  const fallbackBanner = dataSource === 'garmin' && status.state === 'error';

  return (
    <div className="min-h-screen bg-void font-sans text-gray-200">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,240,255,0.06),transparent_55%)]" />
      <Header tab={tab} setTab={setTab} range={range} setRange={setRange} status={status} dataset={dataset} dataSource={dataSource}
        onSync={syncAndJudge} syncing={syncing} onSettings={() => { setSettingsNotice(''); setSettingsOpen(true); }} onChat={() => setChatOpen(true)}
        aiAvailable={aiAvailable(settings, backendStatus)} />

      <main className="relative mx-auto max-w-[1600px] space-y-5 px-4 py-5 md:px-6">
        {fallbackBanner && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber/40 bg-amber/10 px-4 py-2 text-xs text-amber">
            <AlertTriangle size={14} />
            <span>{status.error}</span>
            <span className="text-amber/70">{dataset?.source === 'demo' ? `· visualizzo dati demo (${SCENARIOS[dataset.scenario]?.label})` : '· visualizzo l’ultimo dato sincronizzato'}</span>
            <button type="button" className="ml-auto underline" onClick={() => load()}>Riprova</button>
          </div>
        )}
        {dataset?.source === 'demo' && dataSource === 'demo' && (
          <div className="rounded-lg border border-violet/30 bg-violet/10 px-4 py-2 text-xs text-violet">
            Modalità demo · scenario <b>{SCENARIOS[dataset.scenario]?.label}</b>: {SCENARIOS[dataset.scenario]?.desc} Cambia scenario o passa ai dati Garmin dalle impostazioni.
          </div>
        )}

        {!analytics ? (
          <div className="flex items-center justify-center gap-3 py-32 text-sm text-gray-500">
            <Loader2 className="animate-spin text-cyan" size={18} /> Sincronizzazione telemetria… (il primo caricamento di 30-90 giorni può richiedere fino a un minuto)
          </div>
        ) : (
          <AIProvider settings={settings} analytics={analytics} backendStatus={backendStatus}>
            <ErrorBoundary>
              <JudgePanel trigger={judgeTrigger} onPersona={(p) => updateSettings({ persona: p })} />
              {tab === 'health' && <HealthTab a={analytics} />}
              {tab === 'running' && <RunningTab a={analytics} />}
              {tab === 'strength' && <StrengthTab a={analytics} overrides={overrides} setOverrides={setOverrides} setManualLogs={setManualLogs} />}
            </ErrorBoundary>
            <ChatDrawer open={chatOpen} onClose={() => setChatOpen(false)} />
          </AIProvider>
        )}
        <footer className="pb-6 pt-2 text-center text-[10px] uppercase tracking-[0.2em] text-gray-700">
          BIO-OS · dati Garmin via proxy non ufficiale · non è un dispositivo medico
        </footer>
      </main>

      {settingsOpen && (
        <SettingsModal settings={settings} dataset={dataset} notice={settingsNotice}
          onSave={updateSettings} onClose={() => setSettingsOpen(false)}
          onImport={(ds) => { setImported(ds); updateSettings({ dataSource: 'import' }); }} />
      )}
    </div>
  );
}
