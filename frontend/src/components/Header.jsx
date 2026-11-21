import { Bot, Dna, Dumbbell, Footprints, Loader2, MessageSquare, RefreshCw, Settings, Target, Zap } from 'lucide-react';
import { SCENARIOS } from '../lib/demo';

export const TABS = [
  { key: 'health', label: 'Salute & Recupero', icon: Dna },
  { key: 'plan', label: 'Piano Sub-2', icon: Target },
  { key: 'running', label: 'Corsa', icon: Footprints },
  { key: 'strength', label: 'Forza', icon: Dumbbell },
];
export const RANGES = [7, 14, 30, 90];

function StatusPill({ status, dataset, dataSource }) {
  const time = status.at ? status.at.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '';
  let dot = 'bg-gray-500';
  let label = 'In attesa';
  let title = '';
  if (status.state === 'loading') {
    dot = 'bg-amber animate-pulse';
    label = 'Sync Garmin…';
  } else if (status.state === 'live') {
    dot = 'bg-emerald animate-pulse';
    label = `Garmin · live ${time}`;
    title = 'Pseudo-live polling attivo tramite proxy FastAPI';
  } else if (status.state === 'error') {
    dot = 'bg-crimson';
    label = dataset?.source === 'demo' && dataSource === 'garmin' ? 'Offline · dati demo' : 'Errore sync';
    title = status.error;
  } else if (status.state === 'demo') {
    dot = 'bg-violet';
    label = `Demo · ${SCENARIOS[dataset?.scenario]?.label ?? ''}`;
  } else if (status.state === 'import') {
    dot = 'bg-cyan';
    label = 'JSON importato';
  }
  return (
    <span title={title} className="flex items-center gap-2 rounded-full border border-edge bg-void/70 px-3 py-1 text-[11px] text-gray-300">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      <span className="num">{label}</span>
    </span>
  );
}

export function Header({ tab, setTab, range, setRange, status, dataset, dataSource, onSync, syncing, onSettings, onChat, aiAvailable }) {
  return (
    <header className="sticky top-0 z-30 border-b border-edge bg-void/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 md:px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-cyan/40 bg-cyan/10">
            <Zap size={16} className="text-cyan" />
          </div>
          <div className="num text-sm font-bold uppercase tracking-[0.2em] text-cyan">Garmin Dashboard</div>
        </div>

        <nav className="flex gap-1 rounded-lg border border-edge bg-panel/60 p-1">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition ${tab === key ? 'bg-cyan/15 text-cyan shadow-[inset_0_0_0_1px_rgba(0,240,255,0.35)]' : 'text-gray-400 hover:text-gray-200'}`}>
              <Icon size={14} />
              <span className="hidden md:inline">{label}</span>
            </button>
          ))}
        </nav>

        <div className="flex gap-1 rounded-lg border border-edge bg-panel/60 p-1">
          {RANGES.map((r) => (
            <button key={r} type="button" onClick={() => setRange(r)}
              className={`num rounded-md px-2.5 py-1 text-xs transition ${range === r ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-200'}`}>
              {r}D
            </button>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <StatusPill status={status} dataset={dataset} dataSource={dataSource} />
          <button type="button" onClick={onSync} disabled={syncing}
            className="flex items-center gap-1.5 rounded-md bg-cyan px-3 py-1.5 text-xs font-semibold text-void transition hover:bg-cyan/85 disabled:opacity-60">
            {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Sync & Judge Now
          </button>
          <button type="button" onClick={onChat} title="Chiedi ai tuoi dati"
            className="flex items-center gap-1.5 rounded-md border border-edge px-2.5 py-1.5 text-xs text-gray-300 hover:border-cyan/50 hover:text-cyan">
            <MessageSquare size={14} />
            <span className="hidden lg:inline">Ask</span>
            {aiAvailable && <Bot size={12} className="text-cyan" />}
          </button>
          <button type="button" onClick={onSettings} title="Impostazioni e API keys"
            className="rounded-md border border-edge p-1.5 text-gray-400 hover:border-cyan/50 hover:text-cyan">
            <Settings size={15} />
          </button>
        </div>
      </div>
    </header>
  );
}
