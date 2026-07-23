import { describe, expect, it } from 'vitest';
import type { Goal } from '@supotsu/core';
import { computeGoalProgress, projectTargetDate, summarizeTrend, trendSlopePerDay } from './progression';

const DAY = 86_400_000;
const ASOF = '2026-07-20T00:00:00.000Z';
const START = new Date('2026-07-01T00:00:00.000Z').getTime();
const dayN = (n: number): string => new Date(START + n * DAY).toISOString();

const series = (vals: number[]): { date: string; value: number }[] =>
  vals.map((v, i) => ({ date: dayN(i), value: v }));

describe('summarizeTrend', () => {
  it('computes change and direction', () => {
    const s = summarizeTrend(series([100, 101, 99, 96]))!;
    expect(s.first).toBe(100);
    expect(s.last).toBe(96);
    expect(s.direction).toBe('down');
    expect(s.min).toBe(96);
  });
  it('returns undefined for empty input', () => {
    expect(summarizeTrend([])).toBeUndefined();
  });
});

describe('trendSlopePerDay', () => {
  it('is negative for a declining series', () => {
    const slope = trendSlopePerDay(series([100, 99, 98, 97]))!;
    expect(slope).toBeCloseTo(-1, 1);
  });
});

describe('computeGoalProgress', () => {
  const base: Goal = {
    id: 'g', userId: 'u', type: 'body_composition', title: 'Perdre du poids',
    priority: 'primary', status: 'active', progress: 0,
    createdAt: ASOF, updatedAt: ASOF,
  };
  it('reads current vs target from a start', () => {
    // start 100, target 90, current 95 → 50%
    const g = { ...base, targetValue: 90, currentValue: 95 };
    expect(computeGoalProgress(g, 100)).toBeCloseTo(0.5);
  });
  it('falls back to stored progress without values', () => {
    expect(computeGoalProgress({ ...base, progress: 0.4 })).toBe(0.4);
  });
});

describe('projectTargetDate', () => {
  it('projects a reachable target when trending toward it', () => {
    const eta = projectTargetDate(series([100, 99, 98, 97]), 94, ASOF);
    expect(eta).toBeDefined();
  });
  it('returns undefined when heading away from target', () => {
    expect(projectTargetDate(series([100, 101, 102]), 90, ASOF)).toBeUndefined();
  });
});
