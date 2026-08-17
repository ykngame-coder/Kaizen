import type { DataSource, ISODateString, OwnedEntity, Reliability } from './common';

/** Kinds of physiological data centralized by Supotsu (Master Prompt P8.9, P32.10). */
export type HealthMetricType =
  | 'sleep_duration'
  | 'sleep_efficiency'
  | 'resting_heart_rate'
  | 'hrv'
  | 'stress'
  | 'weight'
  | 'body_fat'
  | 'muscle_mass'
  | 'hydration'
  | 'steps';

/**
 * A single health datapoint. One row per (type, timestamp, source) so history is
 * never overwritten and conflicting sources can coexist (Master Prompt P9.9).
 */
export interface HealthMetric extends OwnedEntity {
  type: HealthMetricType;
  value: number;
  unit: string;
  source: DataSource;
  reliability?: Reliability;
  measuredAt: ISODateString;
}

/** Sleep stages tracked per night (Master Prompt P32.10, Cahier des charges §3.10). */
export type SleepStage = 'deep' | 'light' | 'rem' | 'awake';

/** One contiguous stretch of a single stage — the building block of a hypnogram. */
export interface SleepSegment {
  stage: SleepStage;
  startedAt: ISODateString;
  endedAt: ISODateString;
}

/**
 * One night's sleep with its stage breakdown. Complements `sleep_duration` /
 * `sleep_efficiency` health metrics with the phase composition a device provides
 * (Apple Santé / Garmin). Minutes are per stage; `segments` (the minute-by-minute
 * timeline) is only present when the source exposes it — nightly-aggregated
 * exports omit it, so the UI must not fabricate one.
 */
export interface SleepSession extends OwnedEntity {
  source: DataSource;
  reliability?: Reliability;
  /** Bedtime (fell asleep / got in bed). */
  startedAt: ISODateString;
  /** Wake time. */
  endedAt: ISODateString;
  deepMin: number;
  lightMin: number;
  remMin: number;
  awakeMin: number;
  /** Minutes actually asleep (deep + light + rem). */
  asleepMin: number;
  /** Minutes in bed (asleep + awake). */
  inBedMin: number;
  /** Contiguous stage segments, when the source provides a real timeline. */
  segments?: SleepSegment[];
}
