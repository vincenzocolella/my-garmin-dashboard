import { describe, expect, it } from 'vitest';
import { computeAnalytics } from '../analytics';
import { generateDemo } from '../demo';
import { dailySummary } from '../summary';

const at = (h) => {
  const d = new Date();
  d.setHours(h, 0, 0, 0);
  return d;
};

describe('Come stai', () => {
  const a = computeAnalytics(generateDemo('sleep_deprivation'), { rangeDays: 30, settings: { sleepNeedH: 8 } });
  it('has yesterday, last night and the week; today only from 11:00', () => {
    const morning = dailySummary(a, at(9));
    expect(morning.sections.map((s) => s.key)).toEqual(['ieri', 'notte', 'settimana']);
    expect(morning.todayAvailable).toBe(false);
  });
  it('flags a bad state in the sleep-deprivation scenario and advises an earlier bedtime', () => {
    const s = dailySummary(a, at(9));
    expect(['bad', 'warn']).toContain(s.tone);
    expect(s.advice.some((x) => x.includes('a letto entro'))).toBe(true);
  });
  it('does not judge today when the night is not synced yet', () => {
    const ds = generateDemo('balanced');
    const unsynced = { ...ds, days: ds.days.map((d, i, arr) => (i === arr.length - 1 ? { date: d.date } : d)), intraday: null };
    const s = dailySummary(computeAnalytics(unsynced, { rangeDays: 30 }), at(9));
    expect(s.chip).toBe('Dati parziali');
    expect(s.sections[1].text[0]).toMatch(/non risulta ancora sincronizzata/);
  });
});
