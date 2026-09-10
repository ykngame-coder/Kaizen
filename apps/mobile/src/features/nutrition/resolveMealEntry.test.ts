import { describe, expect, it } from 'vitest';
import { resolveMealEntry } from './resolveMealEntry';

const per100 = { kcal: '250', proteinG: '10', carbG: '30', fatG: '8', quantityG: '200' };
const blankPer100 = { kcal: '', proteinG: '', carbG: '', fatG: '', quantityG: '' };
const blankTotal = { kcal: '', proteinG: '', carbG: '', fatG: '' };

describe('resolveMealEntry — mode « par 100 g »', () => {
  it('met les valeurs à l échelle quand la saisie tient debout', () => {
    expect(resolveMealEntry('per100', per100, blankTotal, '')).toEqual({
      ok: true,
      macros: { kcal: 500, proteinG: 20, carbG: 60, fatG: 16 },
    });
  });

  it('accepte une hydratation seule, sans calories ni quantité', () => {
    // Le cas cassé : passer « par 100 g » en mode par défaut interdisait de
    // loguer un verre d'eau, que l'ancien formulaire enregistrait très bien.
    expect(resolveMealEntry('per100', blankPer100, blankTotal, '500')).toEqual({
      ok: true,
      macros: { kcal: 0, proteinG: undefined, carbG: undefined, fatG: undefined },
    });
  });

  it('refuse un aliment dont les calories ou la quantité manquent', () => {
    expect(resolveMealEntry('per100', { ...per100, quantityG: '' }, blankTotal, '')).toEqual({ ok: false });
    expect(resolveMealEntry('per100', { ...blankPer100, quantityG: '200' }, blankTotal, '')).toEqual({ ok: false });
  });
});

describe('resolveMealEntry — mode « total »', () => {
  it('prend les totaux tels quels', () => {
    expect(resolveMealEntry('total', blankPer100, { kcal: '450', proteinG: '30', carbG: '40', fatG: '12' }, '')).toEqual({
      ok: true,
      macros: { kcal: 450, proteinG: 30, carbG: 40, fatG: 12 },
    });
  });

  it('accepte 0 kcal explicitement saisi — c est une affirmation', () => {
    expect(resolveMealEntry('total', blankPer100, { ...blankTotal, kcal: '0' }, '')).toMatchObject({
      ok: true,
      macros: { kcal: 0 },
    });
  });

  it('accepte une hydratation seule', () => {
    expect(resolveMealEntry('total', blankPer100, blankTotal, '500')).toMatchObject({ ok: true, macros: { kcal: 0 } });
  });

  it('refuse des macros SANS calories, au lieu de les enregistrer à 0 en silence', () => {
    // L'incohérence complémentaire : `parseDecimal('')` vaut 0 et passait le
    // schéma, donc un repas sans calories était accepté sans rien dire, alors
    // que le mode /100 g refusait tout.
    expect(resolveMealEntry('total', blankPer100, { ...blankTotal, proteinG: '30' }, '')).toEqual({ ok: false });
  });

  it('refuse une entrée entièrement vide', () => {
    expect(resolveMealEntry('total', blankPer100, blankTotal, '')).toEqual({ ok: false });
    expect(resolveMealEntry('per100', blankPer100, blankTotal, '')).toEqual({ ok: false });
  });

  it('refuse une hydratation nulle ou illisible comme unique contenu', () => {
    expect(resolveMealEntry('total', blankPer100, blankTotal, '0')).toEqual({ ok: false });
    expect(resolveMealEntry('total', blankPer100, blankTotal, 'abc')).toEqual({ ok: false });
  });
});
