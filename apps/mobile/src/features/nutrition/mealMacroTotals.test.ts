import { describe, expect, it } from 'vitest';
import { sumMealMacros } from './mealMacroTotals';

const e = (over: Partial<{ proteinG: number; carbG: number; fatG: number }> = {}) => ({
  kcal: 100,
  ...over,
});

describe('sumMealMacros', () => {
  it('additionne les macros du repas', () => {
    expect(sumMealMacros([e({ proteinG: 20, carbG: 30, fatG: 5 }), e({ proteinG: 12, carbG: 15, fatG: 7 })])).toEqual({
      proteinG: 32,
      carbG: 45,
      fatG: 12,
      hasAny: true,
    });
  });

  it('traite une macro absente comme zéro sans effacer les autres', () => {
    expect(sumMealMacros([e({ proteinG: 20 }), e({ carbG: 30 })])).toEqual({
      proteinG: 20,
      carbG: 30,
      fatG: 0,
      hasAny: true,
    });
  });

  it('signale l absence totale de macros, pour ne pas afficher « 0 P · 0 G · 0 L »', () => {
    // Cas courant : une saisie manuelle qui ne renseigne que les calories.
    expect(sumMealMacros([e(), e()])).toMatchObject({ hasAny: false });
  });

  it('considère des macros toutes nulles comme renseignées : c est une information', () => {
    expect(sumMealMacros([e({ proteinG: 0, carbG: 0, fatG: 0 })])).toMatchObject({ hasAny: true });
  });

  it('arrondit à l entier, les décimales n ont pas de sens ici', () => {
    expect(sumMealMacros([e({ proteinG: 10.4, carbG: 0.5, fatG: 2.6 })])).toMatchObject({
      proteinG: 10,
      carbG: 1,
      fatG: 3,
    });
  });

  it('supporte un repas vide', () => {
    expect(sumMealMacros([])).toEqual({ proteinG: 0, carbG: 0, fatG: 0, hasAny: false });
  });
});
