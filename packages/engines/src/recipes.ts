import type { FoodItem, Macros, Recipe, RecipeIngredient } from '@supotsu/core';

/**
 * Recipe Engine. Pure functions : une recette entre, un `FoodItem` calculé
 * sort. Jamais de stockage — les macros pour 100 g ne sont jamais
 * persistées, toujours recalculées ici depuis les ingrédients.
 */

/** Poids total du plat fini — la somme des quantités, pas une portion mangée. */
export function recipeTotalWeightG(ingredients: RecipeIngredient[]): number {
  return ingredients.reduce((sum, i) => sum + i.quantityG, 0);
}

/**
 * Macros pour 100 g du plat fini : moyenne pondérée par la quantité de
 * chaque ingrédient. 500 g de bouillon et 20 g de sel n'ont pas le même
 * poids dans le résultat — une simple moyenne des macros/100g de chaque
 * ingrédient serait fausse dès que les quantités diffèrent.
 */
export function recipeMacrosPer100g(ingredients: RecipeIngredient[]): Macros {
  const totalG = recipeTotalWeightG(ingredients);
  if (totalG <= 0) return { kcal: 0, proteinG: 0, carbG: 0, fatG: 0 };
  const weighted = (pick: (i: RecipeIngredient) => number): number =>
    ingredients.reduce((acc, i) => acc + pick(i) * i.quantityG, 0) / totalG;
  return {
    kcal: weighted((i) => i.kcalPer100g),
    proteinG: weighted((i) => i.proteinGPer100g),
    carbG: weighted((i) => i.carbGPer100g),
    fatG: weighted((i) => i.fatGPer100g),
  };
}

/**
 * Une recette, une fois ses macros calculées, est un aliment comme un autre
 * — même `FoodItem` qu'un produit Open Food Facts, donc `scaleMacros` et
 * l'écran de saisie de quantité mangée s'appliquent sans rien changer.
 * `servingSizeG` = le poids total : par défaut, on part de « manger toute
 * la recette », comme le `servingSizeG` d'un produit OFF préremplit déjà.
 */
export function recipeToFoodItem(recipe: Recipe): FoodItem {
  const totalG = recipeTotalWeightG(recipe.ingredients);
  return {
    name: recipe.name,
    per100g: recipeMacrosPer100g(recipe.ingredients),
    servingSizeG: totalG > 0 ? totalG : undefined,
  };
}
