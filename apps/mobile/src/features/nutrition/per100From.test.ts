import { describe, expect, it } from 'vitest';
import { per100From } from './per100From';

describe('per100From', () => {
  it('retrouve les valeurs pour 100 g depuis les totaux et la quantité', () => {
    // 116,6 kcal pour 80 g → 145,8 kcal / 100 g
    expect(per100From({ kcal: 116.6, proteinG: 8.8, carbG: 14.5, fatG: 2.5 }, 80)).toEqual({
      kcal: '145.8',
      proteinG: '11',
      carbG: '18.1',
      fatG: '3.1',
      quantityG: '80',
    });
  });

  it('rend les totaux tels quels pour exactement 100 g', () => {
    expect(per100From({ kcal: 250, proteinG: 10 }, 100)).toMatchObject({ kcal: '250', proteinG: '10' });
  });

  it('laisse vide un macro absent, sans le transformer en zéro', () => {
    expect(per100From({ kcal: 200 }, 50)).toEqual({
      kcal: '400',
      proteinG: '',
      carbG: '',
      fatG: '',
      quantityG: '50',
    });
  });

  it('refuse une quantité absente, nulle ou négative : rien à diviser', () => {
    expect(per100From({ kcal: 200 }, undefined)).toBeNull();
    expect(per100From({ kcal: 200 }, 0)).toBeNull();
    expect(per100From({ kcal: 200 }, -50)).toBeNull();
  });

  it('arrondit à une décimale, comme la saisie', () => {
    expect(per100From({ kcal: 100 }, 33)?.kcal).toBe('303');
  });

  it('fait l aller-retour : remettre la même quantité redonne les totaux', () => {
    const totals = { kcal: 116.6, proteinG: 8.8, carbG: 14.5, fatG: 2.5 };
    const p = per100From(totals, 80)!;
    const back = (v: string): number => Math.round(((Number(v) * 80) / 100) * 10) / 10;
    expect(back(p.kcal)).toBeCloseTo(totals.kcal, 1);
    expect(back(p.proteinG)).toBeCloseTo(totals.proteinG, 1);
  });
});
