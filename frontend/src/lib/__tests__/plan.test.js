import { describe, expect, it } from 'vitest';
import { matchPlan, matchScore } from '../plan';

// week 3 = 16-22 Nov 2026 (key: Long Run 13 km), week 4 = 23-29 Nov (key: Long Run 14 km)
const TODAY = '2026-11-23';
let id = 0;
const run = (date, km, extra = {}) => ({ id: ++id, kind: 'run', date, start: `${date} 09:00:00`, distance: km * 1000, duration: km * 400, hard: false, avgHr: 145, ...extra });
const keyOf = (weeks, n) => weeks.find((w) => w.week === n).sessions.find((s) => !s.optional);

describe('matchScore', () => {
  it('rejects runs of a very different length', () => {
    const long13 = { type: 'Long Run', targetKm: 13 };
    expect(matchScore(long13, run(TODAY, 13))).toBe(1);
    expect(matchScore(long13, run(TODAY, 6))).toBe(0);
    expect(matchScore(long13, run(TODAY, 25))).toBe(0);
  });
});

describe('late recovery of a missed key session', () => {
  it('a missed key session stays recoverable until Wednesday', () => {
    const weeks = matchPlan([], TODAY);
    expect(keyOf(weeks, 3).state).toBe('missed');
    expect(keyOf(weeks, 3).recoverable).toBe(true);
    expect(keyOf(matchPlan([], '2026-11-26'), 3).recoverable).toBe(false);
  });
  it('13 km on Monday recover last week’s 13 km long run, this week’s stays to do', () => {
    const weeks = matchPlan([run(TODAY, 13)], TODAY);
    expect(keyOf(weeks, 3).state).toBe('done');
    expect(keyOf(weeks, 3).match.late).toBe(true);
    expect(keyOf(weeks, 4).state).toBe('todo');
    expect(weeks.find((w) => w.week === 4).extra).toHaveLength(0);
  });
  it('a later 14 km still counts for this week', () => {
    const weeks = matchPlan([run(TODAY, 13), run('2026-11-28', 14)], '2026-11-29');
    expect(keyOf(weeks, 3).state).toBe('done');
    expect(keyOf(weeks, 4).state).toBe('done');
  });
  it('a short easy run does not recover a long run', () => {
    const weeks = matchPlan([run(TODAY, 6)], TODAY);
    expect(keyOf(weeks, 3).state).toBe('missed');
    expect(weeks.find((w) => w.week === 4).extra).toHaveLength(1);
  });
  it('after Wednesday a run goes to the current week', () => {
    const weeks = matchPlan([run('2026-11-26', 13)], '2026-11-26');
    expect(keyOf(weeks, 3).state).toBe('missed');
    expect(keyOf(weeks, 4).state).not.toBe('todo');
  });
});
