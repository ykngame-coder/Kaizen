import FitParser from 'fit-file-parser';

/**
 * Garmin FIT strength-set import (Master Prompt — Garmin muscle-silhouette
 * fix). Garmin's GDPR "Export your data" archive — the same one
 * garminExport.ts already parses for sleep/HRV/activities — also bundles the
 * raw per-activity .FIT files (nested under
 * DI_CONNECT/DI-Connect-Uploaded-Files/UploadedFiles_*.zip). Those carry
 * exercise-level "set" messages (reps, weight, exercise category) that no
 * JSON file in the export has, and that HealthKit/Strava never expose either
 * — this is the only source rich enough to feed the muscle-recovery
 * silhouette from an import instead of manual logging.
 *
 * One .fit file → one ImportedGarminWorkout (Garmin exports one file per
 * activity). Only `set_type: 'active'` entries with reps are kept — rest
 * periods between sets are also encoded as "set" messages and must be
 * dropped.
 */

/**
 * Garmin `exercise_category` → our exercise id (packages/shared/exercises.ts,
 * seeded into `exercises` by supabase/migrations/0016). Intentionally partial:
 * categories with no confident single-exercise muscle mapping (cardio, run,
 * bike, move, pose, ladder, warm_up, banded_exercises, suspension,
 * indoor_row, floor_climb, stair_stepper, elliptical, indoor_bike,
 * run_indoor, bike_outdoor, unknown) are left out on purpose — their sets are
 * skipped rather than guessed at.
 */
const CATEGORY_TO_EXERCISE_ID: Partial<Record<string, string>> = {
  bench_press: 'ex-bench-press',
  deadlift: 'ex-deadlift',
  squat: 'ex-back-squat',
  pull_up: 'ex-pull-up',
  push_up: 'ex-push-up',
  plank: 'ex-plank',
  calf_raise: 'ex-garmin-calf-raise',
  carry: 'ex-garmin-carry',
  chop: 'ex-garmin-chop',
  core: 'ex-garmin-core',
  crunch: 'ex-garmin-crunch',
  curl: 'ex-garmin-curl',
  flye: 'ex-garmin-flye',
  hip_raise: 'ex-garmin-hip-raise',
  hip_stability: 'ex-garmin-hip-stability',
  hip_swing: 'ex-garmin-hip-swing',
  hyperextension: 'ex-garmin-hyperextension',
  lateral_raise: 'ex-garmin-lateral-raise',
  leg_curl: 'ex-garmin-leg-curl',
  leg_raise: 'ex-garmin-leg-raise',
  lunge: 'ex-garmin-lunge',
  olympic_lift: 'ex-garmin-olympic-lift',
  plyo: 'ex-garmin-plyo',
  row: 'ex-garmin-row',
  shoulder_press: 'ex-garmin-shoulder-press',
  shoulder_stability: 'ex-garmin-shoulder-stability',
  shrug: 'ex-garmin-shrug',
  sit_up: 'ex-garmin-sit-up',
  total_body: 'ex-garmin-total-body',
  triceps_extension: 'ex-garmin-triceps-extension',
  battle_rope: 'ex-garmin-battle-rope',
  sandbag: 'ex-garmin-sandbag',
  sled: 'ex-garmin-sled',
  sledge_hammer: 'ex-garmin-sledge-hammer',
  tire: 'ex-garmin-tire',
};

export interface GarminFitSet {
  startedAt: string;
  exerciseId: string;
  reps: number;
  weightKg?: number;
}

export interface GarminFitWorkout {
  externalId: string;
  startedAt: string;
  sets: GarminFitSet[];
}

/** `category`/`category_subtype` come back as (possibly nested) arrays — flatten and take the first resolved value. */
function firstValue(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) {
    for (const item of v) {
      const found = firstValue(item);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/**
 * Parse one Garmin .FIT file into a strength workout, or null if it has no
 * usable strength sets (e.g. it's a run/ride, or only unmapped categories).
 * `externalId` should be stable across re-imports of the same export (the
 * caller derives it, e.g. from the file's path/name inside the archive) so
 * `upsertImportedWorkouts` can dedupe it.
 */
export async function parseGarminFitWorkout(
  bytes: Uint8Array,
  externalId: string,
): Promise<GarminFitWorkout | null> {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const parser = new FitParser({ mode: 'list', force: true });
  const data = await parser.parseAsync(buffer);

  const sets: GarminFitSet[] = [];
  for (const s of data.sets ?? []) {
    if (firstValue(s.set_type) !== 'active') continue;
    if (typeof s.repetitions !== 'number' || s.repetitions <= 0) continue;
    const category = firstValue(s.category);
    const exerciseId = category ? CATEGORY_TO_EXERCISE_ID[category] : undefined;
    if (!exerciseId) continue;
    const startedAt = new Date(s.start_time ?? s.timestamp).toISOString();
    sets.push({
      startedAt,
      exerciseId,
      reps: s.repetitions,
      weightKg: typeof s.weight === 'number' && s.weight > 0 ? s.weight : undefined,
    });
  }

  if (sets.length === 0) return null;
  return { externalId, startedAt: sets[0]!.startedAt, sets };
}
