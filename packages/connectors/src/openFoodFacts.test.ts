import { describe, expect, it } from 'vitest';
import { normalizeOffProduct, normalizeOffSearch, scaleMacros } from './openFoodFacts';

const product = {
  code: '3017620422003',
  product_name: 'Nutella',
  brands: 'Ferrero, Nutella',
  serving_quantity: 15,
  nutriments: {
    'energy-kcal_100g': 539,
    proteins_100g: 6.3,
    carbohydrates_100g: 57.5,
    fat_100g: 30.9,
  },
};

describe('normalizeOffProduct', () => {
  it('maps an OFF product to a FoodItem with per-100g macros', () => {
    const food = normalizeOffProduct(product);
    expect(food).toMatchObject({
      barcode: '3017620422003',
      name: 'Nutella',
      brand: 'Ferrero', // first brand only
      servingSizeG: 15,
    });
    expect(food?.per100g.kcal).toBe(539);
    expect(food?.per100g.proteinG).toBe(6.3);
  });

  it('returns null without a name or calories', () => {
    expect(normalizeOffProduct({ code: '1', nutriments: { 'energy-kcal_100g': 100 } })).toBeNull();
    expect(normalizeOffProduct({ product_name: 'Mystère' })).toBeNull();
  });

  it('parses stringified numbers and defaults missing macros to 0', () => {
    const food = normalizeOffProduct({
      product_name: 'Riz',
      serving_quantity: '150',
      nutriments: { 'energy-kcal_100g': 130, proteins_100g: 2.7 },
    });
    expect(food?.servingSizeG).toBe(150);
    expect(food?.per100g.carbG).toBe(0);
    expect(food?.per100g.fatG).toBe(0);
  });
});

describe('normalizeOffSearch', () => {
  it('keeps only usable products', () => {
    const foods = normalizeOffSearch([product, { product_name: 'Sans kcal' }, undefined as never]);
    expect(foods).toHaveLength(1);
    expect(foods[0]?.name).toBe('Nutella');
  });
});

describe('scaleMacros', () => {
  it('scales per-100g macros to a portion', () => {
    const food = normalizeOffProduct(product)!;
    const portion = scaleMacros(food, 15); // one serving
    expect(portion.kcal).toBe(81); // 539 * 0.15 = 80.85 → 81
    expect(portion.proteinG).toBe(0.9); // 6.3 * 0.15 = 0.945 → 0.9
  });

  it('is linear (200 g = double the 100 g values)', () => {
    const food = normalizeOffProduct(product)!;
    expect(scaleMacros(food, 200).kcal).toBe(1078);
  });
});
