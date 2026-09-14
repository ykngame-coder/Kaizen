import * as HealthKit from '@kingstinct/react-native-healthkit';
import type { QuantityTypeIdentifier } from '@kingstinct/react-native-healthkit';
import {
  normalizeHealthKitSamples,
  aggregateHealthKitSleep,
  aggregateHealthKitSleepSessions,
  normalizeHealthKitWorkout,
  summarizeHeartRate,
  SET_DURATION_ESTIMATE_SEC,
  type HKQuantitySample,
  type HKSleepSample,
  type HKWorkout,
  type HeartRateSummary,
  type ImportedActivity,
  type ImportedHealthMetric,
} from '@supotsu/connectors';
import { syncWindow, trimToWindow } from './syncWindow';
import type { ChangeSet, FullRead, HealthSource, HealthTypeKey, PointMetricKey } from './healthSource';
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

const QUANTITY_TYPES: { id: PointMetricKey & QuantityTypeIdentifier; unit: string }[] = [
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
// Read on demand for a specific session's time window (queryHeartRateSummary)
// — never added to QUANTITY_TYPES, which does a bulk 3-year sweep on every
// sync; heart-rate sample volume over 3 years would be enormous.
const HEART_RATE_TYPE = 'HKQuantityTypeIdentifierHeartRate' as const;
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

/**
 * One dialog covers both directions: the same "Autoriser & synchroniser" tap
 * that grants read access also grants write access for the types below, so
 * activities/meals/water logged in-app can be mirrored back to Apple Health
 * without a second, separate prompt later. Idempotent — no dialog once answered.
 */
async function requestHealthKitAuthorization(): Promise<void> {
  await HealthKit.requestAuthorization({
    toRead: [...QUANTITY_TYPES.map((q) => q.id), STEP_COUNT_TYPE, SLEEP_TYPE, WORKOUT_TYPE, HEART_RATE_TYPE],
    toShare: WRITE_TYPES,
  });
}

type DateFilter = { date: { startDate: Date; endDate?: Date } };

/** Une séance telle que la rend le module natif (ancré ou non). */
type NativeWorkout = Awaited<ReturnType<typeof HealthKit.queryWorkoutSamples>>[number];

const unitOf = (id: PointMetricKey): string => QUANTITY_TYPES.find((q) => q.id === id)?.unit ?? '';

const toSleepSample = (s: { value: unknown; startDate: Date; endDate: Date }): HKSleepSample => ({
  value: Number(s.value),
  startDate: s.startDate.toISOString(),
  endDate: s.endDate.toISOString(),
});

/**
 * Skip workouts Kaizen itself wrote back to Apple Santé (saveWorkoutToHealthKit,
 * saveActivityToHealthKit) — importing them here would re-create the same
 * completed workout/activity as a second, duplicate entry.
 */
const toWorkout = (w: NativeWorkout): HKWorkout | null =>
  w.sourceRevision?.source?.bundleIdentifier === APP_BUNDLE_ID
    ? null
    : {
        uuid: w.uuid,
        workoutActivityType: Number(w.workoutActivityType),
        startDate: w.startDate.toISOString(),
        duration: w.duration?.quantity,
        totalDistance: w.totalDistance?.quantity,
        totalEnergyBurned: w.totalEnergyBurned?.quantity,
      };

async function readQuantitySamples(id: PointMetricKey, filter: DateFilter): Promise<HKQuantitySample[]> {
  const samples = await HealthKit.queryQuantitySamples(id, { unit: unitOf(id), limit: 0, ascending: false, filter });
  return samples.map((s) => ({ quantityType: id, value: s.quantity, unit: s.unit, startDate: s.startDate.toISOString() }));
}

async function readSleepSamples(filter: DateFilter): Promise<HKSleepSample[]> {
  const samples = await HealthKit.queryCategorySamples(SLEEP_TYPE, { limit: 0, ascending: false, filter });
  return samples.map(toSleepSample);
}

async function readWorkouts(filter: DateFilter): Promise<HKWorkout[]> {
  const workouts = await HealthKit.queryWorkoutSamples({ limit: 0, ascending: false, filter });
  return workouts.map(toWorkout).filter((w): w is HKWorkout => w !== null);
}

/**
 * Steps get a dedicated statistics query instead of summing raw samples:
 * the pedometer logs overlapping-window entries from more than one HealthKit
 * source even on an iPhone with no paired Watch, and naively adding every
 * returned sample's value double-counts the overlap (a real TestFlight
 * report: Apple Santé showed 13 700 steps, Kaizen showed 24 632 — almost
 * 2x). cumulativeSum is HealthKit's own merge-aware aggregate — the same one
 * the Health app itself uses — so it reports the correct total.
 *
 * A COLLECTION, one bucket per local day, not a single total for today:
 * querying only today and stamping it `now` froze each past day on whatever
 * total the last sync of that day happened to see, losing every step walked
 * afterwards (Apple Santé 6 647 for 2 sept., Kaizen 5 740). Each day is now
 * stamped at local noon — stable across syncs, safely clear of any midnight
 * or DST boundary — so re-syncing REFRESHES the day instead of adding a row
 * (see insertHealthMetrics, which routes steps through the updating upsert).
 */
async function readStepTotals(filter: DateFilter): Promise<ImportedHealthMetric[]> {
  const anchor = new Date();
  anchor.setHours(0, 0, 0, 0);
  const buckets = await HealthKit.queryStatisticsCollectionForQuantity(
    STEP_COUNT_TYPE,
    ['cumulativeSum'],
    anchor,
    { day: 1 },
    { filter, unit: 'count' },
  );
  const out: ImportedHealthMetric[] = [];
  for (const b of buckets) {
    const total = b.sumQuantity?.quantity;
    if (typeof total !== 'number' || !Number.isFinite(total) || total <= 0) continue;
    // Un seau sans borne de début n'est rattachable à aucun jour : le
    // dater d'aujourd'hui écraserait le total du jour en cours.
    if (!b.startDate) continue;
    const day = new Date(b.startDate);
    out.push({
      type: 'steps',
      value: Math.round(total),
      unit: 'count',
      source: 'apple_health',
      reliability: 'high',
      measuredAt: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12, 0, 0, 0).toISOString(),
    });
  }
  return out;
}

/**
 * Relecture complète : les `LOOKBACK_DAYS` derniers jours, fenêtre alignée sur
 * minuit (voir `syncWindow`). Chaque type est lu indépendamment — un type
 * refusé revient vide, ce qui ne bloque pas les autres et, grâce au garde-fou
 * de `replace`, ne supprime rien.
 */
export async function syncHealthKit(): Promise<FullRead> {
  await requestHealthKitAuthorization();
  const { since, keepFrom } = syncWindow(LOOKBACK_DAYS);
  const filter: DateFilter = { date: { startDate: since } };

  const quantitySamples: HKQuantitySample[] = [];
  for (const q of QUANTITY_TYPES) {
    try {
      quantitySamples.push(...(await readQuantitySamples(q.id, filter)));
    } catch {
      /* metric unavailable / not authorised */
    }
  }
  const stepMetrics = await readStepTotals(filter).catch(() => [] as ImportedHealthMetric[]);
  const sleepSamples = await readSleepSamples(filter).catch(() => [] as HKSleepSample[]);
  const workouts = await readWorkouts(filter).catch(() => [] as HKWorkout[]);

  const healthMetrics = [...normalizeHealthKitSamples(quantitySamples), ...aggregateHealthKitSleep(sleepSamples), ...stepMetrics];
  const sleepSessions = aggregateHealthKitSleepSessions(sleepSamples);
  const activities = workouts.map(normalizeHealthKitWorkout).filter((a): a is ImportedActivity => a !== null);

  return trimToWindow({ activities, healthMetrics, sleepSessions }, keepFrom);
}

/** Taille des pages du repli paginé de `currentAnchor`. */
const ANCHOR_PAGE = 5000;

/** Un filtre qui ne correspond à aucune donnée : tout est daté d'avant dans cent ans. */
const nothingFilter = (): DateFilter => ({ date: { startDate: new Date(Date.now() + 100 * 365 * 24 * 3600 * 1000) } });

async function queryWithAnchor(
  type: HealthTypeKey,
  opts: { anchor?: string; limit: number; filter?: DateFilter },
): Promise<ChangeSet & { count: number }> {
  const base = { limit: opts.limit, ...(opts.anchor ? { anchor: opts.anchor } : {}), ...(opts.filter ? { filter: opts.filter } : {}) };
  if (type === 'workouts') {
    const r = await HealthKit.queryWorkoutSamplesWithAnchor(base);
    return {
      added: { kind: 'workouts', workouts: r.workouts.map(toWorkout).filter((w): w is HKWorkout => w !== null) },
      deletedUuids: r.deletedSamples.map((d) => d.uuid),
      newAnchor: r.newAnchor,
      count: r.workouts.length,
    };
  }
  if (type === 'sleep') {
    const r = await HealthKit.queryCategorySamplesWithAnchor(SLEEP_TYPE, base);
    return {
      added: { kind: 'sleep', samples: r.samples.map(toSleepSample) },
      deletedUuids: r.deletedSamples.map((d) => d.uuid),
      newAnchor: r.newAnchor,
      count: r.samples.length,
    };
  }
  if (type === 'steps') {
    const r = await HealthKit.queryQuantitySamplesWithAnchor(STEP_COUNT_TYPE, { ...base, unit: 'count' });
    return {
      added: { kind: 'steps', intervals: r.samples.map((s) => ({ startDate: s.startDate.toISOString(), endDate: s.endDate.toISOString() })) },
      deletedUuids: r.deletedSamples.map((d) => d.uuid),
      newAnchor: r.newAnchor,
      count: r.samples.length,
    };
  }
  const r = await HealthKit.queryQuantitySamplesWithAnchor(type, { ...base, unit: unitOf(type) });
  return {
    added: { kind: 'quantity', samples: r.samples.map((s) => ({ quantityType: type, value: s.quantity, unit: s.unit, startDate: s.startDate.toISOString() })) },
    deletedUuids: r.deletedSamples.map((d) => d.uuid),
    newAnchor: r.newAnchor,
    count: r.samples.length,
  };
}

/** Apple Santé derrière l'interface qu'utilise l'orchestrateur de synchro. */
export const nativeHealthSource: HealthSource = {
  types: ['workouts', 'sleep', 'steps', ...QUANTITY_TYPES.map((q) => q.id as PointMetricKey)],
  authorize: requestHealthKitAuthorization,
  async currentAnchor(type) {
    // Hypothèse (voir la spec) : une requête ancrée qui ne renvoie rien rend
    // quand même la position courante. Sinon, repli : parcourir l'historique
    // par pages en jetant les échantillons — une fois par installation.
    try {
      const r = await queryWithAnchor(type, { limit: 1, filter: nothingFilter() });
      if (r.newAnchor) return { anchor: r.newAnchor, via: 'empty-query' };
    } catch {
      /* repli ci-dessous */
    }
    let anchor: string | undefined;
    for (;;) {
      const r = await queryWithAnchor(type, { anchor, limit: ANCHOR_PAGE });
      if (r.newAnchor) anchor = r.newAnchor;
      if (r.count < ANCHOR_PAGE) break;
    }
    return anchor ? { anchor, via: 'paged' } : null;
  },
  async changesSince(type, anchor) {
    const { count: _count, ...changes } = await queryWithAnchor(type, { anchor, limit: 0 });
    return changes;
  },
  readSleep: (from, to) => readSleepSamples({ date: { startDate: from, endDate: to } }),
  stepTotals: (from, to) => readStepTotals({ date: { startDate: from, endDate: to } }),
  readQuantity: (type, from, to) => readQuantitySamples(type, { date: { startDate: from, endDate: to } }),
  fullRead: syncHealthKit,
};

/**
 * Best-effort avg/max heart rate for one session's time window. Targeted —
 * called once per completed workout/activity, never part of the bulk sync
 * sweep above.
 */
export async function queryHeartRateSummary(start: Date, end: Date): Promise<HeartRateSummary | null> {
  if (!healthKitAvailable()) return null;
  try {
    const samples = await HealthKit.queryQuantitySamples(HEART_RATE_TYPE, {
      unit: 'count/min',
      limit: 0,
      ascending: true,
      filter: { date: { startDate: start, endDate: end } },
    });
    return summarizeHeartRate(samples.map((s) => ({ value: s.quantity })));
  } catch {
    return null;
  }
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
  const durationSec = setCount * SET_DURATION_ESTIMATE_SEC;
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
