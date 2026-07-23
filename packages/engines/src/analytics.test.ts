import { describe, expect, it } from 'vitest';
import { alignedPairs, correlate, dailyMeans, dailySums, pearson } from './analytics';

const ASOF = '2026-07-20T12:00:00.000Z';
const DAY = 86_400_000;
const daysAgo = (n: number): string => new Date(new Date(ASOF).getTime() - n * DAY).toISOString();

describe('dailyMeans / dailySums', () => {
  it('buckets by day with today last and nulls for gaps', () => {
    const pts = [
      { date: daysAgo(0), value: 8 },
      { date: daysAgo(0), value: 6 },
      { date: daysAgo(2), value: 7 },
    ];
    const means = dailyMeans(pts, ASOF, 3);
    expect(means).toEqual([7, null, 7]); // day-2 avg 7, day-1 none, today avg (8+6)/2
    const sums = dailySums(pts, ASOF, 3);
    expect(sums).toEqual([7, 0, 14]);
  });
});

describe('pearson', () => {
  it('is ~1 for a perfectly increasing relation', () => {
    const r = pearson([
      [1, 2],
      [2, 4],
      [3, 6],
      [4, 8],
    ])!;
    expect(r).toBeCloseTo(1, 5);
  });
  it('is undefined with fewer than 3 pairs', () => {
    expect(pearson([[1, 1], [2, 2]])).toBeUndefined();
  });
});

describe('alignedPairs / correlate', () => {
  it('pairs only days where both series have values', () => {
    const a = [1, null, 3, 4];
    const b = [2, 2, null, 8];
    expect(alignedPairs(a, b)).toEqual([[1, 2], [4, 8]]);
  });
  it('summarises a positive correlation', () => {
    const a = [1, 2, 3, 4, 5];
    const b = [2, 4, 5, 8, 10];
    const insight = correlate(a, b)!;
    expect(insight.direction).toBe('positive');
    expect(insight.strength).toBe('forte');
  });
});
