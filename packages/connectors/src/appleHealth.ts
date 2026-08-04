import type { ActivityType, HealthMetricType } from '@supotsu/core';
import type { ImportedActivity, ImportedHealthMetric, ImportedSleepSession } from './types';

/**
 * Apple Health (HealthKit) normalization (Master Prompt P22, P38). Pure functions
 * that turn HealthKit samples into Supotsu's model — no native calls here. The
 * app's iOS-only read layer (behind a dev build) feeds these already-shaped
 * samples in. In many setups Garmin writes HRV / resting HR / sleep into Apple
 * Health, so this path can carry them live.
 *
 * All Apple Health data is device-measured → reliability 'high'.
 */

/** A generic HealthKit quantity sample, already read from the native module. */
export interface HKQuantitySample {
  /** HKQuantityTypeIdentifier, e.g. 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN'. */
  quantityType: string;
  value: number;
  /** Unit string as returned by the native module (e.g. 'ms', 'count/min', 'kg'). */
  unit?: string;
  startDate: string;
}

/** HealthKit quantity type → Supotsu health metric (type + canonical unit). */
const METRIC_MAP: Record<string, { type: HealthMetricType; unit: string }> = {
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: { type: 'hrv', unit: 'ms' },
  HKQuantityTypeIdentifierRestingHeartRate: { type: 'resting_heart_rate', unit: 'bpm' },
  HKQuantityTypeIdentifierBodyMass: { type: 'weight', unit: 'kg' },
  HKQuantityTypeIdentifierBodyFatPercentage: { type: 'body_fat', unit: '%' },
  HKQuantityTypeIdentifierLeanBodyMass: { type: 'muscle_mass', unit: 'kg' },
};

/** One HealthKit quantity sample → a normalized health metric (or null). */
export function normalizeHealthKitSample(s: HKQuantitySample): ImportedHealthMetric | null {
  const mapped = METRIC_MAP[s.quantityType];
  if (!mapped || typeof s.value !== 'number' || !Number.isFinite(s.value)) return null;
  // Body-fat percentage comes as a 0-1 fraction from HealthKit; express as %.
  const value = mapped.type === 'body_fat' && s.value <= 1 ? s.value * 100 : s.value;
  return {
    type: mapped.type,
    value: Number(value.toFixed(2)),
    unit: mapped.unit,
    source: 'apple_health',
    reliability: 'high',
    measuredAt: new Date(s.startDate).toISOString(),
  };
}

/** Normalize a batch of quantity samples, dropping unmapped/invalid ones. */
export function normalizeHealthKitSamples(samples: HKQuantitySample[]): ImportedHealthMetric[] {
  const out: ImportedHealthMetric[] = [];
  for (const s of samples) {
    const m = normalizeHealthKitSample(s);
    if (m) out.push(m);
  }
  return out;
}

/**
 * HealthKit sleep-analysis category sample. `value` is the HKCategoryValueSleep
 * enum: 0 inBed, 1 asleepUnspecified, 2 awake, 3 asleepCore, 4 asleepDeep,
 * 5 asleepREM.
 */
export interface HKSleepSample {
  value: number;
  startDate: string;
  endDate: string;
}

const ASLEEP_VALUES = new Set([1, 3, 4, 5]);
/** A night's sleep is keyed by the calendar day it *ends* on. */
const nightKey = (endDate: string): string => endDate.slice(0, 10);

/**
 * Aggregate sleep-stage samples into one sleep_duration metric per night (hours
 * actually asleep, awake intervals excluded). Fragmented samples are summed.
 */
export function aggregateHealthKitSleep(samples: HKSleepSample[]): ImportedHealthMetric[] {
  const perNight = new Map<string, { seconds: number; end: string }>();
  for (const s of samples) {
    if (!ASLEEP_VALUES.has(s.value)) continue;
    const seconds = (new Date(s.endDate).getTime() - new Date(s.startDate).getTime()) / 1000;
    if (seconds <= 0) continue;
    const key = nightKey(s.endDate);
    const prev = perNight.get(key) ?? { seconds: 0, end: s.endDate };
    perNight.set(key, {
      seconds: prev.seconds + seconds,
      end: s.endDate > prev.end ? s.endDate : prev.end,
    });
  }
  return [...perNight.values()].map((n) => ({
    type: 'sleep_duration' as HealthMetricType,
    value: Number((n.seconds / 3600).toFixed(2)),
    unit: 'h',
    source: 'apple_health' as const,
    reliability: 'high' as const,
    measuredAt: new Date(n.end).toISOString(),
  }));
}

interface NightAccumulator {
  start: string;
  end: string;
  deepMin: number;
  lightMin: number;
  remMin: number;
  awakeMin: number;
  inBedMin: number;
  hasInBed: boolean;
}

/**
 * Aggregate sleep-stage samples into one `ImportedSleepSession` per night —
 * same grouping as `aggregateHealthKitSleep` (by the night's end date) but
 * keeping the per-stage breakdown instead of collapsing to a single
 * duration, so the native HealthKit sync path can feed the same
 * Phases-de-sommeil card the file-import path (Health Auto Export) already
 * does. `asleepUnspecified` (value 1) — sources that don't report stage
 * detail — folds into `lightMin`, the least specific default stage; no
 * `segments` (minute-by-minute hypnogram), matching the file-import path's
 * "never fabricate what the source didn't provide" rule.
 */
export function aggregateHealthKitSleepSessions(samples: HKSleepSample[]): ImportedSleepSession[] {
  const perNight = new Map<string, NightAccumulator>();
  for (const s of samples) {
    const minutes = (new Date(s.endDate).getTime() - new Date(s.startDate).getTime()) / 60000;
    if (minutes <= 0) continue;
    const key = nightKey(s.endDate);
    const acc = perNight.get(key) ?? {
      start: s.startDate,
      end: s.endDate,
      deepMin: 0,
      lightMin: 0,
      remMin: 0,
      awakeMin: 0,
      inBedMin: 0,
      hasInBed: false,
    };
    acc.start = s.startDate < acc.start ? s.startDate : acc.start;
    acc.end = s.endDate > acc.end ? s.endDate : acc.end;
    switch (s.value) {
      case 4: acc.deepMin += minutes; break;
      case 5: acc.remMin += minutes; break;
      case 3: case 1: acc.lightMin += minutes; break;
      case 2: acc.awakeMin += minutes; break;
      case 0: acc.inBedMin += minutes; acc.hasInBed = true; break;
      default: break;
    }
    perNight.set(key, acc);
  }

  const out: ImportedSleepSession[] = [];
  for (const n of perNight.values()) {
    const asleepMin = n.deepMin + n.lightMin + n.remMin;
    if (asleepMin <= 0) continue;
    out.push({
      source: 'apple_health',
      reliability: 'high',
      startedAt: new Date(n.start).toISOString(),
      endedAt: new Date(n.end).toISOString(),
      deepMin: Math.round(n.deepMin),
      lightMin: Math.round(n.lightMin),
      remMin: Math.round(n.remMin),
      awakeMin: Math.round(n.awakeMin),
      asleepMin: Math.round(asleepMin),
      inBedMin: Math.round(n.hasInBed ? n.inBedMin : asleepMin + n.awakeMin),
    });
  }
  return out;
}

/** HealthKit workout activity type (numeric enum) → Supotsu ActivityType. */
const WORKOUT_MAP: Record<number, ActivityType> = {
  37: 'running', // HKWorkoutActivityTypeRunning
  52: 'walking', // Walking
  46: 'swimming', // Swimming
  13: 'cycling', // Cycling
  50: 'strength', // TraditionalStrengthTraining
  20: 'strength', // FunctionalStrengthTraining
  57: 'yoga', // Yoga
  11: 'cross_training', // CrossTraining
  63: 'cross_training', // HighIntensityIntervalTraining
};

export function mapHealthKitWorkoutType(activityType: number | undefined): ActivityType {
  if (activityType === undefined) return 'other';
  return WORKOUT_MAP[activityType] ?? 'other';
}

/** A HealthKit workout, already read from the native module. */
export interface HKWorkout {
  uuid?: string;
  workoutActivityType?: number;
  startDate?: string;
  duration?: number; // seconds
  totalDistance?: number; // metres
  totalEnergyBurned?: number; // kcal
}

/** One HealthKit workout → a normalized activity (or null if unusable). */
export function normalizeHealthKitWorkout(w: HKWorkout): ImportedActivity | null {
  if (!w.startDate || !w.duration) return null;
  return {
    externalId: w.uuid ? `applehealth-${w.uuid}` : undefined,
    type: mapHealthKitWorkoutType(w.workoutActivityType),
    source: 'apple_health',
    startedAt: new Date(w.startDate).toISOString(),
    durationSec: Math.round(w.duration),
    distanceM: w.totalDistance !== undefined ? Math.round(w.totalDistance) : undefined,
    calories: w.totalEnergyBurned !== undefined ? Math.round(w.totalEnergyBurned) : undefined,
  };
}

/**
 * Apple Health via the iOS Shortcuts webhook (free, no dev build). A Shortcut
 * reads Health samples and POSTs a simple JSON payload; this normalizes it. The
 * canonical unit per metric type is applied so entries stay comparable.
 */
export const SHORTCUT_METRIC_UNITS: Record<string, string> = {
  hrv: 'ms',
  resting_heart_rate: 'bpm',
  sleep_duration: 'h',
  stress: 'score',
  weight: 'kg',
  body_fat: '%',
  hydration: 'ml',
};

export interface ShortcutHealthEntry {
  type: string;
  value: number;
  date: string;
}

/** Normalize a Shortcut health payload → provenance-aware metrics (Apple Health). */
export function normalizeShortcutHealth(entries: ShortcutHealthEntry[]): ImportedHealthMetric[] {
  const out: ImportedHealthMetric[] = [];
  for (const e of entries ?? []) {
    const unit = SHORTCUT_METRIC_UNITS[e.type];
    const value = typeof e.value === 'number' ? e.value : Number(e.value);
    const time = e.date ? new Date(e.date) : null;
    if (!unit || !Number.isFinite(value) || !time || Number.isNaN(time.getTime())) continue;
    out.push({
      type: e.type as HealthMetricType,
      value: Number(value.toFixed(2)),
      unit,
      source: 'apple_health',
      reliability: 'high',
      measuredAt: time.toISOString(),
    });
  }
  return out;
}
