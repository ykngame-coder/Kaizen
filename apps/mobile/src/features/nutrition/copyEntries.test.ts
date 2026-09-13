import { describe, expect, it } from 'vitest';
import type { NutritionEntry } from '@supotsu/core';
import { dayKeyOf } from '@/features/navigation/day';
import {
  copyInputOf,
  dayOffset,
  mealSelectionState,
  movePatchOf,
  retimeToDay,
  toggleMealSelection,
  wheelDayKeys,
} from './copyEntries';

const at = (y: number, m: number, d: number, h: number, mi = 0): string => new Date(y, m - 1, d, h, mi).toISOString();

const entry = (over: Partial<NutritionEntry> = {}): NutritionEntry => ({
  id: 'e1',
  userId: 'u1',
  mealType: 'dinner',
  description: 'Pâtes',
  kcal: 474,
  proteinG: 16,
  carbG: 93,
  fatG: 2,
  quantityG: 130,
  source: 'apple_health',
  loggedAt: at(2026, 6, 28, 20, 14),
  createdAt: at(2026, 6, 28, 20, 14),
  updatedAt: at(2026, 6, 28, 20, 14),
  ...over,
});

describe('retimeToDay', () => {
  it("garde l'heure locale et change le jour", () => {
    const out = new Date(retimeToDay(at(2026, 6, 28, 20, 14), '2026-06-29'));
    expect(dayKeyOf(out)).toBe('2026-06-29');
    expect([out.getHours(), out.getMinutes()]).toEqual([20, 14]);
  });

  it('reste sur le bon jour de part et d autre des deux changements d heure', () => {
    // Dernier dimanche de mars et d'octobre (Europe), deuxième de mars et
    // premier de novembre (Amérique du Nord) : couvre le fuseau de la machine.
    for (const key of ['2026-03-29', '2026-10-25', '2026-03-08', '2026-11-01']) {
      for (const h of [0, 1, 2, 3, 12, 23]) {
        expect(dayKeyOf(retimeToDay(at(2026, 6, 1, h, 30), key))).toBe(key);
      }
    }
  });

  it('juste après minuit reste le jour cible, pas la veille UTC', () => {
    expect(dayKeyOf(retimeToDay(at(2026, 6, 28, 0, 5), '2026-07-02'))).toBe('2026-07-02');
  });
});

describe('copyInputOf', () => {
  it('reprend les grammes — la copie les perdait', () => {
    expect(copyInputOf(entry(), '2026-06-29', 'origin').quantityG).toBe(130);
  });

  it('reprend macros, eau et description', () => {
    const out = copyInputOf(entry({ hydrationMl: 250 }), '2026-06-29', 'origin');
    expect(out).toMatchObject({ description: 'Pâtes', kcal: 474, proteinG: 16, carbG: 93, fatG: 2, hydrationMl: 250 });
  });

  it("« repas d'origine » garde le repas, un repas précis le remplace", () => {
    expect(copyInputOf(entry(), '2026-06-29', 'origin').mealType).toBe('dinner');
    expect(copyInputOf(entry(), '2026-06-29', 'lunch').mealType).toBe('lunch');
  });

  it('marque la copie comme manuelle, quelle que soit la source', () => {
    expect(copyInputOf(entry({ source: 'garmin' }), '2026-06-29', 'origin').source).toBe('manual');
  });

  it('pose la copie sur le jour cible', () => {
    expect(dayKeyOf(copyInputOf(entry(), '2026-07-05', 'origin').loggedAt)).toBe('2026-07-05');
  });
});

describe('movePatchOf', () => {
  it("rend null quand l'aliment est déjà à destination", () => {
    expect(movePatchOf(entry(), '2026-06-28', 'origin')).toBeNull();
    expect(movePatchOf(entry(), '2026-06-28', 'dinner')).toBeNull();
  });

  it("ne touche qu'au repas quand le jour ne change pas", () => {
    expect(movePatchOf(entry(), '2026-06-28', 'lunch')).toEqual({ entryId: 'e1', mealType: 'lunch' });
  });

  it("ne touche qu'à l'heure quand le repas ne change pas", () => {
    const p = movePatchOf(entry(), '2026-06-30', 'origin');
    expect(p?.mealType).toBeUndefined();
    expect(dayKeyOf(p!.loggedAt!)).toBe('2026-06-30');
  });
});

describe('dayOffset', () => {
  it('compte des jours civils, y compris à travers un changement d heure', () => {
    expect(dayOffset('2026-06-29', '2026-06-28')).toBe(-1);
    expect(dayOffset('2026-03-28', '2026-03-30')).toBe(2);
    expect(dayOffset('2026-10-24', '2026-10-26')).toBe(2);
    expect(dayOffset('2025-12-31', '2026-01-01')).toBe(1);
  });
});

describe('wheelDayKeys', () => {
  it('va de 60 jours avant à 7 jours après aujourd hui', () => {
    const keys = wheelDayKeys('2026-06-29', '2026-06-29');
    expect(keys).toHaveLength(68);
    expect(keys[0]).toBe('2026-04-30');
    expect(keys.at(-1)).toBe('2026-07-06');
    expect(keys).toContain('2026-06-28');
  });

  it('s élargit pour contenir un jour d ancrage lointain', () => {
    const keys = wheelDayKeys('2026-06-29', '2026-01-10');
    expect(keys[0]).toBe('2026-01-03');
    expect(keys).toContain('2026-01-10');
    expect(keys.at(-1)).toBe('2026-07-06');
  });

  it('ne saute ni ne double aucun jour', () => {
    const keys = wheelDayKeys('2026-06-29', '2026-06-29', 400, 7);
    for (let i = 1; i < keys.length; i += 1) expect(dayOffset(keys[i - 1]!, keys[i]!)).toBe(1);
  });
});

describe('sélection par repas', () => {
  const ids = ['a', 'b', 'c'];

  it('rend none, some ou all', () => {
    expect(mealSelectionState(ids, new Set())).toBe('none');
    expect(mealSelectionState(ids, new Set(['b']))).toBe('some');
    expect(mealSelectionState(ids, new Set(ids))).toBe('all');
  });

  it('un repas coché en partie se complète', () => {
    expect([...toggleMealSelection(ids, new Set(['b', 'x']))].sort()).toEqual(['a', 'b', 'c', 'x']);
  });

  it('un repas tout coché se vide, sans toucher aux autres repas', () => {
    expect([...toggleMealSelection(ids, new Set(['a', 'b', 'c', 'x']))]).toEqual(['x']);
  });

  it('un repas vide ne se coche pas tout seul', () => {
    expect(mealSelectionState([], new Set(['x']))).toBe('none');
  });
});
