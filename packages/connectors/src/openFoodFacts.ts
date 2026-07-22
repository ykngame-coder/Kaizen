import type { FoodItem, Macros } from '@supotsu/core';

/**
 * Open Food Facts normalization (Master Prompt P11 nutrition). Pure functions
 * that turn OFF's product JSON into a Supotsu FoodItem and scale portions — no
 * I/O. OFF is an open, free, world database; macros are declared per 100 g.
 */

export interface OffNutriments {
  'energy-kcal_100g'?: number;
  proteins_100g?: number;
  carbohydrates_100g?: number;
  fat_100g?: number;
}

export interface OffProduct {
  code?: string;
  product_name?: string;
  brands?: string;
  serving_quantity?: number | string;
  nutriments?: OffNutriments;
}

const num = (v: number | string | undefined): number | undefined => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};

/**
 * Normalize one OFF product. Returns null when it lacks the minimum we need
 * (a name and a calorie value) — we never fabricate missing nutrition data.
 */
export function normalizeOffProduct(p: OffProduct | null | undefined): FoodItem | null {
  if (!p) return null;
  const name = p.product_name?.trim();
  const kcal = num(p.nutriments?.['energy-kcal_100g']);
  if (!name || kcal === undefined) return null;

  return {
    barcode: p.code,
    name,
    brand: p.brands?.split(',')[0]?.trim() || undefined,
    per100g: {
      kcal,
      proteinG: num(p.nutriments?.proteins_100g) ?? 0,
      carbG: num(p.nutriments?.carbohydrates_100g) ?? 0,
      fatG: num(p.nutriments?.fat_100g) ?? 0,
    },
    servingSizeG: num(p.serving_quantity),
  };
}

/** Normalize an OFF search response (array of products), dropping unusable ones. */
export function normalizeOffSearch(products: OffProduct[] | undefined): FoodItem[] {
  if (!products) return [];
  const out: FoodItem[] = [];
  for (const p of products) {
    const food = normalizeOffProduct(p);
    if (food) out.push(food);
  }
  return out;
}

/** Macros for a given portion in grams, rounded to sensible precision. */
export function scaleMacros(food: FoodItem, grams: number): Macros {
  const factor = grams / 100;
  const round = (n: number): number => Math.round(n * factor * 10) / 10;
  return {
    kcal: Math.round(food.per100g.kcal * factor),
    proteinG: round(food.per100g.proteinG),
    carbG: round(food.per100g.carbG),
    fatG: round(food.per100g.fatG),
  };
}
