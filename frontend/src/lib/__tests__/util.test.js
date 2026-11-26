import { describe, expect, it } from 'vitest';
import { addDays, diffDays, fmtDuration, fmtH, fmtPace, weekStart } from '../util';

describe('date helpers', () => {
  it('addDays is not shifted by daylight saving', () => {
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2026-10-25', -1)).toBe('2026-10-24');
  });
  it('diffDays and weekStart (Monday)', () => {
    expect(diffDays('2026-11-23', '2026-11-16')).toBe(7);
    expect(weekStart('2026-11-29')).toBe('2026-11-23');
    expect(weekStart('2026-11-23')).toBe('2026-11-23');
  });
});

describe('formatting', () => {
  it('hours are written as 7h10, never decimals', () => {
    expect(fmtH(7 + 10 / 60)).toBe('7h10');
    expect(fmtH(8)).toBe('8h');
    expect(fmtH(0.8)).toBe('48 min');
    expect(fmtH(-1.5)).toBe('−1h30');
    expect(fmtH(0.25, { signed: true })).toBe('+15 min');
  });
  it('pace and duration round without :60', () => {
    expect(fmtPace(359.7)).toBe('6:00');
    expect(fmtPace(336)).toBe('5:36');
    expect(fmtDuration(2699.7)).toBe('45:00');
    expect(fmtDuration(7140)).toBe('1:59:00');
  });
});
