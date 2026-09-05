import type { SetEntry } from '@supotsu/core';

/**
 * Adhésion au plan (Lot 1 — fondations création & suivi) : ce qui était
 * programmé face à ce qui a été réalisé, sur une séance. Pur.
 */

export interface PlanAdherence {
  /** Réalisé / prévu, borné à [0, 2] — au-delà de 200 % la valeur ne dit plus rien d'utile. */
  ratio: number;
  /** Séries porteuses d'un plan, hors échauffement. */
  comparedSets: number;
  /** Parmi elles, celles atteintes ou dépassées. */
  metOrExceeded: number;
}

/** Ratio maximal retenu : au-delà, le chiffre cesse d'être informatif. */
const MAX_RATIO = 2;

/**
 * Contribution d'une série, en tonnage. Le tonnage plutôt que les reps parce
 * que les reps seules manquent les écarts de charge : prévu 8 x 62,5 kg,
 * réalisé 8 x 50 kg donnerait 100 %. Une charge absente compte pour 1 afin que
 * les séries au poids du corps pèsent leurs répétitions.
 */
function tonnage(reps: number | undefined, weightKg: number | undefined): number {
  return (reps ?? 0) * (weightKg ?? 1);
}

/**
 * Adhésion d'une séance. Retourne undefined quand aucune série ne porte de
 * plan — tout l'historique antérieur à la migration 0029 — pour que l'appelant
 * n'affiche simplement rien plutôt que d'avoir à gérer un cas d'erreur.
 */
export function computePlanAdherence(sets: SetEntry[]): PlanAdherence | undefined {
  const planned = sets.filter((s) => !s.isWarmup && s.plannedReps !== undefined);
  if (planned.length === 0) return undefined;

  let plannedTotal = 0;
  let actualTotal = 0;
  let metOrExceeded = 0;

  for (const s of planned) {
    const target = tonnage(s.plannedReps, s.plannedWeightKg);
    // Sans completedAt la série n'a pas été faite, quelles que soient les
    // valeurs qu'elle porte : le runner les a pré-remplies avec le prévu.
    const done = s.completedAt ? tonnage(s.reps, s.weightKg) : 0;
    plannedTotal += target;
    actualTotal += done;
    if (done >= target) metOrExceeded += 1;
  }

  if (plannedTotal <= 0) return undefined;
  return {
    ratio: Math.min(MAX_RATIO, actualTotal / plannedTotal),
    comparedSets: planned.length,
    metOrExceeded,
  };
}
