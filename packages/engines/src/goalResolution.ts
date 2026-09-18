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
/** Une balance envoie plusieurs mesures par jour, bruitées : le départ se prend sur une moyenne, jamais sur une pesée isolée. */
export const START_AVERAGE_WINDOW_DAYS = 7;
const DAY_MS = 86_400_000;

const isWeightGoal = (goal: Goal): boolean =>
  goal.type === 'body_composition' && (goal.targetUnit === undefined || goal.targetUnit.toLowerCase() === 'kg');

/**
 * Le poids autour d'un instant : la moyenne des pesées de la semaine qui
 * l'entoure, sinon la pesée la plus proche tant qu'elle reste dans la fenêtre.
 * Une seule mesure ferait sauter la barre au gré du bruit de la balance.
 */
function weightAround(points: TrendPoint[], at: string): number | undefined {
  const target = new Date(at).getTime();
  const gaps = points.map((p) => ({ value: p.value, gap: Math.abs(new Date(p.date).getTime() - target) }));
  const near = gaps.filter((g) => g.gap <= START_AVERAGE_WINDOW_DAYS * DAY_MS);
  if (near.length > 0) {
    return Math.round((near.reduce((sum, g) => sum + g.value, 0) / near.length) * 10) / 10;
  }
  const closest = gaps.reduce<{ value: number; gap: number } | undefined>((best, g) => (best && best.gap <= g.gap ? best : g), undefined);
  return closest && closest.gap <= START_LOOKUP_WINDOW_DAYS * DAY_MS ? closest.value : undefined;
}

/**
 * L'objectif complété par les données réelles : dernière pesée comme valeur
 * courante, poids moyen du jour de création comme départ quand il manque.
 */
export function resolveGoal(goal: Goal, weights: TrendPoint[]): Goal {
  if (!isWeightGoal(goal) || weights.length === 0) return goal;
  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1]!;
  return {
    ...goal,
    startValue: goal.startValue ?? weightAround(sorted, goal.createdAt),
    currentValue: latest.value,
  };
}

/** La progression à afficher, une fois l'objectif servi par les données réelles. */
export function resolvedGoalProgress(goal: Goal, weights: TrendPoint[]): number {
  const resolved = resolveGoal(goal, weights);
  return computeGoalProgress(resolved, resolved.startValue);
}
