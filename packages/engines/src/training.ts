import type { SetEntry } from '@supotsu/core';

/**
 * Training Engine (Master Prompt P36 — progression). Double-progression
 * suggestion: keep adding reps within a range at a fixed load, then bump the
 * load and reset to the bottom of the range. Pure — the last session's sets for
 * one exercise in, the next target out. Nothing hidden: every suggestion states
 * its reason.
 */

export interface ProgressionOptions {
  /** Working rep range [low, high]. */
  repRange?: [number, number];
  /** Load increment (kg) when the top of the range is reached. */
  incrementKg?: number;
}

/**
 * Pourquoi cette suggestion — donnée structurée, pas une phrase. Le moteur
 * reste sans langue : c'est l'app qui traduit chaque `kind` avec ses
 * paramètres (clés sport.progression.rationale.*).
 */
export type ProgressionRationale =
  | { kind: 'addRep'; reps: number }
  | { kind: 'increaseLoad'; fromWeightKg: number; toWeightKg: number; highReps: number; lowReps: number }
  | { kind: 'addRepSameLoad'; reps: number; weightKg: number };

export interface ProgressionSuggestion {
  weightKg?: number;
  reps?: number;
  rationale: ProgressionRationale;
}

/** The heaviest working set of a session (ties broken by most reps). */
function topSet(sets: SetEntry[]): SetEntry | undefined {
  return sets
    .filter((s) => s.weightKg !== undefined && s.reps !== undefined)
    .sort((a, b) => b.weightKg! - a.weightKg! || b.reps! - a.reps!)[0];
}

/**
 * Suggest the next target for an exercise from its most recent session's sets.
 * Weighted sets follow double progression; bodyweight/rep-only sets just add a
 * rep. Returns undefined when there is nothing to progress from.
 */
export function suggestProgression(
  session: SetEntry[],
  options: ProgressionOptions = {},
): ProgressionSuggestion | undefined {
  const [low, high] = options.repRange ?? [8, 12];
  const inc = options.incrementKg ?? 2.5;

  const top = topSet(session);
  if (!top) {
    // No load recorded → progress reps only.
    const bestReps = session
      .filter((s) => s.reps !== undefined)
      .reduce<number | undefined>((m, s) => (m === undefined ? s.reps : Math.max(m, s.reps!)), undefined);
    if (bestReps === undefined) return undefined;
    return { reps: bestReps + 1, rationale: { kind: 'addRep', reps: bestReps + 1 } };
  }

  if (top.reps! >= high) {
    const weightKg = Math.round((top.weightKg! + inc) * 2) / 2;
    return {
      weightKg,
      reps: low,
      rationale: {
        kind: 'increaseLoad',
        fromWeightKg: top.weightKg!,
        toWeightKg: weightKg,
        highReps: high,
        lowReps: low,
      },
    };
  }
  return {
    weightKg: top.weightKg,
    reps: top.reps! + 1,
    rationale: { kind: 'addRepSameLoad', reps: top.reps! + 1, weightKg: top.weightKg! },
  };
}
