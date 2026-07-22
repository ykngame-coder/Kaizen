import type { ActivityType, DataSource, HealthMetricType } from '@supotsu/core';
import type { ImportedActivity, ImportedHealthMetric } from './types';

/**
 * File import (Master Prompt P22 — import manuel de données). Pure parsing of a
 * "Supotsu health export" JSON into our model, so an exported archive (Garmin
 * RGPD, Apple Health, …) can be centralized without any live connector. A
 * source-specific adapter converts a provider's format into this shape first.
 *
 * Expected shape (all optional):
 *   { "source": "garmin",
 *     "metrics":    [ { "type": "hrv", "value": 61, "date": "…ISO…" }, … ],
 *     "activities": [ { "type": "running", "startedAt": "…ISO…", "durationSec": 1800, … }, … ] }
 */

const METRIC_UNITS: Record<string, string> = {
  hrv: 'ms',
  resting_heart_rate: 'bpm',
  sleep_duration: 'h',
  sleep_efficiency: 'score',
  stress: 'score',
  weight: 'kg',
  body_fat: '%',
  muscle_mass: 'kg',
  hydration: 'ml',
};

const DATA_SOURCES: ReadonlySet<string> = new Set<DataSource>([
  'manual', 'apple_health', 'garmin', 'strava', 'renpho', 'polar', 'coros', 'fitbit', 'oura', 'withings', 'supotsu',
]);

const ACTIVITY_TYPES: ReadonlySet<string> = new Set<ActivityType>([
  'walking', 'running', 'cycling', 'swimming', 'strength', 'cross_training', 'hyrox', 'mobility', 'yoga', 'other',
]);

const toNum = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
const toIso = (v: unknown): string | undefined => {
  if (typeof v !== 'string' && typeof v !== 'number') return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
};

export interface ParsedImport {
  activities: ImportedActivity[];
  healthMetrics: ImportedHealthMetric[];
}

/** Parse a Supotsu health export object into activities + health metrics. */
export function parseHealthExport(input: unknown): ParsedImport {
  const obj = (input ?? {}) as Record<string, unknown>;
  const source: DataSource = DATA_SOURCES.has(obj.source as string)
    ? (obj.source as DataSource)
    : 'manual';

  const healthMetrics: ImportedHealthMetric[] = [];
  for (const raw of Array.isArray(obj.metrics) ? obj.metrics : []) {
    const m = raw as Record<string, unknown>;
    const unit = METRIC_UNITS[m.type as string];
    const value = toNum(m.value);
    const measuredAt = toIso(m.date ?? m.measuredAt);
    if (!unit || value === undefined || !measuredAt) continue;
    healthMetrics.push({
      type: m.type as HealthMetricType,
      value: Number(value.toFixed(2)),
      unit,
      source,
      reliability: 'high',
      measuredAt,
    });
  }

  const activities: ImportedActivity[] = [];
  for (const raw of Array.isArray(obj.activities) ? obj.activities : []) {
    const a = raw as Record<string, unknown>;
    const startedAt = toIso(a.startedAt ?? a.start ?? a.date);
    const durationSec = toNum(a.durationSec ?? a.duration);
    if (!startedAt || !durationSec) continue;
    const type = ACTIVITY_TYPES.has(a.type as string) ? (a.type as ActivityType) : 'other';
    activities.push({
      externalId: typeof a.externalId === 'string' ? a.externalId : undefined,
      type,
      source,
      startedAt,
      durationSec: Math.round(durationSec),
      distanceM: toNum(a.distanceM ?? a.distance) !== undefined ? Math.round(toNum(a.distanceM ?? a.distance)!) : undefined,
      calories: toNum(a.calories),
      avgHeartRate: toNum(a.avgHeartRate) !== undefined ? Math.round(toNum(a.avgHeartRate)!) : undefined,
    });
  }

  return { activities, healthMetrics };
}

/** Parse raw file text (JSON) into an import payload. Throws on invalid JSON. */
export function parseHealthExportText(text: string): ParsedImport {
  return parseHealthExport(JSON.parse(text));
}
