import type {
  ActivityType,
  DataSource,
  HealthMetricType,
  Intensity,
  ISODateString,
  Reliability,
} from '@supotsu/core';

/**
 * Connector Framework types (Master Prompt P9, P22, P38). Every external source
 * implements the same `Connector` interface and emits already-normalized data;
 * the import pipeline then validates, dedupes and hands off to persistence.
 */

export type ConnectorProvider =
  | 'demo'
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
