import type { DataSource, ISODateString, OwnedEntity } from './common';

export type ActivityType =
  | 'walking'
  | 'running'
  | 'cycling'
  | 'swimming'
  | 'strength'
  | 'cross_training'
  | 'hyrox'
  | 'mobility'
  | 'yoga'
  | 'other';

export type Intensity = 'low' | 'moderate' | 'high' | 'max';

/**
 * A physical activity, from any source (Master Prompt P3, P8.6, P32.6).
 * `source` is mandatory so the Data Fusion Engine can dedupe / arbitrate later.
 */
export interface Activity extends OwnedEntity {
  type: ActivityType;
  source: DataSource;
  startedAt: ISODateString;
  durationSec: number;
  distanceM?: number;
  calories?: number;
  intensity?: Intensity;
  avgHeartRate?: number;
  maxHeartRate?: number;
  elevationGainM?: number;
  /** Optional per-source raw payload kept for traceability (never overwritten). */
  raw?: Record<string, unknown>;
  notes?: string;
}
