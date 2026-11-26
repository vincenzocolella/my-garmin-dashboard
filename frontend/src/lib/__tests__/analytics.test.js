import { describe, expect, it } from 'vitest';
import { computeAnalytics, readinessBand, zToScore } from '../analytics';
import { generateDemo } from '../demo';

const run = (scenario, range = 30, settings = {}) => computeAnalytics(generateDemo(scenario), { rangeDays: range, settings: { sleepNeedH: 8, ...settings } });

describe('readiness scale', () => {
  it('75 = your normal, 15 points per standard deviation', () => {
    expect(zToScore(0)).toBe(75);
    expect(zToScore(1)).toBe(90);
    expect(zToScore(-2)).toBe(45);
    expect(zToScore(5)).toBe(100);
    expect(zToScore(-9)).toBe(0);
    expect(zToScore(null)).toBeNull();
  });
  it('bands', () => {
    expect(readinessBand(90).label).toBe('Sopra la tua norma');
    expect(readinessBand(75).label).toBe('Nella tua norma');
    expect(readinessBand(55).tone).toBe('warn');
    expect(readinessBand(40).tone).toBe('bad');
  });
  it('orders the demo scenarios sensibly', () => {
    const peak = run('peak').readiness;
    const balanced = run('balanced').readiness;
    const ot = run('overtraining').readiness;
    const sleepy = run('sleep_deprivation').readiness;
    expect(peak.score).toBeGreaterThan(balanced.score);
    expect(balanced.score).toBeGreaterThan(ot.score);
    expect(ot.autonomic).toBeLessThan(balanced.autonomic);
    expect(sleepy.sleep).toBeLessThan(balanced.sleep);
  });
});

describe('ranges', () => {
  it("'max' covers every day with data, numbers are taken literally", () => {
    const max = run('balanced', 'max');
    expect(max.isMax).toBe(true);
    expect(max.rangeDays).toBe(200);
    expect(run('balanced', 7).rangeDays).toBe(7);
  });
  it('period KPIs follow the range, the 7-day debt does not', () => {
    const a7 = run('balanced', 7);
    const a90 = run('balanced', 90);
    expect(a7.sleep.period.nights).toBeLessThanOrEqual(7);
    expect(a90.sleep.period.nights).toBeGreaterThan(60);
    expect(a7.sleep.debt7).toBe(a90.sleep.debt7);
    expect(a7.longevity.window).toBe(30); // longevity needs at least 30 days
    expect(a90.longevity.window).toBe(90);
  });
});

describe('longevity', () => {
  it('missing data is missing, not zero', () => {
    const ds = generateDemo('balanced');
    const a = computeAnalytics({ ...ds, days: [], activities: [], intraday: null, profile: {} }, { rangeDays: 30 });
    expect(a.longevity.score).toBeNull();
    expect(a.longevity.coverage).toBe(0);
    const noActs = computeAnalytics({ ...ds, activities: [] }, { rangeDays: 30 });
    const part = (k) => noActs.longevity.parts.find((p) => p.key === k);
    expect(part('strength').score).toBeNull();
    expect(part('activity').score).toBeNull();
  });
  it('VO2max is a percentile among peers: the same value scores higher when older', () => {
    const vo2 = (age) => run('balanced', 30, { age, sex: 'M' }).longevity.parts.find((p) => p.key === 'vo2max').score;
    expect(vo2(60)).toBeGreaterThanOrEqual(vo2(25));
  });
  it('HRV and stress are never proposed as levers', () => {
    const a = run('overtraining');
    expect(a.longevity.levers.every((p) => !['hrv', 'stress'].includes(p.key))).toBe(true);
  });
});
