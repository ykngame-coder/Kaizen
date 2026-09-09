export interface MealMacroTotals {
  proteinG: number;
  carbG: number;
  fatG: number;
  /**
   * True dès qu'une entrée porte au moins une macro renseignée.
   *
   * Beaucoup d'entrées manuelles n'ont que des calories : sommer sans le
   * signaler afficherait « 0 P · 0 G · 0 L », ce qui se lit comme « ce repas
   * n'apporte aucun macronutriment » alors qu'on ne sait simplement pas. Des
   * macros explicitement à zéro, elles, restent une information.
   */
  hasAny: boolean;
}

/** Macros cumulées d'un repas, arrondies — les décimales n'ont pas de sens à cette échelle. */
export function sumMealMacros(
  entries: { proteinG?: number; carbG?: number; fatG?: number }[],
): MealMacroTotals {
  let proteinG = 0;
  let carbG = 0;
  let fatG = 0;
  let hasAny = false;
  for (const e of entries) {
    if (e.proteinG != null || e.carbG != null || e.fatG != null) hasAny = true;
    proteinG += e.proteinG ?? 0;
    carbG += e.carbG ?? 0;
    fatG += e.fatG ?? 0;
  }
  return { proteinG: Math.round(proteinG), carbG: Math.round(carbG), fatG: Math.round(fatG), hasAny };
}
