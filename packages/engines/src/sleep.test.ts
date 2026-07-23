import { describe, expect, it } from 'vitest';
import type { HealthMetric } from '@supotsu/core';
import { averageSleepHours, computeSleepScore, sleepBand, sleepTrend } from './sleep';

const ASOF = '2026-07-20T09:00:00.000Z';
const DAY = 86_400_000;
const nightsAgo = (n: number): string => new Date(new Date(ASOF).getTime() - n * DAY).toISOString();

function sleep(hours: number, ago: number): HealthMetric {
  return {
    id: `s${ago}`,
    userId: 'u1',
    type: 'sleep_duration',
    value: hours,
    unit: 'h',
    source: 'garmin',
    measuredAt: nightsAgo(ago),
    createdAt: nightsAgo(ago),
    updatedAt: nightsAgo(ago),
  };
}

describe('computeSleepScore', () => {
  it('is to_confirm with no data', () => {
    expect(computeSleepScore([], ASOF).confidence).toBe('to_confirm');
  });

  it('scores a full night high and a short night low', () => {
    expect(computeSleepScore([sleep(8, 0)], ASOF).value).toBeGreaterThanOrEqual(95);
    expect(computeSleepScore([sleep(5, 0)], ASOF).value).toBeLessThan(40);
  });

  it('gains confidence when efficiency is present', () => {
    const metrics: HealthMetric[] = [
      sleep(7.5, 0),
      { id: 'e', userId: 'u1', type: 'sleep_efficiency', value: 90, unit: '%', source: 'garmin', measuredAt: nightsAgo(0), createdAt: nightsAgo(0), updatedAt: nightsAgo(0) },
    ];
    expect(computeSleepScore(metrics, ASOF).confidence).toBe('high');
  });
});

describe('sleepTrend / averageSleepHours', () => {
  it('lists nights most-recent first and averages them', () => {
    const metrics = [sleep(8, 0), sleep(6, 1), sleep(7, 2)];
    const trend = sleepTrend(metrics, ASOF, 7);
    expect(trend.map((n) => n.hours)).toEqual([8, 6, 7]);
    expect(averageSleepHours(metrics, ASOF, 7)).toBeCloseTo(7);
  });
});

describe('sleepBand', () => {
  it('maps scores to bands', () => {
    expect(sleepBand(90)).toBe('excellent');
    expect(sleepBand(30)).toBe('faible');
  });
});
