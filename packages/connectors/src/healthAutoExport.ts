import type { ActivityType, DataSource, HealthMetricType } from '@supotsu/core';
import type { ImportedActivity, ImportedHealthMetric, ImportedSleepSession } from './types';
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

/**
 * Resolve the real provider from a Health Auto Export per-sample `source` string
 * (e.g. "Renpho | RENPHO Health", "Connect", "Withings"). A Renpho smart scale
 * writes body composition into Apple Santé, so this attributes it to 'renpho'
 * (and Garmin/Withings/… likewise) instead of collapsing everything to Apple
 * Santé — the free, reliable Renpho bridge. Unknown sources stay 'apple_health'.
 */
export function resolveHaeSource(raw: unknown): DataSource {
  const s = (typeof raw === 'string' ? raw : '').toLowerCase();
  if (s.includes('renpho')) return 'renpho';
  if (s.includes('withings')) return 'withings';
  if (s.includes('garmin') || s.includes('connect')) return 'garmin';
  if (s.includes('polar')) return 'polar';
  if (s.includes('coros')) return 'coros';
  if (s.includes('oura')) return 'oura';
  if (s.includes('fitbit')) return 'fitbit';
  return 'apple_health';
}

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
 * unit to our canonical unit. Metrics we don't model (distance, nutrition
 * macros…) are intentionally absent and simply skipped.
 */
const METRIC_MAP: Record<string, { type: HealthMetricType; unit: string; scale?: number }> = {
  resting_heart_rate: { type: 'resting_heart_rate', unit: 'bpm' },
  heart_rate_variability: { type: 'hrv', unit: 'ms' },
  weight_body_mass: { type: 'weight', unit: 'kg' },
  body_fat_percentage: { type: 'body_fat', unit: '%' },
  step_count: { type: 'steps', unit: 'count' },
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
      source: resolveHaeSource(p.source),
      reliability: 'high',
      measuredAt,
    });
  }
  return out;
}

/** One night of Apple Santé sleep-analysis (hours per stage + timestamps). */
interface HaeSleepPoint {
  source?: string;
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
    const source = resolveHaeSource(p.source);

    out.push({
      type: 'sleep_duration',
      value: Number(asleepHours.toFixed(2)),
      unit: 'h',
      source,
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
        source,
        reliability: 'high',
        measuredAt: bedtime,
      });
    }
  }
  return out;
}

const H_TO_MIN = 60;

/**
 * sleep_analysis → one ImportedSleepSession per night with its stage minutes.
 * The export is nightly-aggregated, so `segments` (the minute-by-minute
 * hypnogram) is intentionally left undefined — never fabricated.
 */
export function parseHealthAutoExportSleepSessions(
  points: HaeSleepPoint[],
): ImportedSleepSession[] {
  const out: ImportedSleepSession[] = [];
  for (const p of points ?? []) {
    const startedAt = haeToIso(p.sleepStart) ?? haeToIso(p.inBedStart) ?? haeToIso(p.date);
    const endedAt = haeToIso(p.sleepEnd) ?? haeToIso(p.inBedEnd);
    if (!startedAt || !endedAt) continue;

    const deepMin = (asNum(p.deep) ?? 0) * H_TO_MIN;
    const lightMin = (asNum(p.core) ?? 0) * H_TO_MIN;
    const remMin = (asNum(p.rem) ?? 0) * H_TO_MIN;
    const awakeMin = (asNum(p.awake) ?? 0) * H_TO_MIN;
    const stageAsleep = deepMin + lightMin + remMin;
    const asleepMin = asNum(p.totalSleep) !== undefined ? asNum(p.totalSleep)! * H_TO_MIN : stageAsleep;
    if (asleepMin <= 0) continue;
    const inBedMin = asNum(p.inBed) !== undefined ? asNum(p.inBed)! * H_TO_MIN : asleepMin + awakeMin;

    out.push({
      source: resolveHaeSource(p.source),
      reliability: 'high',
      startedAt,
      endedAt,
      deepMin: Math.round(deepMin),
      lightMin: Math.round(lightMin),
      remMin: Math.round(remMin),
      awakeMin: Math.round(awakeMin),
      asleepMin: Math.round(asleepMin),
      inBedMin: Math.round(inBedMin),
    });
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
  const sleepSessions: ImportedSleepSession[] = [];
  for (const m of data.metrics ?? []) {
    if (m?.name === 'sleep_analysis') {
      const points = (m.data ?? []) as HaeSleepPoint[];
      healthMetrics.push(...parseHealthAutoExportSleep(points));
      sleepSessions.push(...parseHealthAutoExportSleepSessions(points));
    } else {
      healthMetrics.push(...parseScalarMetric(m));
    }
  }

  const activities = parseHealthAutoExportWorkouts(data.workouts ?? []);
  return { activities, healthMetrics, records: [], sleepSessions };
}
