import { describe, expect, it } from 'vitest';
import { computeAnalytics } from '../analytics';
import { generateDemo } from '../demo';
import { diffDays } from '../util';

const episodes = (ds) => {
  const a = computeAnalytics(ds, { rangeDays: 'max' });
  return a.illness.episodes.map((e) => ({ ...e, from: diffDays(a.today, e.start), to: diffDays(a.today, e.end) }));
};

describe('symptom radar', () => {
  const ds = generateDemo('balanced');
  it('finds the two injected sickness episodes (48-53 and 120-122 days ago) as illness', () => {
    const eps = episodes(ds);
    const near = (lo, hi) => eps.find((e) => e.from <= hi + 1 && e.to >= lo - 1);
    expect(near(48, 53)?.type).toBe('illness');
    expect(near(120, 122)?.type).toBe('illness');
  });
  it('reports the overnight breathing-rate rise when available, works without it', () => {
    const withResp = episodes(ds).find((e) => e.type === 'illness');
    expect(withResp.markers.resp).toBeGreaterThan(0.8);
    expect(withResp.signals).toContain('respirazione ↑');
    const noResp = { ...ds, days: ds.days.map(({ respiration, respirationLow, spo2, spo2Low, ...d }) => d) };
    const eps = episodes(noResp);
    expect(eps.filter((e) => e.type === 'illness').length).toBeGreaterThanOrEqual(2);
    expect(eps.every((e) => e.markers.resp == null)).toBe(true);
  });
  it('the view follows the range, at least 30 days', () => {
    const a = computeAnalytics(ds, { rangeDays: 7 });
    expect(a.illness.view.days).toBe(30);
    expect(a.illness.view.episodes.every((e) => e.end >= a.illness.view.start)).toBe(true);
  });
});
