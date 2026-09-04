import * as HealthKit from '@kingstinct/react-native-healthkit';
import type { QuantityTypeIdentifier } from '@kingstinct/react-native-healthkit';
import {
  normalizeHealthKitSamples,
  aggregateHealthKitSleep,
  aggregateHealthKitSleepSessions,
  normalizeHealthKitWorkout,
  type HKQuantitySample,
  type HKSleepSample,
  type HKWorkout,
  type ImportedActivity,
  type ImportedHealthMetric,
  type ImportedSleepSession,
} from '@supotsu/connectors';
import type { ActivityType } from '@supotsu/core';
import type { ActivityInput, NutritionEntryInput } from '@supotsu/shared';

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
// Steps get their own query — see syncHealthKit below.
const STEP_COUNT_TYPE = 'HKQuantityTypeIdentifierStepCount' as const;
const SLEEP_TYPE = 'HKCategoryTypeIdentifierSleepAnalysis' as const;
const WORKOUT_TYPE = 'HKWorkoutTypeIdentifier' as const;
// Matches ios.bundleIdentifier in app.json — used to recognize (and skip
// re-importing) workouts this app wrote back to Apple Santé itself.
const APP_BUNDLE_ID = 'com.supotsu.app';

/**
 * How far back to read on each sync. 3 years — HealthKit itself has no real
 * history limit (as far back as the Watch/Health app has data), so this is a
 * free, native alternative to Health Auto Export's paid-after-trial export
 * for historical backfill. The first sync on a large history can take a
 * while (thousands of samples); subsequent syncs re-read the same window but
 * `persistImport` dedupes, so nothing new is added twice.
 */
const LOOKBACK_DAYS = 365 * 3;

export function healthKitAvailable(): boolean {
  try {
    return HealthKit.isHealthDataAvailable();
  } catch {
    return false;
  }
}

const BACKGROUND_TYPES: (QuantityTypeIdentifier | typeof SLEEP_TYPE | typeof WORKOUT_TYPE)[] = [
  ...QUANTITY_TYPES.map((q) => q.id),
  STEP_COUNT_TYPE,
  SLEEP_TYPE,
  WORKOUT_TYPE,
];

/**
 * Registers HealthKit background delivery + change observers for the same
 * types `syncHealthKit` reads, so `onChange` fires — while the app is alive,
 * foreground or backgrounded, not only when the user opens it — whenever
 * Apple Health receives new data. Requires the
 * `com.apple.developer.healthkit.background-delivery` entitlement (the
 * @kingstinct/react-native-healthkit config plugin adds it unless
 * `background: false` is set in app.json). iOS treats `updateFrequency` as a
 * hint, not a guaranteed schedule — `hourly` balances promptness against
 * battery/network use. Returns an unsubscribe function.
 */
export function subscribeHealthKitChanges(onChange: () => void): () => void {
  const subscriptions: { remove: () => void }[] = [];
  for (const type of BACKGROUND_TYPES) {
    void HealthKit.enableBackgroundDelivery(type, HealthKit.UpdateFrequency.hourly).catch(() => undefined);
    try {
      subscriptions.push(HealthKit.subscribeToChanges(type, onChange));
    } catch {
      /* type not observable / not authorised yet */
    }
  }
  return () => subscriptions.forEach((s) => s.remove());
}

/**
 * Dietary/activity types we write back to Apple Health — the flip side of
 * `QUANTITY_TYPES`. Kept separate because reads and writes use different
 * HealthKit categories (dietary quantities aren't in `QUANTITY_TYPES`, which
 * is only what `syncHealthKit` reads).
 */
const WRITE_TYPES: HealthKit.SampleTypeIdentifierWriteable[] = [
  'HKQuantityTypeIdentifierDietaryEnergyConsumed',
  'HKQuantityTypeIdentifierDietaryProtein',
  'HKQuantityTypeIdentifierDietaryCarbohydrates',
  'HKQuantityTypeIdentifierDietaryFatTotal',
  'HKQuantityTypeIdentifierDietaryWater',
  WORKOUT_TYPE,
];

/** Request read authorization, then pull + normalize recent Health data. No persistence here — the caller persists via `useImportHealth`. */
export async function syncHealthKit(): Promise<{
  activities: ImportedActivity[];
  healthMetrics: ImportedHealthMetric[];
  sleepSessions: ImportedSleepSession[];
}> {
  // One dialog covers both directions: the same "Autoriser & synchroniser"
  // tap that grants read access also grants write access for the types
  // below, so activities/meals/water logged in-app can be mirrored back to
  // Apple Health without a second, separate prompt later.
  await HealthKit.requestAuthorization({
    toRead: [...QUANTITY_TYPES.map((q) => q.id), STEP_COUNT_TYPE, SLEEP_TYPE, WORKOUT_TYPE],
    toShare: WRITE_TYPES,
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

  // Steps get a dedicated cumulative-sum query instead of summing raw
  // samples: the pedometer logs overlapping-window entries from more than
  // one HealthKit source even on an iPhone with no paired Watch, and naively
  // adding every returned sample's value double-counts the overlap (a real
  // TestFlight report: Apple Santé showed 13 700 steps, Kaizen showed
  // 24 632 — almost 2x). cumulativeSum is HealthKit's own merge-aware
  // aggregate — the same one the Health app itself uses — so it reports the
  // correct total. Scoped to just today since that's the only thing the
  // Dashboard tile shows; measuredAt is "now", not midnight, so a second
  // sync later today lands as its own row rather than being silently
  // dropped by the dedupe-on-(user,type,measured_at,source) upsert.
  const stepMetrics: ImportedHealthMetric[] = [];
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const stats = await HealthKit.queryStatisticsForQuantity(STEP_COUNT_TYPE, ['cumulativeSum'], {
      filter: { date: { startDate: startOfToday } },
      unit: 'count',
    });
    const total = stats.sumQuantity?.quantity;
    if (typeof total === 'number' && Number.isFinite(total) && total > 0) {
      stepMetrics.push({
        type: 'steps',
        value: Math.round(total),
        unit: 'count',
        source: 'apple_health',
        reliability: 'high',
        measuredAt: new Date().toISOString(),
      });
    }
  } catch {
    /* steps unavailable */
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
      // Skip workouts Kaizen itself wrote back to Apple Santé (saveWorkoutToHealthKit,
      // saveActivityToHealthKit) — importing them here would re-create the same
      // completed workout/activity as a second, duplicate entry.
      if (w.sourceRevision?.source?.bundleIdentifier === APP_BUNDLE_ID) continue;
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
    ...stepMetrics,
  ];
  const sleepSessions = aggregateHealthKitSleepSessions(sleepSamples);
  const activities: ImportedActivity[] = [];
  for (const w of workoutSamples) {
    const a = normalizeHealthKitWorkout(w);
    if (a) activities.push(a);
  }

  return { activities, healthMetrics, sleepSessions };
}

/** Kaizen `ActivityType` → HealthKit's own workout-type enum, for writes. */
const ACTIVITY_TYPE_TO_HK: Record<ActivityType, HealthKit.WorkoutActivityType> = {
  walking: HealthKit.WorkoutActivityType.walking,
  running: HealthKit.WorkoutActivityType.running,
  cycling: HealthKit.WorkoutActivityType.cycling,
  swimming: HealthKit.WorkoutActivityType.swimming,
  strength: HealthKit.WorkoutActivityType.traditionalStrengthTraining,
  cross_training: HealthKit.WorkoutActivityType.crossTraining,
  hyrox: HealthKit.WorkoutActivityType.highIntensityIntervalTraining,
  mobility: HealthKit.WorkoutActivityType.flexibility,
  yoga: HealthKit.WorkoutActivityType.yoga,
  other: HealthKit.WorkoutActivityType.other,
};

/** Mirror a manually-logged activity into Apple Health as a workout. Best-effort — errors (not authorised, etc.) are swallowed by the caller. */
export async function saveActivityToHealthKit(input: ActivityInput): Promise<void> {
  const start = new Date(input.startedAt);
  const end = new Date(start.getTime() + input.durationSec * 1000);
  await HealthKit.saveWorkoutSample(
    ACTIVITY_TYPE_TO_HK[input.type],
    [],
    start,
    end,
    {
      distance: input.distanceM,
      energyBurned: input.calories,
    },
  );
}

/**
 * Strength workouts (from the exercise-based logger) don't carry a session
 * duration the way a cardio ActivityInput does — estimate ~90s/set (work +
 * rest), the same ballpark a Watch would auto-detect for a lifting session,
 * rather than write a zero-length workout.
 */
export async function saveWorkoutToHealthKit(setCount: number, at: Date = new Date()): Promise<void> {
  if (setCount <= 0) return;
  const durationSec = setCount * 90;
  const start = new Date(at.getTime() - durationSec * 1000);
  await HealthKit.saveWorkoutSample(HealthKit.WorkoutActivityType.traditionalStrengthTraining, [], start, at);
}

/** Mirror a manually-logged meal/water entry into Apple Health's dietary quantities. Best-effort. */
export async function saveNutritionToHealthKit(input: NutritionEntryInput): Promise<void> {
  const at = new Date(input.loggedAt);
  const writes: Promise<unknown>[] = [];
  if (input.kcal > 0) {
    writes.push(HealthKit.saveQuantitySample('HKQuantityTypeIdentifierDietaryEnergyConsumed', 'kcal', input.kcal, at, at));
  }
  if (input.proteinG) {
    writes.push(HealthKit.saveQuantitySample('HKQuantityTypeIdentifierDietaryProtein', 'g', input.proteinG, at, at));
  }
  if (input.carbG) {
    writes.push(HealthKit.saveQuantitySample('HKQuantityTypeIdentifierDietaryCarbohydrates', 'g', input.carbG, at, at));
  }
  if (input.fatG) {
    writes.push(HealthKit.saveQuantitySample('HKQuantityTypeIdentifierDietaryFatTotal', 'g', input.fatG, at, at));
  }
  if (input.hydrationMl) {
    writes.push(HealthKit.saveQuantitySample('HKQuantityTypeIdentifierDietaryWater', 'ml', input.hydrationMl, at, at));
  }
  await Promise.all(writes);
}
