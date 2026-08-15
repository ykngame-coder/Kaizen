import type {
  ActivityType,
  DataSource,
  HealthMetricType,
  Intensity,
  ISODateString,
  RecordCategory,
  Reliability,
  SleepSegment,
} from '@supotsu/core';

/**
 * Connector Framework types (Master Prompt P9, P22, P38). Every external source
 * implements the same `Connector` interface and emits already-normalized data;
 * the import pipeline then validates, dedupes and hands off to persistence.
 */

export type ConnectorProvider =
  | 'apple_health'
  | 'garmin'
  | 'strava'
  | 'polar'
  | 'coros'
  | 'fitbit'
  | 'oura'
  | 'withings';

/** Normalized activity, already mapped to Supotsu's internal format. */
export interface ImportedActivity {
  externalId?: string;
  type: ActivityType;
  source: DataSource;
  startedAt: ISODateString;
  durationSec: number;
  distanceM?: number;
  calories?: number;
  intensity?: Intensity;
  avgHeartRate?: number;
}

/** Normalized health metric, provenance preserved. */
export interface ImportedHealthMetric {
  type: HealthMetricType;
  value: number;
  unit: string;
  source: DataSource;
  reliability?: Reliability;
  measuredAt: ISODateString;
}

/** Normalized night of sleep with its stage breakdown, provenance preserved. */
export interface ImportedSleepSession {
  source: DataSource;
  reliability?: Reliability;
  startedAt: ISODateString;
  endedAt: ISODateString;
  deepMin: number;
  lightMin: number;
  remMin: number;
  awakeMin: number;
  asleepMin: number;
  inBedMin: number;
  segments?: SleepSegment[];
}

/** A normalized set from a structured strength workout (Garmin FIT import). */
export interface ImportedWorkoutSet {
  exerciseId: string;
  reps?: number;
  weightKg?: number;
}

/**
 * Normalized structured strength workout — reps/weight per exercise, not just
 * a session summary (see garminFit.ts). Distinct from ImportedActivity: this
 * feeds workouts/workout_sets (and therefore the muscle-recovery silhouette),
 * not the activities table.
 */
export interface ImportedWorkout {
  /** Stable across re-imports of the same export, for dedup. */
  externalId: string;
  startedAt: ISODateString;
  source: DataSource;
  sets: ImportedWorkoutSet[];
}

/** Normalized personal record / benchmark. */
export interface ImportedRecord {
  externalId?: string;
  label: string;
  category: RecordCategory;
  value: number;
  unit: string;
  source: DataSource;
  achievedAt: ISODateString;
}

export interface ImportResult {
  activities: ImportedActivity[];
  healthMetrics: ImportedHealthMetric[];
}

export type ConnectorCapability = 'activities' | 'health';

/** A data source. Real providers set `available:false` until wired natively. */
export interface Connector {
  provider: ConnectorProvider;
  name: string;
  available: boolean;
  capabilities: ConnectorCapability[];
  /** Pull and normalize data as of a given moment. */
  sync(asOf: ISODateString): Promise<ImportResult>;
}
