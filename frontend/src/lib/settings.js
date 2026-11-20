import { useCallback, useEffect, useState } from 'react';

export const REPO_RAW = 'https://raw.githubusercontent.com/vincenzocolella/my-garmin-dashboard/main/backend';

export const DEFAULT_SETTINGS = {
  apiBase: import.meta.env.VITE_API_BASE ?? 'http://localhost:8000/api',
  appToken: '',
  dataSource: 'garmin', // 'garmin' | 'demo' | 'import'
  scenario: 'balanced',
  aiProvider: 'backend', // 'backend' | 'gemini' | 'openai' | 'heuristic'
  geminiKey: '',
  geminiModel: 'gemini-3.8-flash',
  openaiKey: '',
  openaiModel: 'gpt-5-mini',
  persona: 'quant',
  pollMinutes: 10,
  maxHr: '',
  restHr: '',
  sleepNeedH: 8,
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch {
    /* corrupted value: fall through to the default */
  }
  return typeof fallback === 'function' ? fallback() : fallback;
}

/** useState persisted in localStorage. */
export function useStored(key, fallback) {
  const [value, setValue] = useState(() => read(key, fallback));
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* quota / private mode: keep in memory */
    }
  }, [key, value]);
  return [value, setValue];
}

export function useSettings() {
  // migrate the access token saved by the first version of the dashboard
  const [stored, setStored] = useStored('bio-os-settings', () => {
    const legacy = localStorage.getItem('bio-os-token');
    return legacy ? { appToken: legacy } : {};
  });
  const settings = { ...DEFAULT_SETTINGS, ...stored };
  const update = useCallback((patch) => setStored((prev) => ({ ...prev, ...patch })), [setStored]);
  return [settings, update];
}
