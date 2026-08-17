import type { HealthMetricType } from '@supotsu/core';
import type { ImportedActivity, ImportedHealthMetric } from './types';

/**
 * Data Quality Engine (Master Prompt P23.13, P38.10). Rejects impossible values
 * — e.g. "100 km in 10 min" — before anything reaches the database or engines.
 */

export interface QualityIssue {
  field: string;
  reason: string;
}

/** Max plausible speed (m/s). 100 km / 600 s = 166 m/s ⇒ rejected. */
const MAX_SPEED_MS = 25; // ~90 km/h

export function validateActivity(a: ImportedActivity): QualityIssue[] {
  const issues: QualityIssue[] = [];
  if (a.durationSec <= 0) issues.push({ field: 'durationSec', reason: 'Durée nulle ou négative.' });
  if (a.distanceM !== undefined && a.distanceM < 0)
    issues.push({ field: 'distanceM', reason: 'Distance négative.' });
  if (a.distanceM && a.durationSec > 0) {
    const speed = a.distanceM / a.durationSec;
    if (speed > MAX_SPEED_MS)
      issues.push({ field: 'distanceM', reason: 'Vitesse physiquement impossible.' });
  }
  if (a.avgHeartRate !== undefined && (a.avgHeartRate < 25 || a.avgHeartRate > 240))
    issues.push({ field: 'avgHeartRate', reason: 'Fréquence cardiaque hors plage.' });
  return issues;
}

const HEALTH_RANGES: Record<HealthMetricType, [number, number]> = {
  sleep_duration: [0, 16],
  sleep_efficiency: [0, 100],
  resting_heart_rate: [25, 120],
  hrv: [3, 300],
  stress: [0, 100],
  weight: [20, 400],
  body_fat: [2, 70],
  muscle_mass: [10, 120],
  hydration: [0, 10],
  steps: [0, 100_000],
};

export function validateHealthMetric(m: ImportedHealthMetric): QualityIssue[] {
  const [min, max] = HEALTH_RANGES[m.type];
  if (m.value < min || m.value > max) {
    return [{ field: 'value', reason: `Valeur hors plage attendue (${min}-${max}).` }];
  }
  return [];
}
