import type { Goal } from '@supotsu/core';
import { computeGoalProgress, type TrendPoint } from './progression';

/**
 * Un objectif de poids servi par les données réelles.
 *
 * Deux défauts se combinaient. Le point de départ est facultatif à la
 * création : sans lui, la progression vaut `(actuel − actuel) / (cible −
 * actuel)`, soit zéro pour toujours — la barre ne pouvait pas bouger. Et la
 * valeur courante n'avançait que si on retapait son poids à la main, alors
 * qu'il arrive tout seul d'Apple Santé.
 *
 * Tout est dérivé à la lecture : rien n'est réécrit en base, et le jour où un
 * vrai départ y est enregistré, il l'emporte.
 */

/** Au-delà, une pesée ne dit plus rien du poids qu'on avait en créant l'objectif. */
export const START_LOOKUP_WINDOW_DAYS = 21;
const DAY_MS = 86_400_000;

const isWeightGoal = (goal: Goal): boolean =>
  goal.type === 'body_composition' && (goal.targetUnit === undefined || goal.targetUnit.toLowerCase() === 'kg');

/** La pesée la plus proche d'un instant, dans la fenêtre — sinon rien. */
function nearestPoint(points: TrendPoint[], at: string): TrendPoint | undefined {
  const target = new Date(at).getTime();
  let best: TrendPoint | undefined;
  let bestGap = Infinity;
  for (const p of points) {
    const gap = Math.abs(new Date(p.date).getTime() - target);
    if (gap < bestGap) {
      best = p;
      bestGap = gap;
    }
  }
  return best && bestGap <= START_LOOKUP_WINDOW_DAYS * DAY_MS ? best : undefined;
}

/**
 * L'objectif complété par les données réelles : dernière pesée comme valeur
 * courante, pesée du jour de création comme départ quand il manque.
 */
export function resolveGoal(goal: Goal, weights: TrendPoint[]): Goal {
  if (!isWeightGoal(goal) || weights.length === 0) return goal;
  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1]!;
  return {
    ...goal,
    startValue: goal.startValue ?? nearestPoint(sorted, goal.createdAt)?.value,
    currentValue: latest.value,
  };
}

/** La progression à afficher, une fois l'objectif servi par les données réelles. */
export function resolvedGoalProgress(goal: Goal, weights: TrendPoint[]): number {
  const resolved = resolveGoal(goal, weights);
  return computeGoalProgress(resolved, resolved.startValue);
}
