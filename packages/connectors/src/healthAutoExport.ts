import type { ActivityType, HealthMetricType } from '@supotsu/core';
import type { ImportedActivity, ImportedHealthMetric } from './types';
import type { ParsedImport } from './healthImport';

/**
 * Health Auto Export adapter (Master Prompt P22 — import manuel). The iOS app
 * "Health Auto Export" reads Apple Santé and writes a JSON archive; because
 * Garmin Connect syncs into Apple Santé, this single file carries Garmin data
 * *including sleep stages* — without a Mac or the closed Garmin API.
 *
 * Shape:
 *   { "data": {
 *       "metrics":  [ { "name": "sleep_analysis", "units": "hr", "data": [ … ] }, … ],
 *       "workouts": [ { "name": "…", "start": "…", "duration": 972.7, … }, … ] } }
 *
 * All data is device-measured (Apple/Garmin) → reliability 'high'. Everything is
 * tagged source 'apple_health' since Apple Santé is the actual origin here.
 */

/** Health Auto Export dates look like "2026-06-26 01:30:31 +0200". Normalize to
 *  ISO so parsing is engine-independent (Hermes is stricter than V8/Node). */
function haeToIso(ts: unknown): string | undefined {
  if (typeof ts !== 'string' || ts === '') return undefined;
  // "2026-06-26 01:30:31 +0200" → "2026-06-26T01:30:31+02:00"
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\s*([+-]\d{2}):?(\d{2}))?/.exec(ts);
  if (m) {
    const [, date, time, oh, om] = m;
    const offset = oh ? `${oh}:${om}` : 'Z';
    const d = new Date(`${date}T${time}${offset}`);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

const asNum = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

/** A simple scalar metric (one qty per timestamp). */
interface HaeQtyPoint {
  qty?: number;
  date?: string;
  source?: string;
}
interface HaeMetric {
  name?: string;
  units?: string;
  data?: unknown[];
}

/**
 * Health Auto Export metric name → Supotsu metric. `scale` converts the source
 * unit to our canonical unit. Metrics we don't model (steps, distance, nutrition
 * macros…) are intentionally absent and simply skipped.
 */
const METRIC_MAP: Record<string, { type: HealthMetricType; unit: string; scale?: number }> = {
  resting_heart_rate: { type: 'resting_heart_rate', unit: 'bpm' },
  heart_rate_variability: { type: 'hrv', unit: 'ms' },
  weight_body_mass: { type: 'weight', unit: 'kg' },
  body_fat_percentage: { type: 'body_fat', unit: '%' },
  lean_body_mass: { type: 'muscle_mass', unit: 'kg' },
  dietary_water: { type: 'hydration', unit: 'ml' },
};

/** One scalar metric series → normalized health metrics. */
function parseScalarMetric(m: HaeMetric): ImportedHealthMetric[] {
  const mapped = m.name ? METRIC_MAP[m.name] : undefined;
  if (!mapped || !Array.isArray(m.data)) return [];
  const out: ImportedHealthMetric[] = [];
  for (const raw of m.data) {
    const p = raw as HaeQtyPoint;
    const value = asNum(p.qty);
    const measuredAt = haeToIso(p.date);
    if (value === undefined || measuredAt === undefined) continue;
    out.push({
      type: mapped.type,
      value: Number((value * (mapped.scale ?? 1)).toFixed(2)),
      unit: mapped.unit,
      source: 'apple_health',
      reliability: 'high',
      measuredAt,
    });
  }
  return out;
}

/** One night of Apple Santé sleep-analysis (hours per stage + timestamps). */
interface HaeSleepPoint {
  date?: string;
  sleepStart?: string;
  sleepEnd?: string;
  inBedStart?: string;
  inBedEnd?: string;
  totalSleep?: number;
  inBed?: number;
  deep?: number;
  core?: number;
  rem?: number;
  awake?: number;
  asleep?: number;
}

/**
 * sleep_analysis → nightly sleep_duration + a *real* sleep_efficiency
 * (asleep / in-bed). By codebase convention `measuredAt` of sleep_duration is
 * the bedtime, so downstream engines can reconstruct the wake time.
 */
export function parseHealthAutoExportSleep(points: HaeSleepPoint[]): ImportedHealthMetric[] {
  const out: ImportedHealthMetric[] = [];
  for (const p of points ?? []) {
    // Prefer the actual sleep window; fall back to the in-bed window / date.
    const bedtime =
      haeToIso(p.sleepStart) ?? haeToIso(p.inBedStart) ?? haeToIso(p.date);
    if (!bedtime) continue;

    // Asleep hours: totalSleep if present, else the sum of measured stages.
    const stages =
      (asNum(p.deep) ?? 0) + (asNum(p.core) ?? 0) + (asNum(p.rem) ?? 0) + (asNum(p.asleep) ?? 0);
    const asleepHours = asNum(p.totalSleep) ?? (stages > 0 ? stages : undefined);
    if (asleepHours === undefined || asleepHours <= 0) continue;

    out.push({
      type: 'sleep_duration',
      value: Number(asleepHours.toFixed(2)),
      unit: 'h',
      source: 'apple_health',
      reliability: 'high',
      measuredAt: bedtime,
    });

    // Efficiency = time asleep / time in bed. Only when the in-bed window is
    // known and consistent (never above 100 %).
    const inBed = asNum(p.inBed);
    if (inBed !== undefined && inBed > 0) {
      const efficiency = Math.min(100, (asleepHours / inBed) * 100);
      out.push({
        type: 'sleep_efficiency',
        value: Number(efficiency.toFixed(1)),
        unit: 'score',
        source: 'apple_health',
        reliability: 'high',
        measuredAt: bedtime,
      });
    }
  }
  return out;
}

/** Localized workout name → Supotsu ActivityType (accent-insensitive keywords). */
function mapWorkoutName(name: unknown): ActivityType {
  const n = (typeof name === 'string' ? name : '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // strip combining diacritics
  if (/(course|running|jog|trail|treadmill|tapis)/.test(n)) return 'running';
  if (/(marche|walk|randonn|hiking)/.test(n)) return 'walking';
  if (/(velo|cycl|vtt|bike|biking|spinning)/.test(n)) return 'cycling';
  if (/(natation|swim|piscine|nage)/.test(n)) return 'swimming';
  if (/(force|musculation|strength|renforcement|poids)/.test(n)) return 'strength';
  if (/(yoga|pilates|mobilit|stretch|etirement)/.test(n)) return 'yoga';
  if (/(intervalles|haute intensite|hiit|cardio|aviron|rowing|elliptique|fonctionn|croise|cross)/.test(n))
    return 'cross_training';
  return 'other';
}

interface HaeQty {
  qty?: number;
  units?: string;
}
interface HaeWorkout {
  id?: string;
  name?: string;
  start?: string;
  end?: string;
  duration?: number; // seconds
  distance?: HaeQty; // km
  activeEnergyBurned?: HaeQty; // kJ
  totalEnergy?: HaeQty; // kJ
  avgHeartRate?: HaeQty; // count/min
}

const KJ_TO_KCAL = 1 / 4.184;

/** Health Auto Export workouts → normalized activities. */
export function parseHealthAutoExportWorkouts(workouts: HaeWorkout[]): ImportedActivity[] {
  const out: ImportedActivity[] = [];
  for (const w of workouts ?? []) {
    const startedAt = haeToIso(w.start);
    const durationSec = asNum(w.duration);
    if (!startedAt || durationSec === undefined || durationSec <= 0) continue;
    const km = asNum(w.distance?.qty);
    const kj = asNum(w.activeEnergyBurned?.qty) ?? asNum(w.totalEnergy?.qty);
    const hr = asNum(w.avgHeartRate?.qty);
    out.push({
      externalId: typeof w.id === 'string' ? `hae-${w.id}` : undefined,
      type: mapWorkoutName(w.name),
      source: 'apple_health',
      startedAt,
      durationSec: Math.round(durationSec),
      distanceM: km !== undefined && km > 0 ? Math.round(km * 1000) : undefined,
      calories: kj !== undefined ? Math.round(kj * KJ_TO_KCAL) : undefined,
      avgHeartRate: hr !== undefined ? Math.round(hr) : undefined,
    });
  }
  return out;
}

/** True when `json` looks like a Health Auto Export archive. */
export function isHealthAutoExport(json: unknown): boolean {
  const data = (json as { data?: unknown })?.data as
    | { metrics?: unknown; workouts?: unknown }
    | undefined;
  return !!data && (Array.isArray(data.metrics) || Array.isArray(data.workouts));
}

/** Parse a Health Auto Export archive into activities + health metrics. */
export function parseHealthAutoExport(json: unknown): ParsedImport | null {
  if (!isHealthAutoExport(json)) return null;
  const data = (json as { data: { metrics?: HaeMetric[]; workouts?: HaeWorkout[] } }).data;

  const healthMetrics: ImportedHealthMetric[] = [];
  for (const m of data.metrics ?? []) {
    if (m?.name === 'sleep_analysis') {
      healthMetrics.push(...parseHealthAutoExportSleep((m.data ?? []) as HaeSleepPoint[]));
    } else {
      healthMetrics.push(...parseScalarMetric(m));
    }
  }

  const activities = parseHealthAutoExportWorkouts(data.workouts ?? []);
  return { activities, healthMetrics, records: [] };
}
