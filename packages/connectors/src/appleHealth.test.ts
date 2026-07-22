import { describe, expect, it } from 'vitest';
import {
  aggregateHealthKitSleep,
  mapHealthKitWorkoutType,
  normalizeHealthKitSample,
  normalizeHealthKitSamples,
  normalizeHealthKitWorkout,
  normalizeShortcutHealth,
} from './appleHealth';

describe('normalizeHealthKitSample', () => {
  it('maps HRV with Apple Health provenance', () => {
    const m = normalizeHealthKitSample({
      quantityType: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
      value: 61.4,
      startDate: '2026-07-20T05:00:00Z',
    });
    expect(m).toMatchObject({ type: 'hrv', unit: 'ms', source: 'apple_health', reliability: 'high' });
    expect(m?.value).toBe(61.4);
  });

  it('converts a 0-1 body-fat fraction to a percentage', () => {
    const m = normalizeHealthKitSample({
      quantityType: 'HKQuantityTypeIdentifierBodyFatPercentage',
      value: 0.162,
      startDate: '2026-07-20T05:00:00Z',
    });
    expect(m?.type).toBe('body_fat');
    expect(m?.value).toBe(16.2);
  });

  it('drops unmapped quantity types', () => {
    expect(
      normalizeHealthKitSample({ quantityType: 'HKQuantityTypeIdentifierStepCount', value: 8000, startDate: '2026-07-20T05:00:00Z' }),
    ).toBeNull();
  });
});

describe('normalizeHealthKitSamples', () => {
  it('keeps only mapped samples', () => {
    const out = normalizeHealthKitSamples([
      { quantityType: 'HKQuantityTypeIdentifierRestingHeartRate', value: 48, startDate: '2026-07-20T05:00:00Z' },
      { quantityType: 'HKQuantityTypeIdentifierStepCount', value: 8000, startDate: '2026-07-20T05:00:00Z' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.type).toBe('resting_heart_rate');
  });
});

describe('aggregateHealthKitSleep', () => {
  it('sums asleep stages per night and excludes awake time', () => {
    const [night] = aggregateHealthKitSleep([
      { value: 3, startDate: '2026-07-20T23:00:00Z', endDate: '2026-07-21T02:00:00Z' }, // 3h core
      { value: 2, startDate: '2026-07-21T02:00:00Z', endDate: '2026-07-21T02:30:00Z' }, // awake (excluded)
      { value: 5, startDate: '2026-07-21T02:30:00Z', endDate: '2026-07-21T06:30:00Z' }, // 4h REM
    ]);
    expect(night?.type).toBe('sleep_duration');
    expect(night?.value).toBe(7); // 3h + 4h, awake excluded
    expect(night?.source).toBe('apple_health');
  });
});

describe('mapHealthKitWorkoutType', () => {
  it('maps known workout types and defaults to other', () => {
    expect(mapHealthKitWorkoutType(37)).toBe('running');
    expect(mapHealthKitWorkoutType(13)).toBe('cycling');
    expect(mapHealthKitWorkoutType(999)).toBe('other');
    expect(mapHealthKitWorkoutType(undefined)).toBe('other');
  });
});

describe('normalizeHealthKitWorkout', () => {
  it('normalizes a workout with units', () => {
    const a = normalizeHealthKitWorkout({
      uuid: 'abc',
      workoutActivityType: 37,
      startDate: '2026-07-20T06:00:00Z',
      duration: 1800,
      totalDistance: 6500.7,
      totalEnergyBurned: 410.4,
    });
    expect(a).toMatchObject({
      externalId: 'applehealth-abc',
      type: 'running',
      source: 'apple_health',
      durationSec: 1800,
      distanceM: 6501,
      calories: 410,
    });
  });

  it('returns null without start or duration', () => {
    expect(normalizeHealthKitWorkout({ workoutActivityType: 37, duration: 600 })).toBeNull();
  });
});

describe('normalizeShortcutHealth', () => {
  it('maps valid entries with canonical units and Apple Health provenance', () => {
    const out = normalizeShortcutHealth([
      { type: 'hrv', value: 61, date: '2026-07-20T05:00:00Z' },
      { type: 'resting_heart_rate', value: 48, date: '2026-07-20T05:00:00Z' },
      { type: 'sleep_duration', value: 7.5, date: '2026-07-20T06:30:00Z' },
    ]);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ type: 'hrv', unit: 'ms', source: 'apple_health', reliability: 'high' });
    expect(out.find((m) => m.type === 'sleep_duration')?.unit).toBe('h');
  });

  it('drops unknown types, non-numeric values and bad dates', () => {
    const out = normalizeShortcutHealth([
      { type: 'steps', value: 8000, date: '2026-07-20T05:00:00Z' }, // unknown type
      { type: 'hrv', value: Number.NaN, date: '2026-07-20T05:00:00Z' }, // bad value
      { type: 'hrv', value: 60, date: 'not-a-date' }, // bad date
      { type: 'weight', value: 74.3, date: '2026-07-20T07:00:00Z' }, // ok
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.type).toBe('weight');
  });

  it('coerces stringified numeric values', () => {
    const out = normalizeShortcutHealth([
      { type: 'hrv', value: '61.4' as unknown as number, date: '2026-07-20T05:00:00Z' },
    ]);
    expect(out[0]?.value).toBe(61.4);
  });
});
