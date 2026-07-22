import { describe, expect, it } from 'vitest';
import {
  mapGarminActivityType,
  normalizeGarminActivity,
  normalizeGarminDaily,
  normalizeGarminPush,
  normalizeGarminSleep,
} from './garmin';

// 2026-07-20T06:00:00Z in epoch seconds.
const T = 1784700000;

describe('mapGarminActivityType', () => {
  it('maps known Garmin types to Supotsu types', () => {
    expect(mapGarminActivityType('RUNNING')).toBe('running');
    expect(mapGarminActivityType('LAP_SWIMMING')).toBe('swimming');
    expect(mapGarminActivityType('STRENGTH_TRAINING')).toBe('strength');
  });
  it('is case-insensitive and defaults to other', () => {
    expect(mapGarminActivityType('cycling')).toBe('cycling');
    expect(mapGarminActivityType('KAYAKING')).toBe('other');
    expect(mapGarminActivityType(undefined)).toBe('other');
  });
});

describe('normalizeGarminActivity', () => {
  it('converts a running summary with correct units', () => {
    const a = normalizeGarminActivity({
      summaryId: 'g-123',
      activityType: 'RUNNING',
      startTimeInSeconds: T,
      durationInSeconds: 1830,
      distanceInMeters: 6543.2,
      activeKilocalories: 421,
      averageHeartRateInBeatsPerMinute: 152,
    });
    expect(a).toMatchObject({
      externalId: 'g-123',
      type: 'running',
      source: 'garmin',
      durationSec: 1830,
      distanceM: 6543,
      calories: 421,
      avgHeartRate: 152,
    });
    expect(a?.startedAt).toBe(new Date(T * 1000).toISOString());
  });

  it('returns null when time or duration is missing', () => {
    expect(normalizeGarminActivity({ activityType: 'RUNNING', durationInSeconds: 600 })).toBeNull();
    expect(normalizeGarminActivity({ activityType: 'RUNNING', startTimeInSeconds: T })).toBeNull();
  });
});

describe('normalizeGarminDaily', () => {
  it('extracts resting HR and stress, ignoring unmeasured stress', () => {
    const ok = normalizeGarminDaily({
      startTimeInSeconds: T,
      restingHeartRateInBeatsPerMinute: 48,
      averageStressLevel: 30,
    });
    expect(ok.map((m) => m.type).sort()).toEqual(['resting_heart_rate', 'stress']);

    const noStress = normalizeGarminDaily({
      startTimeInSeconds: T,
      restingHeartRateInBeatsPerMinute: 48,
      averageStressLevel: -1, // Garmin "not measured"
    });
    expect(noStress.map((m) => m.type)).toEqual(['resting_heart_rate']);
  });
});

describe('normalizeGarminSleep', () => {
  it('converts sleep seconds to hours', () => {
    const [sleep] = normalizeGarminSleep({ startTimeInSeconds: T, durationInSeconds: 27000 });
    expect(sleep?.type).toBe('sleep_duration');
    expect(sleep?.value).toBe(7.5);
    expect(sleep?.unit).toBe('h');
  });
});

describe('normalizeGarminPush', () => {
  it('normalizes a mixed push payload into one result', () => {
    const result = normalizeGarminPush({
      activities: [
        { summaryId: 'a1', activityType: 'CYCLING', startTimeInSeconds: T, durationInSeconds: 3600 },
      ],
      dailies: [{ startTimeInSeconds: T, restingHeartRateInBeatsPerMinute: 50 }],
      hrv: [{ startTimeInSeconds: T, lastNightAvg: 61 }],
      bodyComps: [{ startTimeInSeconds: T, weightInGrams: 74300, bodyFatInPercent: 16.2 }],
    });
    expect(result.activities).toHaveLength(1);
    expect(result.activities[0]?.type).toBe('cycling');
    const types = result.healthMetrics.map((m) => m.type).sort();
    expect(types).toEqual(['body_fat', 'hrv', 'resting_heart_rate', 'weight']);
    const weight = result.healthMetrics.find((m) => m.type === 'weight');
    expect(weight?.value).toBe(74.3);
    // Every normalized datum keeps Garmin provenance.
    for (const m of result.healthMetrics) expect(m.source).toBe('garmin');
  });

  it('yields empty arrays for an empty payload', () => {
    expect(normalizeGarminPush({})).toEqual({ activities: [], healthMetrics: [] });
  });
});
