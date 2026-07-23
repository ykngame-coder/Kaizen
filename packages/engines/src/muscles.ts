import type { ISODateString, MuscleGroup } from '@supotsu/core';

/**
 * Muscle Map Engine (Master Prompt P36) — Fitbod/Garmin-style. Computes, per
 * muscle group, a "freshness" 0-100 from recent training: a muscle worked hard
 * or recently is fatigued (needs rest); one untouched for a few days is fresh.
 * Pure — sessions in, statuses out. Recovery window ≈ 72 h (linear decay).
 */

const DAY_MS = 86_400_000;
const clamp = (n: number, min = 0, max = 100): number => Math.max(min, Math.min(max, n));

/** Muscle groups rendered on the body map (full_body is expanded onto these). */
export const BODY_MUSCLES: MuscleGroup[] = [
  'chest', 'shoulders', 'biceps', 'triceps', 'core',
  'back', 'quads', 'hamstrings', 'glutes', 'calves',
];

export type MuscleState = 'rested' | 'fresh' | 'worked' | 'fatigued';

export interface MuscleStatus {
  muscle: MuscleGroup;
  /** 0 (fully fatigued) … 100 (fully rested). */
  freshness: number;
  lastTrainedDaysAgo: number | null;
  state: MuscleState;
}

/** One training bout with the muscles it hit (built from workout sets upstream). */
export interface MuscleSession {
  trainedAt: ISODateString;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
}

function stateFor(freshness: number): MuscleState {
  if (freshness >= 85) return 'rested';
  if (freshness >= 60) return 'fresh';
  if (freshness >= 35) return 'worked';
  return 'fatigued';
}

/**
 * Per-muscle status as of `asOf`. Sessions in the last ~4 days contribute
 * fatigue weighted by role (primary 1.0, secondary 0.5, full_body 0.5 to all)
 * and by recency (linear decay to zero at 3 days).
 */
export function computeMuscleStates(sessions: MuscleSession[], asOf: ISODateString): MuscleStatus[] {
  const now = new Date(asOf).getTime();
  const fatigue = new Map<MuscleGroup, number>();
  const lastAgo = new Map<MuscleGroup, number>();

  const hit = (muscle: MuscleGroup, weight: number, daysAgo: number): void => {
    const decay = Math.max(0, 1 - daysAgo / 3);
    if (decay > 0) fatigue.set(muscle, (fatigue.get(muscle) ?? 0) + weight * decay);
    const prev = lastAgo.get(muscle);
    if (prev === undefined || daysAgo < prev) lastAgo.set(muscle, daysAgo);
  };

  for (const s of sessions) {
    const daysAgo = (now - new Date(s.trainedAt).getTime()) / DAY_MS;
    if (daysAgo < 0 || daysAgo > 4) continue;
    const apply = (muscles: MuscleGroup[], weight: number): void => {
      for (const m of muscles) {
        if (m === 'full_body') for (const bm of BODY_MUSCLES) hit(bm, weight * 0.5, daysAgo);
        else hit(m, weight, daysAgo);
      }
    };
    apply(s.primaryMuscles, 1.0);
    apply(s.secondaryMuscles, 0.5);
  }

  return BODY_MUSCLES.map((muscle) => {
    const freshness = clamp(Math.round(100 - (fatigue.get(muscle) ?? 0) * 50));
    const ago = lastAgo.get(muscle);
    return {
      muscle,
      freshness,
      lastTrainedDaysAgo: ago === undefined ? null : Math.floor(ago),
      state: stateFor(freshness),
    };
  });
}

/** The freshest muscles (rested), useful to suggest what to train next. */
export function suggestNextMuscles(statuses: MuscleStatus[], count = 3): MuscleGroup[] {
  return [...statuses]
    .sort((a, b) => b.freshness - a.freshness)
    .slice(0, count)
    .map((s) => s.muscle);
}
