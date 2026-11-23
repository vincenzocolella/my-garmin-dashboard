import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { ChatDrawer } from './components/ChatDrawer';
import { Header, RANGES } from './components/Header';
import { JudgePanel } from './components/JudgePanel';
import { SettingsModal } from './components/SettingsModal';
import { AIProvider, ErrorBoundary } from './components/ui';
import { aiAvailable } from './lib/ai';
import { computeAnalytics } from './lib/analytics';
import { apiFetch } from './lib/api';
import { generateDemo, SCENARIOS } from './lib/demo';
import { useSettings, useStored } from './lib/settings';
import { addDays, localToday } from './lib/util';
import { HealthTab } from './tabs/HealthTab';
import { PlanTab } from './tabs/PlanTab';
import { RunningTab } from './tabs/RunningTab';
import { StrengthTab } from './tabs/StrengthTab';

const DAYS_CACHE_KEY = 'bio-os-days-v1';
const HISTORY_DAYS = 365; // "Max" range: everything the browser has cached, backfilled in the background

function readDaysCache(base) {
  try {
    const c = JSON.parse(localStorage.getItem(DAYS_CACHE_KEY) ?? '{}');
    return c.base === base ? c.days ?? {} : {};
  } catch {
    return {};
  }
}
function writeDaysCache(base, days) {
  const keep = addDays(localToday(), -(HISTORY_DAYS + 10));
  const pruned = Object.fromEntries(Object.entries(days).filter(([d]) => d >= keep));
  try {
    localStorage.setItem(DAYS_CACHE_KEY, JSON.stringify({ base, days: pruned }));
  } catch {
    /* quota exceeded: the app still works, it just refetches */
  }
}
const daysFromCache = (cache, today) => Object.values(cache).filter((d) => d.date >= addDays(today, -(HISTORY_DAYS - 1)) && d.date <= today).sort((x, y) => (x.date < y.date ? -1 : 1));

export default function App() {
  const [settings, updateSettings] = useSettings();
  const [overrides, setOverrides] = useStored('bio-os-overrides', {});
  const [range, setRange] = useStored('bio-os-range', 30);
  const [tab, setTab] = useStored('bio-os-tab', 'health');
  useEffect(() => {
    if (tab === 'wellness') setTab('health'); // the illness tab now lives in the health tab (Radar sintomi)
  }, [tab, setTab]);
  useEffect(() => {
    if (!RANGES.includes(range)) setRange(30); // 14g was removed
  }, [range, setRange]);
  const [dataset, setDataset] = useState(null);
  const [imported, setImported] = useState(null);
  const [status, setStatus] = useState({ state: 'idle' });
  const [backendStatus, setBackendStatus] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [judgeTrigger, setJudgeTrigger] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [history, setHistory] = useState({ loading: false, done: 0, total: 0 });
  const inflight = useRef(null);
  const backfilled = useRef('');

  const { dataSource, scenario, apiBase, appToken } = settings;
  // baselines need 30+ days even on 7g; older days for 90g/Max come from the browser cache + background backfill
  const fetchDays = range === 'max' || range > 30 ? 90 : 30;
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
        // past days never change: ask the backend only for days missing from the browser cache
        const cache = readDaysCache(conn.apiBase);
        const today = localToday();
        let since = addDays(today, -1);
        for (let d = addDays(today, -(fetchDays - 1)); d <= addDays(today, -2); d = addDays(d, 1)) {
          if (!cache[d]) {
            since = d;
            break;
          }
        }
        const ds = await apiFetch(conn, `/telemetry?days=${fetchDays}&since=${since}${refresh ? '&refresh=true' : ''}`, { signal: ctrl.signal });
        ds.days.forEach((d) => (cache[d.date] = d));
        writeDaysCache(conn.apiBase, cache);
        setDataset({ ...ds, days: daysFromCache(cache, today) });
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

  // background backfill of up to HISTORY_DAYS of daily vitals (wellness scan), 31 days per request
  useEffect(() => {
    if (dataSource !== 'garmin' || status.state !== 'live' || backfilled.current === conn.apiBase) return undefined;
    backfilled.current = conn.apiBase;
    let alive = true;
    (async () => {
      const today = localToday();
      const cache = readDaysCache(conn.apiBase);
      const missing = [];
      for (let d = addDays(today, -(HISTORY_DAYS - 1)); d <= addDays(today, -2); d = addDays(d, 1)) if (!cache[d]) missing.push(d);
      const chunks = [];
      for (const d of missing) {
        const last = chunks.at(-1);
        if (last && addDays(last.end, 1) === d && last.n < 31) {
          last.end = d;
          last.n++;
        } else chunks.push({ start: d, end: d, n: 1 });
      }
      if (!chunks.length) return;
      setHistory({ loading: true, done: 0, total: chunks.length });
      for (const [i, c] of chunks.reverse().entries()) {
        if (!alive) return;
        try {
          const res = await apiFetch(conn, `/days?start=${c.start}&end=${c.end}`);
          res.days.forEach((d) => (cache[d.date] = d));
          writeDaysCache(conn.apiBase, cache);
          setDataset((prev) => (prev?.source === 'garmin' ? { ...prev, days: daysFromCache(cache, today) } : prev));
          setHistory({ loading: i + 1 < chunks.length, done: i + 1, total: chunks.length });
        } catch {
          setHistory((h) => ({ ...h, loading: false, error: true }));
          return;
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [dataSource, status.state, conn]);

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
            settings: { maxHr: settings.maxHr, restHr: settings.restHr, sleepNeedH: settings.sleepNeedH, illnessSensitivity: settings.illnessSensitivity, zoneSource: settings.zoneSource, age: settings.age, sex: settings.sex },
            overrides,
          })
        : null,
    [dataset, range, settings.maxHr, settings.restHr, settings.sleepNeedH, settings.illnessSensitivity, settings.zoneSource, settings.age, settings.sex, overrides],
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
            <Loader2 className="animate-spin text-cyan" size={18} /> Sincronizzazione dati Garmin…
          </div>
        ) : (
          <AIProvider settings={settings} analytics={analytics} backendStatus={backendStatus}>
            <ErrorBoundary>
              <JudgePanel trigger={judgeTrigger} onPersona={(p) => updateSettings({ persona: p })} />
              {(tab === 'health' || tab === 'wellness') && <HealthTab a={analytics} sensitivity={settings.illnessSensitivity} onSensitivity={(v) => updateSettings({ illnessSensitivity: v })} history={history} />}
              {tab === 'plan' && <PlanTab a={analytics} />}
              {tab === 'running' && <RunningTab a={analytics} />}
              {tab === 'strength' && <StrengthTab a={analytics} overrides={overrides} setOverrides={setOverrides} />}
            </ErrorBoundary>
            <ChatDrawer open={chatOpen} onClose={() => setChatOpen(false)} />
          </AIProvider>
        )}
        <footer className="pb-6 pt-2 text-center text-[10px] uppercase tracking-[0.2em] text-gray-700">
          Garmin Dashboard · dati via proxy non ufficiale · non è un dispositivo medico
        </footer>
      </main>

      {settingsOpen && (
        <SettingsModal settings={settings} dataset={dataset} notice={settingsNotice}
          onSave={updateSettings} onClose={() => setSettingsOpen(false)}
          onImport={(ds) => { setImported(ds); updateSettings({ dataSource: 'import' }); }}
          onClearCache={() => { localStorage.removeItem(DAYS_CACHE_KEY); backfilled.current = ''; load({ refresh: true }); }} />
      )}
    </div>
  );
}
