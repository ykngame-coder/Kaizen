import type { ProgressionRationale } from '@supotsu/engines';

/**
 * Traduit la raison d'une suggestion. Le moteur renvoie une donnée structurée
 * (Lot 1) précisément pour que la phrase vive ici, dans les cinq locales, et
 * pas en dur dans le moteur.
 */
export function progressionRationaleKey(rationale: ProgressionRationale): {
  key: string;
  params: Record<string, number>;
} {
  switch (rationale.kind) {
    case 'addRep':
      return { key: 'sport.progression.rationale.addRep', params: { reps: rationale.reps } };
    case 'increaseLoad':
      return {
        key: 'sport.progression.rationale.increaseLoad',
        params: {
          from: rationale.fromWeightKg,
          to: rationale.toWeightKg,
          highReps: rationale.highReps,
          lowReps: rationale.lowReps,
        },
      };
    case 'addRepSameLoad':
      return {
        key: 'sport.progression.rationale.addRepSameLoad',
        params: { reps: rationale.reps, weight: rationale.weightKg },
      };
  }
}
