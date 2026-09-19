import type { Sex } from '@supotsu/core';

/**
 * Les charges de compétition Hyrox, catégorie Open.
 *
 * Un programme de coach ne peut pas figer la charge du traîneau : elle dépend
 * de qui pousse. Le coach laisse donc la charge vide, et on complète à la
 * lecture avec le standard de la catégorie — modifiable pendant la séance,
 * comme n'importe quelle charge.
 */

/** Poussée et tirage, en kilogrammes, traîneau compris. */
const OPEN_SLED_KG: Record<string, Partial<Record<Sex, number>>> = {
  Sled_Push: { male: 102, female: 52 },
  'Sled Pull': { male: 103, female: 78 },
};

export function standardSledWeightKg(exerciseId: string, sex: Sex | undefined): number | undefined {
  if (!sex || sex === 'unspecified') return undefined;
  return OPEN_SLED_KG[exerciseId]?.[sex];
}

/**
 * Complète les charges de traîneau absentes. Ce que le coach a prescrit passe
 * avant le standard : une séance à 150 kg reste à 150 kg.
 */
export function withStandardSledWeights<T extends { exerciseId: string; weightKg?: number }>(
  sets: T[],
  sex: Sex | undefined,
): T[] {
  return sets.map((set) => {
    if (set.weightKg != null) return set;
    const standard = standardSledWeightKg(set.exerciseId, sex);
    return standard == null ? set : { ...set, weightKg: standard };
  });
}
