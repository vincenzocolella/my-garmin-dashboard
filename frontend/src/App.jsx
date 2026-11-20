import { useCallback, useEffect, useState } from 'react';
import { Activity, Battery, Brain, Dumbbell, Footprints, Heart, Moon, Zap } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000/api';
const TOKEN_KEY = 'bio-os-token';

const isRun = (t) => t?.includes('running');
const isStrength = (t) => t === 'strength_training';
const typeLabel = (t) => (isRun(t) ? 'Corsa' : isStrength(t) ? 'Pesi' : (t ?? '—').replaceAll('_', ' '));
const show = (v) => (v === null || v === undefined ? 'N/D' : v);

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function api(path, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.detail ?? `HTTP ${res.status}`);
  }
  return res.json();
}

function Tile({ icon: Icon, label, value, unit, sub }) {
  return (
    <div className="bg-gray-900 p-6 rounded-lg border border-gray-800">
      <div className="flex items-center gap-3 mb-2 text-gray-400">
        <Icon size={20} /> {label}
      </div>
      <div className="text-4xl font-bold capitalize">
        {show(value)} {unit && value != null && <span className="text-sm text-gray-500 normal-case">{unit}</span>}
      </div>
      {sub && <div className="text-sm text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

function TokenGate({ onSubmit, error }) {
  const [value, setValue] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value.trim());
      }}
      className="max-w-md mx-auto mt-24 bg-gray-900 p-8 rounded-lg border border-gray-800"
    >
      <h2 className="text-xl font-bold mb-4">Token di accesso</h2>
      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
      <input
        type="password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 mb-4"
        placeholder="APP_TOKEN"
        autoFocus
      />
      <button className="w-full bg-blue-600 hover:bg-blue-500 font-bold py-2 rounded">Entra</button>
    </form>
  );
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? '');
  const [needToken, setNeedToken] = useState(false);
  const [activeTab, setActiveTab] = useState('main');
  const [mainData, setMainData] = useState(null);
  const [sportData, setSportData] = useState(null);
  const [error, setError] = useState('');
  const [aiJudgment, setAiJudgment] = useState('');
  const [aiError, setAiError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleError = useCallback((e, setter) => {
    if (e.status === 401) setNeedToken(true);
    else setter(e.message);
  }, []);

  useEffect(() => {
    setError('');
    api('/main-dashboard', token).then(setMainData).catch((e) => handleError(e, setError));
    api('/sport-dashboard', token).then(setSportData).catch((e) => handleError(e, setError));
  }, [token, handleError]);

  const getJudgment = async () => {
    setLoading(true);
    setAiError('');
    try {
      const data = await api('/ai-judge', token);
      setAiJudgment(data.judgment);
    } catch (e) {
      handleError(e, setAiError);
    } finally {
      setLoading(false);
    }
  };

  if (needToken) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 p-8 font-sans">
        <TokenGate
          error={token ? 'Token non valido' : ''}
          onSubmit={(t) => {
            localStorage.setItem(TOKEN_KEY, t);
            setNeedToken(false);
            setToken(t);
          }}
        />
      </div>
    );
  }

  const tabClass = (tab) =>
    `px-4 py-2 rounded ${activeTab === tab ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8 font-sans">
      <header className="mb-8 border-b border-gray-800 pb-4 flex flex-wrap gap-4 justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight text-blue-400">BIO-OS // TELEMETRY</h1>
        <div className="flex gap-4">
          <button onClick={() => setActiveTab('main')} className={tabClass('main')}>Vita & Recupero</button>
          <button onClick={() => setActiveTab('sport')} className={tabClass('sport')}>Sport & Pesi</button>
        </div>
      </header>

      {error && <div className="mb-6 p-4 rounded border border-red-800 bg-red-950 text-red-300">{error}</div>}

      {/* MENU 1: DATI VITALI */}
      {activeTab === 'main' &&
        (mainData ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            <Tile icon={Moon} label="Punteggio Sonno" value={mainData.sleep_score} unit="/100"
              sub={mainData.sleep_hours != null && `${mainData.sleep_hours} h di sonno`} />
            <Tile icon={Heart} label="Battito a Riposo" value={mainData.heart_rate_rest} unit="bpm" />
            <Tile icon={Activity} label="Status HRV" value={mainData.hrv_status?.toLowerCase()}
              sub={mainData.hrv_last_night != null && `Notte ${mainData.hrv_last_night} ms · 7gg ${show(mainData.hrv_weekly_avg)} ms`} />
            <Tile icon={Zap} label="Stress Medio" value={mainData.stress_avg} unit="/100" />
            <Tile icon={Battery} label="Body Battery" value={mainData.body_battery_now} unit="/100"
              sub={mainData.body_battery_max != null && `Max oggi ${mainData.body_battery_max}`} />
            <Tile icon={Footprints} label="Passi" value={mainData.steps?.toLocaleString('it-IT')} />
          </div>
        ) : (
          !error && <p className="text-gray-500 mb-12">Caricamento dati vitali…</p>
        ))}

      {/* MENU 2: SPORT E PESI */}
      {activeTab === 'sport' &&
        (sportData ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
            {sportData.length === 0 && <p className="text-gray-500">Nessuna attività trovata.</p>}
            {sportData.map((act) => (
              <div key={act.id} className="bg-gray-900 p-6 rounded-lg border border-gray-800 flex justify-between items-center gap-4">
                <div>
                  <div className="text-sm text-blue-400 font-semibold uppercase mb-1">
                    {typeLabel(act.type)}
                    {act.start && <span className="text-gray-500 normal-case font-normal"> · {act.start.slice(0, 16)}</span>}
                  </div>
                  <div className="text-xl font-bold">{act.name}</div>
                  <div className="text-gray-400 text-sm mt-2">
                    {act.duration_min} min • {show(act.calories)} kcal • FC media: {show(act.avg_hr)} bpm
                    {act.training_load != null && <> • Carico: {Math.round(act.training_load)}</>}
                  </div>
                </div>
                {act.distance_km > 0 && (
                  <div className="text-right shrink-0">
                    <div className="text-3xl font-bold">{act.distance_km} <span className="text-sm text-gray-500">km</span></div>
                  </div>
                )}
                {isStrength(act.type) && <Dumbbell size={40} className="text-gray-600 shrink-0" />}
              </div>
            ))}
          </div>
        ) : (
          !error && <p className="text-gray-500 mb-12">Caricamento attività…</p>
        ))}

      {/* AI JUDGE */}
      <div className="bg-gray-900 p-8 rounded-lg border border-gray-800 mt-8">
        <div className="flex flex-wrap gap-4 items-center justify-between mb-6">
          <div className="flex items-center gap-3 text-2xl font-bold text-white">
            <Brain className="text-blue-500" /> AI Judge
          </div>
          <button
            onClick={getJudgment}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-6 rounded transition-colors disabled:opacity-50"
          >
            {loading ? 'Analisi telemetria in corso…' : 'Richiedi Giudizio'}
          </button>
        </div>
        {aiError && <p className="text-red-400">{aiError}</p>}
        {aiJudgment && (
          <div className="bg-gray-950 p-6 rounded border border-gray-800 text-gray-300 leading-relaxed whitespace-pre-wrap">
            {aiJudgment}
          </div>
        )}
      </div>
    </div>
  );
}
