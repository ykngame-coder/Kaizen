import type { HealthMetricType } from '@supotsu/core';
import type { ImportedHealthMetric } from './types';
import { parseHealthExport, type ParsedImport } from './healthImport';

/**
 * Garmin "Export your data" (RGPD) adapter (Master Prompt P22). Pure conversion
 * of Garmin's own JSON files (DI-Connect-Wellness/…) into Supotsu metrics. Free,
 * offline, and it carries what live connectors can't (Garmin-proprietary data).
 * Shapes below match a real export; each file type is auto-detected by content.
 */

/** Garmin timestamps carry no timezone suffix → interpret them as UTC. Handles
 *  both date-only ("2025-09-17") and datetime ("2025-09-17T13:25:39.154"). */
function garminToIso(ts: unknown): string | undefined {
  if (typeof ts !== 'string' || ts === '') return undefined;
  const s = /^\d{4}-\d{2}-\d{2}$/.test(ts) ? `${ts}T00:00:00` : ts;
  const hasTz = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(s);
  const d = new Date(hasTz ? s : `${s}Z`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

const asNum = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export interface GarminSleepRecord {
  sleepEndTimestampGMT?: string;
  deepSleepSeconds?: number;
  lightSleepSeconds?: number;
  remSleepSeconds?: number;
}

/** DI-Connect-Wellness/*_sleepData.json → nightly sleep-duration metrics. */
export function parseGarminSleep(records: GarminSleepRecord[]): ImportedHealthMetric[] {
  const out: ImportedHealthMetric[] = [];
  for (const r of records ?? []) {
    const measuredAt = garminToIso(r.sleepEndTimestampGMT);
    // Actual sleep = deep + light + REM (awake / unmeasurable excluded).
    const seconds = asNum(r.deepSleepSeconds) + asNum(r.lightSleepSeconds) + asNum(r.remSleepSeconds);
    if (!measuredAt || seconds <= 0) continue;
    out.push({
      type: 'sleep_duration',
      value: Number((seconds / 3600).toFixed(2)),
      unit: 'h',
      source: 'garmin',
      reliability: 'high',
      measuredAt,
    });
  }
  return out;
}

export interface GarminBioRecord {
  weight?: { weight?: number; timestampGMT?: string };
  metaData?: { calendarDate?: string };
}

/** DI-Connect-Wellness/*_userBioMetrics.json → weight metrics (grams → kg). */
export function parseGarminBioMetrics(records: GarminBioRecord[]): ImportedHealthMetric[] {
  const out: ImportedHealthMetric[] = [];
  for (const r of records ?? []) {
    const grams = r.weight?.weight;
    if (typeof grams !== 'number' || !Number.isFinite(grams)) continue;
    const measuredAt = garminToIso(r.weight?.timestampGMT) ?? garminToIso(r.metaData?.calendarDate);
    if (!measuredAt) continue;
    out.push({
      type: 'weight',
      value: Number((grams / 1000).toFixed(2)),
      unit: 'kg',
      source: 'garmin',
      reliability: 'high',
      measuredAt,
    });
  }
  return out;
}

export interface GarminHealthStatusRecord {
  calendarDate?: string;
  metrics?: { type?: string; value?: number; status?: string }[];
}

/** Garmin daily health metric type → Supotsu metric (only the ones we model). */
const HEALTH_STATUS_MAP: Record<string, { type: HealthMetricType; unit: string }> = {
  HRV: { type: 'hrv', unit: 'ms' },
  HR: { type: 'resting_heart_rate', unit: 'bpm' },
};

/** DI-Connect-Wellness/*_healthStatusData.json → daily HRV + resting-HR metrics. */
export function parseGarminHealthStatus(records: GarminHealthStatusRecord[]): ImportedHealthMetric[] {
  const out: ImportedHealthMetric[] = [];
  for (const r of records ?? []) {
    const measuredAt = garminToIso(r.calendarDate);
    if (!measuredAt) continue;
    for (const m of r.metrics ?? []) {
      const mapped = m.type ? HEALTH_STATUS_MAP[m.type] : undefined;
      // value 0 with status UNKNOWN = not measured that day → skip.
      if (!mapped || typeof m.value !== 'number' || m.value <= 0 || m.status === 'UNKNOWN') continue;
      out.push({
        type: mapped.type,
        value: m.value,
        unit: mapped.unit,
        source: 'garmin',
        reliability: 'high',
        measuredAt,
      });
    }
  }
  return out;
}

const has = (o: unknown, key: string): boolean =>
  typeof o === 'object' && o !== null && key in (o as Record<string, unknown>);

/** Detect a Garmin export file by content and convert it; null if unrecognized. */
export function detectAndParseGarminFile(json: unknown): ParsedImport | null {
  if (!Array.isArray(json)) return null;
  const sample = json.slice(0, 20);
  if (sample.some((x) => has(x, 'sleepStartTimestampGMT') || has(x, 'sleepEndTimestampGMT'))) {
    return { activities: [], healthMetrics: parseGarminSleep(json as GarminSleepRecord[]) };
  }
  if (sample.some((x) => has(x, 'createTimestampUTC') && has(x, 'metrics'))) {
    return { activities: [], healthMetrics: parseGarminHealthStatus(json as GarminHealthStatusRecord[]) };
  }
  if (sample.some((x) => has(x, 'userSetNullForWeight') || has(x, 'weight'))) {
    return { activities: [], healthMetrics: parseGarminBioMetrics(json as GarminBioRecord[]) };
  }
  return null;
}

/**
 * Unified entry for the import screen: a Garmin export file if recognized,
 * otherwise the plain Supotsu health-export format.
 */
export function parseImportFile(json: unknown): ParsedImport {
  return detectAndParseGarminFile(json) ?? parseHealthExport(json);
}
