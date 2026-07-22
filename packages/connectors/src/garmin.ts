import type { ActivityType } from '@supotsu/core';
import type { ImportResult, ImportedActivity, ImportedHealthMetric } from './types';

/**
 * Garmin Health API normalization (Master Prompt P22, P38). Pure functions that
 * turn Garmin's real "summary" payloads into Supotsu's internal model — no I/O,
 * no crypto. This is the *canonical* mapping; the Garmin Edge Function mirrors
 * it server-side (supabase/functions/garmin/). Keep the two in sync.
 *
 * Garmin sends time as UTC epoch **seconds**, distance in **metres**, sleep and
 * activity durations in **seconds**, weight in **grams**. All device-sourced, so
 * reliability is 'high'.
 */

const epochToIso = (seconds: number): string => new Date(seconds * 1000).toISOString();

/** Garmin `activityType` (upper snake case) → Supotsu ActivityType. */
const ACTIVITY_TYPE_MAP: Record<string, ActivityType> = {
  RUNNING: 'running',
  INDOOR_RUNNING: 'running',
  TRAIL_RUNNING: 'running',
  TREADMILL_RUNNING: 'running',
  WALKING: 'walking',
  INDOOR_WALKING: 'walking',
  HIKING: 'walking',
  CYCLING: 'cycling',
  INDOOR_CYCLING: 'cycling',
  MOUNTAIN_BIKING: 'cycling',
  ROAD_BIKING: 'cycling',
  VIRTUAL_RIDE: 'cycling',
  LAP_SWIMMING: 'swimming',
  OPEN_WATER_SWIMMING: 'swimming',
  SWIMMING: 'swimming',
  STRENGTH_TRAINING: 'strength',
  INDOOR_CARDIO: 'cross_training',
  HIIT: 'cross_training',
  FITNESS_EQUIPMENT: 'cross_training',
  MULTI_SPORT: 'cross_training',
  YOGA: 'yoga',
  PILATES: 'yoga',
  BREATHWORK: 'mobility',
  MOBILITY: 'mobility',
};

/** Map a Garmin activity type, defaulting to 'other' for anything unmapped. */
export function mapGarminActivityType(garminType: string | undefined): ActivityType {
  if (!garminType) return 'other';
  return ACTIVITY_TYPE_MAP[garminType.toUpperCase()] ?? 'other';
}

export interface GarminActivitySummary {
  summaryId?: string;
  activityId?: number;
  activityType?: string;
  startTimeInSeconds?: number;
  durationInSeconds?: number;
  distanceInMeters?: number;
  activeKilocalories?: number;
  averageHeartRateInBeatsPerMinute?: number;
}

/** One Garmin activity summary → a normalized activity (or null if unusable). */
export function normalizeGarminActivity(a: GarminActivitySummary): ImportedActivity | null {
  if (a.startTimeInSeconds === undefined || !a.durationInSeconds) return null;
  return {
    externalId: a.summaryId ?? (a.activityId !== undefined ? String(a.activityId) : undefined),
    type: mapGarminActivityType(a.activityType),
    source: 'garmin',
    startedAt: epochToIso(a.startTimeInSeconds),
    durationSec: Math.round(a.durationInSeconds),
    distanceM: a.distanceInMeters !== undefined ? Math.round(a.distanceInMeters) : undefined,
    calories: a.activeKilocalories,
    avgHeartRate: a.averageHeartRateInBeatsPerMinute,
  };
}

export interface GarminDailySummary {
  startTimeInSeconds?: number;
  restingHeartRateInBeatsPerMinute?: number;
  averageStressLevel?: number;
}

/** Garmin daily summary → resting-HR + stress metrics. */
export function normalizeGarminDaily(d: GarminDailySummary): ImportedHealthMetric[] {
  if (d.startTimeInSeconds === undefined) return [];
  const measuredAt = epochToIso(d.startTimeInSeconds);
  const out: ImportedHealthMetric[] = [];
  if (typeof d.restingHeartRateInBeatsPerMinute === 'number') {
    out.push({
      type: 'resting_heart_rate',
      value: d.restingHeartRateInBeatsPerMinute,
      unit: 'bpm',
      source: 'garmin',
      reliability: 'high',
      measuredAt,
    });
  }
  // Garmin reports -1/-2 when stress is not measured; ignore those.
  if (typeof d.averageStressLevel === 'number' && d.averageStressLevel >= 0) {
    out.push({
      type: 'stress',
      value: d.averageStressLevel,
      unit: 'score',
      source: 'garmin',
      reliability: 'high',
      measuredAt,
    });
  }
  return out;
}

export interface GarminSleepSummary {
  startTimeInSeconds?: number;
  durationInSeconds?: number;
  /** 0-100 when present. */
  overallSleepScore?: { value?: number };
}

/** Garmin sleep summary → sleep-duration (hours) + efficiency when present. */
export function normalizeGarminSleep(s: GarminSleepSummary): ImportedHealthMetric[] {
  if (s.startTimeInSeconds === undefined || !s.durationInSeconds) return [];
  const measuredAt = epochToIso(s.startTimeInSeconds);
  const out: ImportedHealthMetric[] = [
    {
      type: 'sleep_duration',
      value: Number((s.durationInSeconds / 3600).toFixed(2)),
      unit: 'h',
      source: 'garmin',
      reliability: 'high',
      measuredAt,
    },
  ];
  const score = s.overallSleepScore?.value;
  if (typeof score === 'number') {
    out.push({
      type: 'sleep_efficiency',
      value: score,
      unit: 'score',
      source: 'garmin',
      reliability: 'high',
      measuredAt,
    });
  }
  return out;
}

export interface GarminHrvSummary {
  startTimeInSeconds?: number;
  lastNightAvg?: number;
}

/** Garmin HRV summary → hrv metric (ms). */
export function normalizeGarminHrv(h: GarminHrvSummary): ImportedHealthMetric[] {
  if (h.startTimeInSeconds === undefined || typeof h.lastNightAvg !== 'number') return [];
  return [
    {
      type: 'hrv',
      value: h.lastNightAvg,
      unit: 'ms',
      source: 'garmin',
      reliability: 'high',
      measuredAt: epochToIso(h.startTimeInSeconds),
    },
  ];
}

export interface GarminBodyComp {
  startTimeInSeconds?: number;
  weightInGrams?: number;
  bodyFatInPercent?: number;
}

/** Garmin body-composition → weight (kg) + body-fat (%) metrics. */
export function normalizeGarminBodyComp(b: GarminBodyComp): ImportedHealthMetric[] {
  if (b.startTimeInSeconds === undefined) return [];
  const measuredAt = epochToIso(b.startTimeInSeconds);
  const out: ImportedHealthMetric[] = [];
  if (typeof b.weightInGrams === 'number') {
    out.push({
      type: 'weight',
      value: Number((b.weightInGrams / 1000).toFixed(2)),
      unit: 'kg',
      source: 'garmin',
      reliability: 'high',
      measuredAt,
    });
  }
  if (typeof b.bodyFatInPercent === 'number') {
    out.push({
      type: 'body_fat',
      value: b.bodyFatInPercent,
      unit: '%',
      source: 'garmin',
      reliability: 'high',
      measuredAt,
    });
  }
  return out;
}

/**
 * A Garmin push webhook body. Garmin posts one or more summary arrays keyed by
 * type; we normalize every array present into a single ImportResult.
 */
export interface GarminPushBody {
  activities?: GarminActivitySummary[];
  activityDetails?: GarminActivitySummary[];
  dailies?: GarminDailySummary[];
  sleeps?: GarminSleepSummary[];
  hrv?: GarminHrvSummary[];
  bodyComps?: GarminBodyComp[];
}

/** Normalize a full Garmin push payload into activities + health metrics. */
export function normalizeGarminPush(body: GarminPushBody): ImportResult {
  const activities: ImportedActivity[] = [];
  const healthMetrics: ImportedHealthMetric[] = [];

  for (const a of body.activities ?? []) {
    const norm = normalizeGarminActivity(a);
    if (norm) activities.push(norm);
  }
  for (const d of body.dailies ?? []) healthMetrics.push(...normalizeGarminDaily(d));
  for (const s of body.sleeps ?? []) healthMetrics.push(...normalizeGarminSleep(s));
  for (const h of body.hrv ?? []) healthMetrics.push(...normalizeGarminHrv(h));
  for (const b of body.bodyComps ?? []) healthMetrics.push(...normalizeGarminBodyComp(b));

  return { activities, healthMetrics };
}
