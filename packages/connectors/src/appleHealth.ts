import type { ActivityType, HealthMetricType, SleepSegment, SleepStage } from '@supotsu/core';
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
  HKQuantityTypeIdentifierStepCount: { type: 'steps', unit: 'count' },
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
/**
 * A night's sleep is keyed by the calendar day it *ends* on, in the
 * device's local timezone — not a raw slice of the ISO string, which reads
 * as UTC and silently splits one real night into two buckets for any user
 * whose local midnight doesn't line up with UTC midnight (e.g. a night
 * that runs ~23h00-07h00 local in UTC+2 crosses UTC midnight around 2h00
 * local, well before the night is over).
 */
const nightKey = (endDate: string): string => {
  const d = new Date(endDate);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * A stable instant for a night key — noon local time, safely clear of any
 * midnight/DST boundary. Using this (rather than the last asleep sample's
 * own end time, which drifts by minutes as HealthKit keeps finalizing a
 * night's data across repeated background syncs) keeps the same real night
 * mapped to the exact same `measuredAt` every sync, so re-syncing updates
 * that one row instead of piling up a near-duplicate for the same night.
 */
const nightKeyToIso = (key: string): string => {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, 12, 0, 0, 0).toISOString();
};

/** Duration Kaizen estimates for a structured workout with no reliable start
 * time — must stay the exact value saveWorkoutToHealthKit (in the mobile
 * app's healthKitClient.ios.ts) uses to write the workout's own duration,
 * or the read-back window and the written workout drift apart. */
export const SET_DURATION_ESTIMATE_SEC = 90;

const HR_WINDOW_PAD_MS = 10 * 60_000;

export interface HeartRateSample {
  value: number;
}

export interface HeartRateSummary {
  avgHeartRate: number;
  maxHeartRate: number;
}

/**
 * Session-level avg/max heart rate from raw quantity samples. HealthKit
 * doesn't attach heart rate directly to a workout sample — samples are
 * queried separately for a time window and summarized here, client-side.
 */
export function summarizeHeartRate(samples: HeartRateSample[]): HeartRateSummary | null {
  const values = samples.map((s) => s.value).filter((v) => Number.isFinite(v) && v > 0);
  if (values.length === 0) return null;
  return {
    avgHeartRate: Math.round(values.reduce((sum, v) => sum + v, 0) / values.length),
    maxHeartRate: Math.round(Math.max(...values)),
  };
}

export interface HeartRateWindow {
  start: string;
  end: string;
}

/**
 * Estimated time window for a structured workout — `workouts` has no
 * reliable start time or guaranteed duration today, so this reuses the same
 * set-count-based duration estimate saveWorkoutToHealthKit writes with,
 * padded on each side to tolerate the estimate being off.
 */
export function estimateWorkoutHeartRateWindow(completedAt: string, setCount: number): HeartRateWindow {
  const durationMs = Math.max(setCount, 0) * SET_DURATION_ESTIMATE_SEC * 1000;
  const completedMs = new Date(completedAt).getTime();
  return {
    start: new Date(completedMs - durationMs - HR_WINDOW_PAD_MS).toISOString(),
    end: new Date(completedMs + HR_WINDOW_PAD_MS).toISOString(),
  };
}

/**
 * Time window for a cardio activity — real start/duration, padded since a
 * watch's heart-rate sampling rarely aligns exactly to the activity's own
 * recorded boundaries.
 */
export function estimateActivityHeartRateWindow(startedAt: string, durationSec: number): HeartRateWindow {
  const startMs = new Date(startedAt).getTime();
  return {
    start: new Date(startMs - HR_WINDOW_PAD_MS).toISOString(),
    end: new Date(startMs + durationSec * 1000 + HR_WINDOW_PAD_MS).toISOString(),
  };
}

/**
 * Aggregate sleep-stage samples into one sleep_duration metric per night (hours
 * actually asleep, awake intervals excluded). Fragmented samples are summed.
 */
export function aggregateHealthKitSleep(samples: HKSleepSample[]): ImportedHealthMetric[] {
  const perNight = new Map<string, number>();
  for (const s of samples) {
    if (!ASLEEP_VALUES.has(s.value)) continue;
    const seconds = (new Date(s.endDate).getTime() - new Date(s.startDate).getTime()) / 1000;
    if (seconds <= 0) continue;
    const key = nightKey(s.endDate);
    perNight.set(key, (perNight.get(key) ?? 0) + seconds);
  }
  return [...perNight.entries()].map(([key, seconds]) => ({
    type: 'sleep_duration' as HealthMetricType,
    value: Number((seconds / 3600).toFixed(2)),
    unit: 'h',
    source: 'apple_health' as const,
    reliability: 'high' as const,
    measuredAt: nightKeyToIso(key),
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
  segments: SleepSegment[];
}

/** HealthKit sleep-analysis sample value → our stage; `undefined` for values that aren't a specific stage (in-bed, unknown). */
const STAGE_FOR_VALUE: Record<number, SleepStage> = { 4: 'deep', 5: 'rem', 3: 'light', 1: 'light', 2: 'awake' };

/**
 * Aggregate sleep-stage samples into one `ImportedSleepSession` per night —
 * same grouping as `aggregateHealthKitSleep` (by the night's end date) but
 * keeping the per-stage breakdown instead of collapsing to a single
 * duration, so the native HealthKit sync path can feed the same
 * Phases-de-sommeil card the file-import path (Health Auto Export) already
 * does. `asleepUnspecified` (value 1) — sources that don't report stage
 * detail — folds into `lightMin`, the least specific default stage.
 * Each sample IS a real per-interval reading (not an aggregate we'd be
 * fabricating), so it doubles as a `segments` entry — this is what feeds
 * the hypnogram timeline on Sommeil.
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
      segments: [],
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
    const stage = STAGE_FOR_VALUE[s.value];
    if (stage) {
      acc.segments.push({ stage, startedAt: new Date(s.startDate).toISOString(), endedAt: new Date(s.endDate).toISOString() });
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
      segments: n.segments.sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
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

/**
 * French name for HealthKit activity types that don't fit Supotsu's narrow
 * ActivityType set (only ~10 buckets) — everything outside WORKOUT_MAP above
 * collapses to the generic "Autre" label otherwise. Codes are
 * HKWorkoutActivityType's stable raw values (unchanged since iOS 8).
 */
const WORKOUT_NAME: Record<number, string> = {
  16: 'Elliptique',
  24: 'Randonnée',
  35: 'Aviron',
  44: 'Montée d’escaliers',
  68: 'Escaliers',
  8: 'Boxe',
  65: 'Kickboxing',
  28: 'Arts martiaux',
  66: 'Pilates',
  58: 'Barre au sol',
  59: 'Renforcement (core)',
  64: 'Corde à sauter',
  73: 'Cardio mixte',
  9: 'Escalade',
  6: 'Basketball',
  41: 'Football',
  48: 'Tennis',
  21: 'Golf',
  4: 'Badminton',
  43: 'Squash',
  23: 'Handball',
  51: 'Volleyball',
  36: 'Rugby',
  5: 'Baseball',
  53: 'Fitness aquatique',
  54: 'Water-polo',
  45: 'Surf',
  31: 'Sports de pagaie',
  40: 'Sports de neige',
  60: 'Ski de fond',
  61: 'Ski alpin',
  67: 'Snowboard',
  39: 'Patinage',
  56: 'Lutte',
  22: 'Gymnastique',
  72: 'Tai-chi',
  62: 'Étirements',
  29: 'Corps et esprit',
  74: 'Handbike',
  80: 'Retour au calme',
};

/** HealthKit's own name for an activity type, when it doesn't map to a real ActivityType. */
export function healthKitWorkoutName(activityType: number | undefined): string | undefined {
  if (activityType === undefined) return undefined;
  return WORKOUT_NAME[activityType];
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
  // Round after the truthiness check, not before: a genuine sub-0.5s HK
  // workout (e.g. a mis-tapped Watch log) is truthy pre-rounding but rounds
  // to 0, which the DB's `duration_sec > 0` check then rejects at insert —
  // reject it here instead so one bad workout doesn't fail the whole sync.
  const durationSec = Math.round(w.duration);
  if (durationSec <= 0) return null;
  const type = mapHealthKitWorkoutType(w.workoutActivityType);
  return {
    externalId: w.uuid ? `applehealth-${w.uuid}` : undefined,
    type,
    source: 'apple_health',
    startedAt: new Date(w.startDate).toISOString(),
    durationSec,
    distanceM: w.totalDistance !== undefined ? Math.round(w.totalDistance) : undefined,
    calories: w.totalEnergyBurned !== undefined ? Math.round(w.totalEnergyBurned) : undefined,
    // Only when we fell back to the generic bucket — a real type (running,
    // yoga…) already has its own label, no need to repeat it.
    notes: type === 'other' ? healthKitWorkoutName(w.workoutActivityType) : undefined,
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
