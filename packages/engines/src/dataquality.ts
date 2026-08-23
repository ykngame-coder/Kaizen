import type { Activity, DataSource, HealthMetric, HealthMetricType, ISODateString, Reliability } from '@supotsu/core';

/**
 * Data-Quality Engine (Master Prompt P9/P38 — "une donnée = source + date +
 * fiabilité"). Pure helpers that make provenance and trust explicit: how
 * reliable a source is, how fresh a datapoint is, and whether an activity looks
 * plausible. No data is ever discarded — only annotated.
 */

const DAY_MS = 86_400_000;

/** Trust ranking per source: sensors > derived > manual (Master Prompt P38.10). */
const SOURCE_RELIABILITY: Record<DataSource, Reliability> = {
  garmin: 'high',
  apple_health: 'high',
  polar: 'high',
  coros: 'high',
  oura: 'high',
  withings: 'high',
  renpho: 'medium',
  fitbit: 'medium',
  strava: 'medium',
  supotsu: 'medium',
  manual: 'low',
  phone: 'low', // accelerometer-only actigraphy, no wearable — Master Prompt P38.10
};

export function sourceReliability(source: DataSource): Reliability {
  return SOURCE_RELIABILITY[source] ?? 'low';
}

export type FreshnessLevel = 'à jour' | 'récent' | 'ancien' | 'obsolète';

export interface Freshness {
  ageDays: number;
  level: FreshnessLevel;
}

/** How old a datapoint is, bucketed for display. */
export function freshness(measuredAt: ISODateString, asOf: ISODateString): Freshness {
  const ageDays = Math.max(0, Math.floor((new Date(asOf).getTime() - new Date(measuredAt).getTime()) / DAY_MS));
  const level: FreshnessLevel = ageDays <= 1 ? 'à jour' : ageDays <= 7 ? 'récent' : ageDays <= 30 ? 'ancien' : 'obsolète';
  return { ageDays, level };
}

export interface MetricProvenance {
  type: HealthMetricType;
  value: number;
  unit: string;
  source: DataSource;
  reliability: Reliability;
  freshness: Freshness;
  measuredAt: ISODateString;
}

/**
 * Latest datapoint per metric type, annotated with source, reliability (the
 * metric's own if recorded, else inferred from the source) and freshness.
 */
export function metricProvenance(metrics: HealthMetric[], asOf: ISODateString): MetricProvenance[] {
  const latest = new Map<HealthMetricType, HealthMetric>();
  for (const m of metrics) {
    const prev = latest.get(m.type);
    if (!prev || m.measuredAt.localeCompare(prev.measuredAt) > 0) latest.set(m.type, m);
  }
  return [...latest.values()]
    .map((m) => ({
      type: m.type,
      value: m.value,
      unit: m.unit,
      source: m.source,
      reliability: m.reliability ?? sourceReliability(m.source),
      freshness: freshness(m.measuredAt, asOf),
      measuredAt: m.measuredAt,
    }))
    .sort((a, b) => a.type.localeCompare(b.type));
}

export interface ActivityValidation {
  valid: boolean;
  issues: string[];
}

/** Plausibility checks on an activity (flag, never drop — Master Prompt P38.9). */
export function validateActivity(activity: Activity): ActivityValidation {
  const issues: string[] = [];
  if (activity.durationSec <= 0) issues.push('Durée nulle ou négative.');
  if (activity.avgHeartRate !== undefined && (activity.avgHeartRate < 30 || activity.avgHeartRate > 230)) {
    issues.push('Fréquence cardiaque moyenne hors plage (30–230 bpm).');
  }
  if (
    activity.maxHeartRate !== undefined &&
    activity.avgHeartRate !== undefined &&
    activity.maxHeartRate < activity.avgHeartRate
  ) {
    issues.push('FC max inférieure à la FC moyenne.');
  }
  if (activity.distanceM !== undefined && activity.distanceM < 0) issues.push('Distance négative.');
  if (activity.calories !== undefined && activity.calories < 0) issues.push('Calories négatives.');
  // Implausible speed (> 12 m/s ≈ 43 km/h) for foot sports.
  if (
    activity.distanceM !== undefined &&
    activity.durationSec > 0 &&
    (activity.type === 'running' || activity.type === 'walking') &&
    activity.distanceM / activity.durationSec > 12
  ) {
    issues.push('Vitesse improbable pour ce type d’activité.');
  }
  return { valid: issues.length === 0, issues };
}

/** Overall data-quality score 0-100 from source reliability + freshness. */
export function dataQualityScore(provenance: MetricProvenance[]): number {
  if (provenance.length === 0) return 0;
  const relW: Record<Reliability, number> = { high: 1, medium: 0.6, low: 0.3 };
  const freshW: Record<FreshnessLevel, number> = { 'à jour': 1, récent: 0.8, ancien: 0.5, obsolète: 0.2 };
  const sum = provenance.reduce((s, p) => s + relW[p.reliability] * freshW[p.freshness.level], 0);
  return Math.round((sum / provenance.length) * 100);
}
