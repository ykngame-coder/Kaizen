import { describe, expect, it } from 'vitest';
import type { Activity } from '@supotsu/core';
import { acwrZone, computeAcwr, dailyLoadSeries, sessionLoad } from './load';

const ASOF = '2026-07-28T12:00:00.000Z';
const DAY = 86_400_000;
const daysAgo = (n: number): string => new Date(new Date(ASOF).getTime() - n * DAY).toISOString();

function act(durationMin: number, intensity: Activity['intensity'], ago: number): Activity {
  return {
    id: `a${ago}-${durationMin}`,
    userId: 'u1',
    type: 'running',
    source: 'garmin',
    startedAt: daysAgo(ago),
    durationSec: durationMin * 60,
    intensity,
    createdAt: daysAgo(ago),
    updatedAt: daysAgo(ago),
  };
}

describe('sessionLoad', () => {
  it('is minutes × intensity factor and defaults to moderate', () => {
    expect(sessionLoad(act(60, 'high', 0))).toBe(180);
    expect(sessionLoad(act(30, undefined, 0))).toBe(60);
  });
});

describe('dailyLoadSeries', () => {
  it('places load in the right day bucket (today last)', () => {
    const series = dailyLoadSeries([act(60, 'moderate', 0), act(30, 'moderate', 2)], ASOF, 3);
    expect(series).toEqual([60, 0, 120]);
  });
});

describe('computeAcwr', () => {
  it('is ~1 for steady daily training', () => {
    const acts: Activity[] = [];
    for (let d = 0; d < 28; d += 1) acts.push(act(60, 'moderate', d));
    const res = computeAcwr(acts, ASOF);
    expect(res.ratio).toBeCloseTo(1, 1);
    expect(res.zone).toBe('optimal');
    expect(res.confidence).toBe('high');
  });

  it('flags a spike as risky', () => {
    const acts: Activity[] = [];
    // light base weeks, then a heavy last 7 days
    for (let d = 7; d < 28; d += 1) acts.push(act(20, 'low', d));
    for (let d = 0; d < 7; d += 1) acts.push(act(120, 'high', d));
    const res = computeAcwr(acts, ASOF);
    expect(res.ratio!).toBeGreaterThan(1.5);
    expect(res.zone).toBe('risque');
  });

  it('has no ratio without a chronic baseline', () => {
    expect(computeAcwr([act(60, 'moderate', 0)], ASOF).ratio).not.toBeNull();
    expect(computeAcwr([], ASOF).ratio).toBeNull();
  });
});

describe('acwrZone', () => {
  it('maps ratios to zones', () => {
    expect(acwrZone(0.6)).toBe('sous-charge');
    expect(acwrZone(1.0)).toBe('optimal');
    expect(acwrZone(1.4)).toBe('élevé');
    expect(acwrZone(1.8)).toBe('risque');
  });
});
