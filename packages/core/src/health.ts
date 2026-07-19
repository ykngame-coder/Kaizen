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
  | 'hydration';

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
