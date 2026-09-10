import { numOrUndef, scalePer100, type Per100Input } from './mealMacros';

export interface TotalInput {
  kcal: string;
  proteinG: string;
  carbG: string;
  fatG: string;
}

export interface ResolvedMacros {
  kcal: number;
  proteinG: number | undefined;
  carbG: number | undefined;
  fatG: number | undefined;
}

export type MealEntryResolution = { ok: true; macros: ResolvedMacros } | { ok: false };

/**
 * Ce qu'il faut enregistrer pour un repas, ou le refus.
 *
 * Les deux modes de saisie appliquaient des règles opposées, et toutes deux
 * fausses. « Par 100 g », devenu le mode par défaut, rendait `null` sans
 * calories NI quantité — donc loguer un verre d'eau était impossible, alors que
 * l'ancien formulaire le permettait. « Total », lui, laissait `parseDecimal('')`
 * valoir 0 : un repas sans calories passait le schéma et s'enregistrait à 0 kcal
 * en silence.
 *
 * La règle est désormais la même des deux côtés :
 *
 * - un **aliment** exige des calories réellement saisies ;
 * - une **hydratation seule** est légitime et s'enregistre à 0 kcal ;
 * - un **0 explicite** est une affirmation, pas une absence, et passe ;
 * - une entrée sans rien du tout est refusée.
 */
export function resolveMealEntry(
  mode: 'per100' | 'total',
  per100: Per100Input,
  total: TotalInput,
  hydrationMl: string,
): MealEntryResolution {
  const hydration = numOrUndef(hydrationMl);
  const hasHydration = hydration != null && Number.isFinite(hydration) && hydration > 0;

  const macros = mode === 'per100' ? scalePer100(per100) : totalMacros(total);
  if (macros) return { ok: true, macros };

  // Pas d'aliment exploitable : reste l'hydratation, qui se suffit à elle-même.
  if (hasHydration) return { ok: true, macros: { kcal: 0, proteinG: undefined, carbG: undefined, fatG: undefined } };
  return { ok: false };
}

/** Totaux directs, ou null si les calories n'ont pas été saisies. */
function totalMacros(total: TotalInput): ResolvedMacros | null {
  const kcal = numOrUndef(total.kcal);
  if (kcal == null || !Number.isFinite(kcal)) return null;
  return {
    kcal,
    proteinG: numOrUndef(total.proteinG),
    carbG: numOrUndef(total.carbG),
    fatG: numOrUndef(total.fatG),
  };
}
