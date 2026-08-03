import * as HealthKit from '@kingstinct/react-native-healthkit';
import type { QuantityTypeIdentifier } from '@kingstinct/react-native-healthkit';
import {
  normalizeHealthKitSamples,
  aggregateHealthKitSleep,
  normalizeHealthKitWorkout,
  type HKQuantitySample,
  type HKSleepSample,
  type HKWorkout,
  type ImportedActivity,
  type ImportedHealthMetric,
} from '@supotsu/connectors';

/**
 * Native HealthKit client (iOS only — requires a dev build, Expo Go doesn't
 * ship HealthKit). Reads recent samples directly from Apple Health and hands
 * them through @supotsu/connectors' tested HealthKit normalizers (the same
 * ones the file-import path uses for a Health Auto Export/Garmin export), so
 * unit handling, HRV, per-night sleep aggregation and workout mapping are
 * identical whichever path the data came in through. Persistence itself goes
 * through `useImportHealth` (same repository call as a file import) since
 * that requires the authenticated repository, which only exists as a hook.
 */

const QUANTITY_TYPES: { id: QuantityTypeIdentifier; unit: string }[] = [
  { id: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN', unit: 'ms' },
  { id: 'HKQuantityTypeIdentifierRestingHeartRate', unit: 'count/min' },
  { id: 'HKQuantityTypeIdentifierBodyMass', unit: 'kg' },
  { id: 'HKQuantityTypeIdentifierBodyFatPercentage', unit: '%' },
  { id: 'HKQuantityTypeIdentifierLeanBodyMass', unit: 'kg' },
];
const SLEEP_TYPE = 'HKCategoryTypeIdentifierSleepAnalysis' as const;
const WORKOUT_TYPE = 'HKWorkoutTypeIdentifier' as const;

/** How far back to read on each sync — enough to backfill a fresh install without a slow first sync. */
const LOOKBACK_DAYS = 120;

export function healthKitAvailable(): boolean {
  try {
    return HealthKit.isHealthDataAvailable();
  } catch {
    return false;
  }
}

/** Request read authorization, then pull + normalize recent Health data. No persistence here — the caller persists via `useImportHealth`. */
export async function syncHealthKit(): Promise<{
  activities: ImportedActivity[];
  healthMetrics: ImportedHealthMetric[];
}> {
  await HealthKit.requestAuthorization({
    toRead: [...QUANTITY_TYPES.map((q) => q.id), SLEEP_TYPE, WORKOUT_TYPE],
  });

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const dateFilter = { date: { startDate: since } };

  const quantitySamples: HKQuantitySample[] = [];
  for (const q of QUANTITY_TYPES) {
    try {
      const samples = await HealthKit.queryQuantitySamples(q.id, {
        unit: q.unit,
        limit: 0,
        ascending: false,
        filter: dateFilter,
      });
      for (const s of samples) {
        quantitySamples.push({
          quantityType: q.id,
          value: s.quantity,
          unit: s.unit,
          startDate: s.startDate.toISOString(),
        });
      }
    } catch {
      /* metric unavailable / not authorised */
    }
  }

  const sleepSamples: HKSleepSample[] = [];
  try {
    const samples = await HealthKit.queryCategorySamples(SLEEP_TYPE, {
      limit: 0,
      ascending: false,
      filter: dateFilter,
    });
    for (const s of samples) {
      sleepSamples.push({
        value: Number(s.value),
        startDate: s.startDate.toISOString(),
        endDate: s.endDate.toISOString(),
      });
    }
  } catch {
    /* sleep unavailable */
  }

  const workoutSamples: HKWorkout[] = [];
  try {
    const workouts = await HealthKit.queryWorkoutSamples({
      limit: 0,
      ascending: false,
      filter: dateFilter,
    });
    for (const w of workouts) {
      workoutSamples.push({
        uuid: w.uuid,
        workoutActivityType: Number(w.workoutActivityType),
        startDate: w.startDate.toISOString(),
        duration: w.duration?.quantity,
        totalDistance: w.totalDistance?.quantity,
        totalEnergyBurned: w.totalEnergyBurned?.quantity,
      });
    }
  } catch {
    /* workouts unavailable */
  }

  const healthMetrics = [
    ...normalizeHealthKitSamples(quantitySamples),
    ...aggregateHealthKitSleep(sleepSamples),
  ];
  const activities: ImportedActivity[] = [];
  for (const w of workoutSamples) {
    const a = normalizeHealthKitWorkout(w);
    if (a) activities.push(a);
  }

  return { activities, healthMetrics };
}
