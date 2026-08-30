import { describe, expect, it } from 'vitest';
import {
  aggregateHealthKitSleep,
  aggregateHealthKitSleepSessions,
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

  it('maps step count', () => {
    const m = normalizeHealthKitSample({ quantityType: 'HKQuantityTypeIdentifierStepCount', value: 8000, startDate: '2026-07-20T05:00:00Z' });
    expect(m).toMatchObject({ type: 'steps', unit: 'count', source: 'apple_health', reliability: 'high' });
    expect(m?.value).toBe(8000);
  });

  it('drops unmapped quantity types', () => {
    expect(
      normalizeHealthKitSample({ quantityType: 'HKQuantityTypeIdentifierActiveEnergyBurned', value: 420, startDate: '2026-07-20T05:00:00Z' }),
    ).toBeNull();
  });
});

describe('normalizeHealthKitSamples', () => {
  it('keeps only mapped samples', () => {
    const out = normalizeHealthKitSamples([
      { quantityType: 'HKQuantityTypeIdentifierRestingHeartRate', value: 48, startDate: '2026-07-20T05:00:00Z' },
      { quantityType: 'HKQuantityTypeIdentifierActiveEnergyBurned', value: 420, startDate: '2026-07-20T05:00:00Z' },
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

describe('aggregateHealthKitSleepSessions', () => {
  it('splits stage minutes per night, awake tracked separately from asleep', () => {
    const [night] = aggregateHealthKitSleepSessions([
      { value: 3, startDate: '2026-07-20T23:00:00Z', endDate: '2026-07-21T02:00:00Z' }, // 3h core (light)
      { value: 2, startDate: '2026-07-21T02:00:00Z', endDate: '2026-07-21T02:30:00Z' }, // 30 min awake
      { value: 5, startDate: '2026-07-21T02:30:00Z', endDate: '2026-07-21T05:00:00Z' }, // 2.5h REM
      { value: 4, startDate: '2026-07-21T05:00:00Z', endDate: '2026-07-21T06:30:00Z' }, // 1.5h deep
    ]);
    expect(night?.source).toBe('apple_health');
    expect(night?.lightMin).toBe(180);
    expect(night?.remMin).toBe(150);
    expect(night?.deepMin).toBe(90);
    expect(night?.awakeMin).toBe(30);
    expect(night?.asleepMin).toBe(180 + 150 + 90);
    // No explicit inBed sample -> falls back to asleep + awake.
    expect(night?.inBedMin).toBe(180 + 150 + 90 + 30);
    expect(night?.startedAt).toBe('2026-07-20T23:00:00.000Z');
    expect(night?.endedAt).toBe('2026-07-21T06:30:00.000Z');
    // Each real sample doubles as a segment — this feeds the hypnogram.
    expect(night?.segments).toEqual([
      { stage: 'light', startedAt: '2026-07-20T23:00:00.000Z', endedAt: '2026-07-21T02:00:00.000Z' },
      { stage: 'awake', startedAt: '2026-07-21T02:00:00.000Z', endedAt: '2026-07-21T02:30:00.000Z' },
      { stage: 'rem', startedAt: '2026-07-21T02:30:00.000Z', endedAt: '2026-07-21T05:00:00.000Z' },
      { stage: 'deep', startedAt: '2026-07-21T05:00:00.000Z', endedAt: '2026-07-21T06:30:00.000Z' },
    ]);
  });

  it('excludes inBed (value 0) samples from segments — not a specific stage', () => {
    const [night] = aggregateHealthKitSleepSessions([
      { value: 0, startDate: '2026-07-20T22:30:00Z', endDate: '2026-07-21T06:30:00Z' },
      { value: 4, startDate: '2026-07-20T23:00:00Z', endDate: '2026-07-21T06:00:00Z' },
    ]);
    expect(night?.segments).toEqual([
      { stage: 'deep', startedAt: '2026-07-20T23:00:00.000Z', endedAt: '2026-07-21T06:00:00.000Z' },
    ]);
  });

  it('folds asleepUnspecified (value 1) into lightMin — sources without stage detail', () => {
    const [night] = aggregateHealthKitSleepSessions([
      { value: 1, startDate: '2026-07-20T23:00:00Z', endDate: '2026-07-21T06:00:00Z' }, // 7h generic asleep
    ]);
    expect(night?.lightMin).toBe(420);
    expect(night?.deepMin).toBe(0);
    expect(night?.remMin).toBe(0);
    expect(night?.asleepMin).toBe(420);
  });

  it('uses an explicit inBed sample instead of the asleep+awake fallback when present', () => {
    const [night] = aggregateHealthKitSleepSessions([
      { value: 0, startDate: '2026-07-20T22:30:00Z', endDate: '2026-07-21T06:30:00Z' }, // 8h in bed
      { value: 4, startDate: '2026-07-20T23:00:00Z', endDate: '2026-07-21T06:00:00Z' }, // 7h deep
    ]);
    expect(night?.inBedMin).toBe(480);
    expect(night?.asleepMin).toBe(420);
  });

  it('drops a night with no actual sleep (only awake/inBed samples)', () => {
    const out = aggregateHealthKitSleepSessions([
      { value: 2, startDate: '2026-07-21T02:00:00Z', endDate: '2026-07-21T02:30:00Z' },
    ]);
    expect(out).toHaveLength(0);
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

  it('returns null for a workout whose duration rounds to 0 (would violate the DB\'s duration_sec > 0 check)', () => {
    expect(normalizeHealthKitWorkout({ startDate: '2026-07-20T06:00:00Z', duration: 0.3 })).toBeNull();
    expect(normalizeHealthKitWorkout({ startDate: '2026-07-20T06:00:00Z', duration: -5 })).toBeNull();
  });

  it('carries HealthKit\'s own activity name in notes when the type falls back to "other"', () => {
    const a = normalizeHealthKitWorkout({
      workoutActivityType: 24, // hiking — not in WORKOUT_MAP
      startDate: '2026-07-20T06:00:00Z',
      duration: 1800,
    });
    expect(a).toMatchObject({ type: 'other', notes: 'Randonnée' });
  });

  it('leaves notes unset for a type that already has a real label', () => {
    const a = normalizeHealthKitWorkout({
      workoutActivityType: 37, // running — already mapped
      startDate: '2026-07-20T06:00:00Z',
      duration: 1800,
    });
    expect(a?.notes).toBeUndefined();
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
