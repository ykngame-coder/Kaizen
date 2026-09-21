import { describe, expect, it } from 'vitest';
import type { Recipe, RecipeIngredient } from '@supotsu/core';
import { recipeMacrosPer100g, recipeToFoodItem, recipeTotalWeightG } from './recipes';

function ingredient(partial: Partial<RecipeIngredient> & { quantityG: number }): RecipeIngredient {
  return {
    id: partial.id ?? `i-${Math.random()}`,
    description: partial.description ?? 'Ingrédient',
    kcalPer100g: partial.kcalPer100g ?? 0,
    proteinGPer100g: partial.proteinGPer100g ?? 0,
    carbGPer100g: partial.carbGPer100g ?? 0,
    fatGPer100g: partial.fatGPer100g ?? 0,
    quantityG: partial.quantityG,
    order: partial.order ?? 0,
  };
}

describe('recipeTotalWeightG', () => {
  it('additionne les quantités de tous les ingrédients', () => {
    expect(recipeTotalWeightG([ingredient({ quantityG: 200 }), ingredient({ quantityG: 300 })])).toBe(500);
  });

  it('rend 0 sans ingrédient', () => {
    expect(recipeTotalWeightG([])).toBe(0);
  });
});

describe('recipeMacrosPer100g', () => {
  it('rend des zéros sans ingrédient — jamais une division par zéro', () => {
    expect(recipeMacrosPer100g([])).toEqual({ kcal: 0, proteinG: 0, carbG: 0, fatG: 0 });
  });

  it('égale les macros de l unique ingrédient quand il n y en a qu un', () => {
    const i = ingredient({ quantityG: 250, kcalPer100g: 89, proteinGPer100g: 1.1, carbGPer100g: 23, fatGPer100g: 0.3 });
    expect(recipeMacrosPer100g([i])).toEqual({ kcal: 89, proteinG: 1.1, carbG: 23, fatG: 0.3 });
  });

  it('pondère par la quantité, pas une simple moyenne', () => {
    const bouillon = ingredient({ quantityG: 500, kcalPer100g: 5, proteinGPer100g: 0, carbGPer100g: 1, fatGPer100g: 0 });
    const carotte = ingredient({ quantityG: 200, kcalPer100g: 40, proteinGPer100g: 1, carbGPer100g: 9, fatGPer100g: 0 });
    const out = recipeMacrosPer100g([bouillon, carotte]);
    // total 700 g ; kcal = (500*5 + 200*40) / 700 = (2500 + 8000) / 700 = 15
    expect(out.kcal).toBeCloseTo(15, 5);
  });
});

describe('recipeToFoodItem', () => {
  it('expose le nom, les macros calculées et le poids total en servingSizeG', () => {
    const recipe: Recipe = {
      id: 'r1',
      userId: 'u1',
      name: 'Soupe',
      visibility: 'private',
      createdAt: 'x',
      updatedAt: 'x',
      ingredients: [ingredient({ quantityG: 500, kcalPer100g: 10, proteinGPer100g: 1, carbGPer100g: 2, fatGPer100g: 0 })],
    };
    const food = recipeToFoodItem(recipe);
    expect(food.name).toBe('Soupe');
    expect(food.per100g.kcal).toBe(10);
    expect(food.servingSizeG).toBe(500);
  });

  it('sert un servingSizeG absent plutôt que 0 pour une recette sans ingrédient', () => {
    const recipe: Recipe = { id: 'r1', userId: 'u1', name: 'Vide', visibility: 'private', createdAt: 'x', updatedAt: 'x', ingredients: [] };
    expect(recipeToFoodItem(recipe).servingSizeG).toBeUndefined();
  });
});
