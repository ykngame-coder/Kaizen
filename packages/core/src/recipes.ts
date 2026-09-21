import type { OwnedEntity, UUID } from './common';
import type { Visibility } from './user-programs';

/**
 * Un ingrédient d'une recette. Les macros sont une photo prise à l'ajout —
 * jamais une référence live vers Open Food Facts, qui pourrait changer sa
 * fiche demain sans que la recette ne doive en être affectée.
 */
export interface RecipeIngredient {
  id: UUID;
  /** Absent si l'ingrédient a été saisi à la main (aucune fiche trouvée). */
  barcode?: string;
  description: string;
  kcalPer100g: number;
  proteinGPer100g: number;
  carbGPer100g: number;
  fatGPer100g: number;
  /** Quantité utilisée dans la recette, en grammes — pas une quantité mangée. */
  quantityG: number;
  order: number;
}

/**
 * Une recette composée par l'utilisateur. Ses macros pour 100 g ne sont
 * jamais stockées : elles se recalculent depuis `ingredients` (voir
 * `recipeMacrosPer100g` dans @supotsu/engines) — les stocker en plus créerait
 * une deuxième source de vérité qui pourrait diverger après une édition.
 */
export interface Recipe extends OwnedEntity {
  name: string;
  visibility: Visibility;
  ingredients: RecipeIngredient[];
}
