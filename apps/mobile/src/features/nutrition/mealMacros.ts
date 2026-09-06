/**
 * Conversion « tableau nutritionnel » → valeurs réellement consommées.
 *
 * Les étiquettes sont presque toujours données pour 100 g, alors qu'une portion
 * l'est rarement. Cette mise à l'échelle vivait dans AddMealScreen, appliquée
 * par un bouton ; elle est isolée ici pour être calculée à la volée et testée.
 */

/**
 * "numeric" sur iOS n'a pas de touche décimale, et "decimal-pad" en produit une
 * qui tape une virgule sur un clavier français — que Number() ne sait pas lire.
 */
export const parseDecimal = (s: string): number => Number(s.trim().replace(',', '.'));

export const numOrUndef = (s: string): number | undefined => (s.trim() ? parseDecimal(s) : undefined);

export interface Per100Input {
  kcal: string;
  proteinG: string;
  carbG: string;
  fatG: string;
  quantityG: string;
}

export interface MacroTotals {
  kcal: number;
  proteinG: number | undefined;
  carbG: number | undefined;
  fatG: number | undefined;
}

/** Une décimale : au-delà, l'affichage devient faussement précis. */
const round1 = (v: number): number => Math.round(v * 10) / 10;

/**
 * Totaux pour `quantityG` grammes, ou `null` si la saisie ne permet pas de
 * conclure — quantité absente ou non positive, calories illisibles. Un macro
 * laissé vide reste `undefined` : le forcer à 0 affirmerait une valeur que
 * l'utilisateur n'a pas donnée.
 */
export function scalePer100(input: Per100Input): MacroTotals | null {
  // numOrUndef, pas parseDecimal : Number('') vaut 0, qui est fini — une
  // quantité ou des calories laissées vides passeraient donc pour valides.
  const qty = numOrUndef(input.quantityG);
  if (qty == null || !Number.isFinite(qty) || qty <= 0) return null;

  const kcalPer100 = numOrUndef(input.kcal);
  if (kcalPer100 == null || !Number.isFinite(kcalPer100)) return null;

  const factor = qty / 100;
  const scale = (raw: string): number | undefined => {
    const v = numOrUndef(raw);
    return v != null && Number.isFinite(v) ? round1(v * factor) : undefined;
  };

  return {
    kcal: round1(kcalPer100 * factor),
    proteinG: scale(input.proteinG),
    carbG: scale(input.carbG),
    fatG: scale(input.fatG),
  };
}
