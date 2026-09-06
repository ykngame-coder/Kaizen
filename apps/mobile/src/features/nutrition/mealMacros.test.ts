import { describe, expect, it } from 'vitest';
import { parseDecimal, scalePer100 } from './mealMacros';

describe('parseDecimal', () => {
  it('accepte la virgule décimale du clavier français', () => {
    expect(parseDecimal('12,5')).toBe(12.5);
    expect(parseDecimal(' 12.5 ')).toBe(12.5);
  });
});

describe('scalePer100', () => {
  const per100 = { kcal: '250', proteinG: '10', carbG: '30', fatG: '8' };

  it('met les valeurs à l échelle de la quantité', () => {
    expect(scalePer100({ ...per100, quantityG: '200' })).toEqual({
      kcal: 500,
      proteinG: 20,
      carbG: 60,
      fatG: 16,
    });
  });

  it('gère une quantité inférieure à 100 g', () => {
    expect(scalePer100({ ...per100, quantityG: '50' })).toEqual({
      kcal: 125,
      proteinG: 5,
      carbG: 15,
      fatG: 4,
    });
  });

  it('arrondit à une décimale', () => {
    // 33 g de 250 kcal/100 g = 82,5 kcal
    expect(scalePer100({ ...per100, quantityG: '33' })?.kcal).toBe(82.5);
    expect(scalePer100({ kcal: '77', proteinG: '', carbG: '', fatG: '', quantityG: '37' })?.kcal).toBe(28.5);
  });

  it('accepte les virgules dans les valeurs comme dans la quantité', () => {
    expect(scalePer100({ kcal: '89,5', proteinG: '', carbG: '', fatG: '', quantityG: '150,5' })?.kcal).toBe(134.7);
  });

  it('laisse indéfini un macro non renseigné, sans le transformer en zéro', () => {
    const out = scalePer100({ kcal: '250', proteinG: '', carbG: '  ', fatG: '8', quantityG: '100' });
    expect(out).toEqual({ kcal: 250, proteinG: undefined, carbG: undefined, fatG: 8 });
  });

  it('refuse une quantité nulle, négative, vide ou illisible', () => {
    for (const quantityG of ['0', '-50', '', '   ', 'abc']) {
      expect(scalePer100({ ...per100, quantityG })).toBeNull();
    }
  });

  it('refuse des calories illisibles : sans elles l entrée n a pas de sens', () => {
    expect(scalePer100({ kcal: '', proteinG: '', carbG: '', fatG: '', quantityG: '100' })).toBeNull();
  });
});
