import type { ActivityType, HealthMetricType } from '@supotsu/core';

/**
 * Health Auto Export adapter (Master Prompt P22). The iOS app "Health Auto
 * Export" can POST an Apple Health JSON to a REST endpoint on a schedule, or
 * save it to Files — a free, automatable bridge. This converts its native shape
 * into the generic Supotsu health-export shape consumed by `parseHealthExport`.
 * Pure and source-agnostic; provenance is recorded as `apple_health`.
 *
 * Native shape (abridged):
 *   { "data": {
 *       "metrics":  [ { "name": "resting_heart_rate", "units": "count/min",
 *                       "data": [ { "date": "2026-07-26 00:00:00 +0200", "qty": 56 } ] }, … ],
 *       "workouts": [ { "name": "…", "start": "…", "end": "…", "duration": 972,
 *                       "distance": { "qty": 0, "units": "km" }, … } ] } }
 *
 * Note: Garmin does not push HRV to Apple Health, so HRV is usually absent here.
 * The mapping is kept anyway for sources that do provide it.
 */

/** Health Auto Export metric name → Supotsu metric type. */
const METRIC_MAP: Record<string, HealthMetricType> = {
  heart_rate_variability: 'hrv',
  resting_heart_rate: 'resting_heart_rate',
  weight_body_mass: 'weight',
  body_fat_percentage: 'body_fat',
  lean_body_mass: 'muscle_mass',
  dietary_water: 'hydration',
};

/** Parse "2026-07-26 00:00:00 +0200" (or ISO) into a UTC ISO string. */
export function haeDateToIso(ts: unknown): string | undefined {
  if (typeof ts !== 'string') return undefined;
  const m = ts.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})\s*([+-]\d{2}):?(\d{2})?$/);
  if (m) {
    const [, y, mo, d, h, mi, s, offh, offm = '00'] = m;
    const parsed = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}${offh}:${offm}`);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
  }
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

const toNum = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** French/English Apple workout name → Supotsu ActivityType (best effort). */
function mapWorkoutType(name: unknown): ActivityType {
  const n = String(name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  if (/(course|running|tapis|jogging)/.test(n)) return 'running';
  if (/(marche|walking|randonnee|hiking)/.test(n)) return 'walking';
  if (/(velo|cyclisme|cycling|bike)/.test(n)) return 'cycling';
  if (/(natation|swim)/.test(n)) return 'swimming';
  if (/(muscu|renforcement|force|strength|poids)/.test(n)) return 'strength';
  if (/(yoga)/.test(n)) return 'yoga';
  if (/(pilates|mobilite|etirement|souplesse|stretch)/.test(n)) return 'mobility';
  if (/(hiit|intervalle|fonctionnel|functional|croise|cross)/.test(n)) return 'cross_training';
  if (/(hyrox)/.test(n)) return 'hyrox';
  return 'other';
}

interface GenericMetric {
  type: HealthMetricType;
  value: number;
  date: string;
}
interface GenericActivity {
  externalId?: string;
  type: ActivityType;
  startedAt: string;
  durationSec: number;
  distanceM?: number;
  calories?: number;
  avgHeartRate?: number;
}
export interface HealthAutoExportGeneric {
  source: 'apple_health';
  metrics: GenericMetric[];
  activities: GenericActivity[];
}

/** True when `input` looks like a Health Auto Export payload. */
export function isHealthAutoExport(input: unknown): boolean {
  const data = (input as { data?: unknown })?.data as { metrics?: unknown; workouts?: unknown } | undefined;
  return !!data && (Array.isArray(data.metrics) || Array.isArray(data.workouts));
}

/**
 * Convert a Health Auto Export payload into the generic Supotsu export shape
 * (feed the result to `parseHealthExport`). Returns null if it isn't one.
 */
export function healthAutoExportToSupotsu(input: unknown): HealthAutoExportGeneric | null {
  if (!isHealthAutoExport(input)) return null;
  const data = (input as { data: { metrics?: unknown[]; workouts?: unknown[] } }).data;

  const metrics: GenericMetric[] = [];
  for (const rawMetric of Array.isArray(data.metrics) ? data.metrics : []) {
    const metric = rawMetric as { name?: string; data?: unknown[] };
    const points = Array.isArray(metric.data) ? metric.data : [];

    if (metric.name === 'sleep_analysis') {
      for (const rawPoint of points) {
        const p = rawPoint as Record<string, unknown>;
        const measuredAt = haeDateToIso(p.sleepEnd ?? p.date);
        const totalSleep = toNum(p.totalSleep);
        const inBed = toNum(p.inBed);
        if (!measuredAt || totalSleep === undefined || totalSleep <= 0) continue;
        metrics.push({ type: 'sleep_duration', value: totalSleep, date: measuredAt });
        if (inBed && inBed > 0) {
          metrics.push({ type: 'sleep_efficiency', value: Math.min(100, (totalSleep / inBed) * 100), date: measuredAt });
        }
      }
      continue;
    }

    const type = metric.name ? METRIC_MAP[metric.name] : undefined;
    if (!type) continue;
    for (const rawPoint of points) {
      const p = rawPoint as Record<string, unknown>;
      const value = toNum(p.qty);
      const date = haeDateToIso(p.date);
      if (value === undefined || !date) continue;
      metrics.push({ type, value, date });
    }
  }

  const activities: GenericActivity[] = [];
  for (const rawWorkout of Array.isArray(data.workouts) ? data.workouts : []) {
    const w = rawWorkout as Record<string, unknown>;
    const startedAt = haeDateToIso(w.start);
    const durationSec = toNum(w.duration);
    if (!startedAt || durationSec === undefined || durationSec <= 0) continue;
    const distanceQty = toNum((w.distance as { qty?: unknown } | undefined)?.qty);
    const energyKj = toNum((w.activeEnergyBurned as { qty?: unknown } | undefined)?.qty);
    const hr = w.heartRate as { avg?: { qty?: unknown } } | undefined;
    const avgHr = toNum(hr?.avg?.qty) ?? toNum((w.avgHeartRate as { qty?: unknown } | undefined)?.qty);
    activities.push({
      externalId: w.id !== undefined ? `hae-${String(w.id)}` : undefined,
      type: mapWorkoutType(w.name),
      startedAt,
      durationSec: Math.round(durationSec),
      distanceM: distanceQty !== undefined ? Math.round(distanceQty * 1000) : undefined,
      // Health Auto Export reports energy in kJ; convert to kcal.
      calories: energyKj !== undefined ? Math.round(energyKj / 4.184) : undefined,
      avgHeartRate: avgHr !== undefined ? Math.round(avgHr) : undefined,
    });
  }

  return { source: 'apple_health', metrics, activities };
}
