import type { Per100Input } from './mealMacros';

/**
 * Les valeurs pour 100 g d'une entrée déjà enregistrée, reconstituées depuis
 * ses totaux et la quantité mangée.
 *
 * Seuls les totaux sont persistés : recopier un repas ne pouvait donc proposer
 * que « 116,6 kcal », le total d'une portion précise, alors qu'on veut le plus
 * souvent remanger la même chose en quantité différente. La quantité suffit à
 * remonter aux valeurs de l'étiquette — les stocker en plus créerait une
 * seconde source pour la même vérité.
 *
 * `null` quand la quantité manque : c'est le cas de toutes les entrées
 * antérieures et de toute saisie en mode « Total », qui se recopient alors
 * telles quelles.
 */
export function per100From(
  totals: { kcal: number; proteinG?: number; carbG?: number; fatG?: number },
  quantityG: number | undefined,
): Per100Input | null {
  if (quantityG == null || !Number.isFinite(quantityG) || quantityG <= 0) return null;
  const factor = 100 / quantityG;
  const scale = (v: number | undefined): string =>
    v == null || !Number.isFinite(v) ? '' : String(Math.round(v * factor * 10) / 10);
  return {
    kcal: scale(totals.kcal),
    proteinG: scale(totals.proteinG),
    carbG: scale(totals.carbG),
    fatG: scale(totals.fatG),
    quantityG: String(quantityG),
  };
}
