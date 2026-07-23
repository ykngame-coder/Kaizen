import { describe, expect, it } from 'vitest';
import type { Activity, HealthMetric } from '@supotsu/core';
import { dataQualityScore, freshness, metricProvenance, sourceReliability, validateActivity } from './dataquality';

const ASOF = '2026-07-28T12:00:00.000Z';
const DAY = 86_400_000;
const daysAgo = (n: number): string => new Date(new Date(ASOF).getTime() - n * DAY).toISOString();

describe('sourceReliability', () => {
  it('ranks sensors above manual', () => {
    expect(sourceReliability('garmin')).toBe('high');
    expect(sourceReliability('manual')).toBe('low');
    expect(sourceReliability('supotsu')).toBe('medium');
  });
});

describe('freshness', () => {
  it('buckets by age', () => {
    expect(freshness(daysAgo(0), ASOF).level).toBe('à jour');
    expect(freshness(daysAgo(4), ASOF).level).toBe('récent');
    expect(freshness(daysAgo(15), ASOF).level).toBe('ancien');
    expect(freshness(daysAgo(60), ASOF).level).toBe('obsolète');
  });
});

describe('metricProvenance', () => {
  it('keeps the latest per type with inferred reliability', () => {
    const metrics: HealthMetric[] = [
      { id: '1', userId: 'u', type: 'weight', value: 80, unit: 'kg', source: 'manual', measuredAt: daysAgo(3), createdAt: daysAgo(3), updatedAt: daysAgo(3) },
      { id: '2', userId: 'u', type: 'weight', value: 79, unit: 'kg', source: 'withings', measuredAt: daysAgo(1), createdAt: daysAgo(1), updatedAt: daysAgo(1) },
    ];
    const prov = metricProvenance(metrics, ASOF);
    expect(prov).toHaveLength(1);
    expect(prov[0]!.value).toBe(79);
    expect(prov[0]!.reliability).toBe('high');
  });
});

describe('validateActivity', () => {
  const base: Activity = {
    id: 'a', userId: 'u', type: 'running', source: 'garmin', startedAt: daysAgo(0),
    durationSec: 1800, createdAt: daysAgo(0), updatedAt: daysAgo(0),
  };
  it('passes a plausible activity', () => {
    expect(validateActivity({ ...base, avgHeartRate: 150, maxHeartRate: 175 }).valid).toBe(true);
  });
  it('flags an impossible heart rate and inverted max', () => {
    const v = validateActivity({ ...base, avgHeartRate: 260, maxHeartRate: 120 });
    expect(v.valid).toBe(false);
    expect(v.issues.length).toBeGreaterThanOrEqual(1);
  });
  it('flags implausible running speed', () => {
    expect(validateActivity({ ...base, distanceM: 30000, durationSec: 1800 }).valid).toBe(false);
  });
});

describe('dataQualityScore', () => {
  it('is higher for fresh sensor data than stale manual data', () => {
    const fresh = metricProvenance(
      [{ id: '1', userId: 'u', type: 'hrv', value: 60, unit: 'ms', source: 'garmin', measuredAt: daysAgo(0), createdAt: daysAgo(0), updatedAt: daysAgo(0) }],
      ASOF,
    );
    const stale = metricProvenance(
      [{ id: '2', userId: 'u', type: 'weight', value: 80, unit: 'kg', source: 'manual', measuredAt: daysAgo(60), createdAt: daysAgo(60), updatedAt: daysAgo(60) }],
      ASOF,
    );
    expect(dataQualityScore(fresh)).toBeGreaterThan(dataQualityScore(stale));
  });
});
