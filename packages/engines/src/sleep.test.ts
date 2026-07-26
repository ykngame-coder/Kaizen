import { describe, expect, it } from 'vitest';
import type { HealthMetric, HealthMetricType } from '@supotsu/core';
import {
  averageSleepHours,
  bedtimeSpreadMinutes,
  computeSleepScore,
  computeSleepScore2,
  sleepBand,
  sleepCoaching,
  sleepDebtHours,
  sleepTrend,
} from './sleep';

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

/** Generic metric at an explicit ISO timestamp (for regularity / components). */
function metricAt(
  type: HealthMetricType,
  value: number,
  measuredAt: string,
  id = `${type}-${measuredAt}`,
): HealthMetric {
  return {
    id,
    userId: 'u1',
    type,
    value,
    unit: 'x',
    source: 'garmin',
    measuredAt,
    createdAt: measuredAt,
    updatedAt: measuredAt,
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

describe('bedtimeSpreadMinutes', () => {
  it('is undefined below the minimum number of nights', () => {
    expect(bedtimeSpreadMinutes([sleep(8, 0), sleep(8, 1)], ASOF, 7)).toBeUndefined();
  });

  it('is near zero for identical bedtimes and larger when they vary', () => {
    const regular = [
      metricAt('sleep_duration', 8, '2026-07-19T22:00:00.000Z'),
      metricAt('sleep_duration', 8, '2026-07-18T22:00:00.000Z'),
      metricAt('sleep_duration', 8, '2026-07-17T22:00:00.000Z'),
    ];
    const irregular = [
      metricAt('sleep_duration', 8, '2026-07-19T20:00:00.000Z'),
      metricAt('sleep_duration', 8, '2026-07-18T23:30:00.000Z'),
      metricAt('sleep_duration', 8, '2026-07-17T21:00:00.000Z'),
    ];
    const rSpread = bedtimeSpreadMinutes(regular, ASOF, 7) ?? 0;
    const iSpread = bedtimeSpreadMinutes(irregular, ASOF, 7) ?? 0;
    expect(rSpread).toBeLessThan(5);
    expect(iSpread).toBeGreaterThan(rSpread + 30);
  });

  it('handles the midnight wrap without exploding', () => {
    const acrossMidnight = [
      metricAt('sleep_duration', 8, '2026-07-19T23:50:00.000Z'),
      metricAt('sleep_duration', 8, '2026-07-18T00:10:00.000Z'),
      metricAt('sleep_duration', 8, '2026-07-17T00:00:00.000Z'),
    ];
    // 23:50 and 00:10 are 20 min apart on the clock, not ~23h.
    expect(bedtimeSpreadMinutes(acrossMidnight, ASOF, 7) ?? 0).toBeLessThan(60);
  });
});

describe('sleepDebtHours', () => {
  it('sums nightly shortfalls below the target over logged nights', () => {
    const { debt, nights } = sleepDebtHours([sleep(8, 0), sleep(6, 1), sleep(7, 2)], ASOF, 7);
    expect(nights).toBe(3);
    expect(debt).toBeCloseTo(3); // 0 + 2 + 1
  });
});

describe('computeSleepScore2', () => {
  it('is to_confirm with no data and lists all five components as null', () => {
    const s = computeSleepScore2([], ASOF);
    expect(s.confidence).toBe('to_confirm');
    expect(s.value).toBe(0);
    expect(s.components).toHaveLength(5);
    expect(s.components.every((c) => c.value === null)).toBe(true);
  });

  it('scores from a single night without inventing other components', () => {
    const s = computeSleepScore2([sleep(8, 0)], ASOF);
    const quantity = s.components.find((c) => c.key === 'quantity');
    expect(quantity?.value).toBeGreaterThanOrEqual(95);
    // Only quantity is backed by data.
    expect(s.components.filter((c) => c.value !== null)).toHaveLength(1);
    expect(s.confidence).toBe('to_confirm');
    expect(s.value).toBe(quantity?.value);
  });

  it('does not surface recovery from sleep alone (needs a physio signal)', () => {
    const s = computeSleepScore2([sleep(7.5, 0)], ASOF);
    expect(s.components.find((c) => c.key === 'recovery')?.value).toBeNull();
  });

  it('reaches high confidence with duration, quality, regularity and a physio signal', () => {
    const metrics: HealthMetric[] = [
      metricAt('sleep_duration', 7.5, '2026-07-19T22:00:00.000Z'),
      metricAt('sleep_duration', 7.0, '2026-07-18T22:00:00.000Z'),
      metricAt('sleep_duration', 8.0, '2026-07-17T22:00:00.000Z'),
      metricAt('sleep_efficiency', 88, '2026-07-19T22:00:00.000Z'),
      metricAt('stress', 30, '2026-07-19T23:00:00.000Z'),
      metricAt('hrv', 60, '2026-07-19T23:00:00.000Z'),
    ];
    const s = computeSleepScore2(metrics, ASOF);
    expect(s.confidence).toBe('high');
    expect(s.components.every((c) => c.value !== null)).toBe(true);
    expect(s.value).toBeGreaterThan(0);
    expect(s.value).toBeLessThanOrEqual(100);
  });
});

describe('sleepCoaching', () => {
  it('is undefined without enough data', () => {
    expect(sleepCoaching([], ASOF)).toBeUndefined();
  });

  it('names a weak factor as a correlation and gives an action on short nights', () => {
    const metrics: HealthMetric[] = [
      metricAt('sleep_duration', 5, '2026-07-19T22:00:00.000Z'),
      metricAt('sleep_duration', 5, '2026-07-18T22:00:00.000Z'),
      metricAt('sleep_duration', 5, '2026-07-17T22:00:00.000Z'),
      metricAt('sleep_efficiency', 55, '2026-07-19T22:00:00.000Z'),
    ];
    const coaching = sleepCoaching(metrics, ASOF);
    expect(coaching).toBeDefined();
    expect(coaching?.observation).toContain('/100');
    expect(coaching?.analysis).toContain('corrélation');
    expect(coaching?.action.length).toBeGreaterThan(0);
  });
});
