import { describe, expect, it } from 'vitest';
import { warmupRamp } from './warmup';

describe('warmupRamp', () => {
  it('produit une rampe 40/60/80 % avec reps dégressives', () => {
    expect(warmupRamp(100, 8)).toEqual([
      { weightKg: 40, reps: 8, percent: 40 },
      { weightKg: 60, reps: 5, percent: 60 },
      { weightKg: 80, reps: 3, percent: 80 },
    ]);
  });

  it('arrondit au pas de 2,5 kg par défaut', () => {
    // 62,5 x 40 % = 25 ; x 60 % = 37,5 ; x 80 % = 50
    expect(warmupRamp(62.5, 8).map((s) => s.weightKg)).toEqual([25, 37.5, 50]);
  });

  it('respecte un pas d’arrondi personnalisé', () => {
    expect(warmupRamp(100, 8, { roundToKg: 5 }).map((s) => s.weightKg)).toEqual([40, 60, 80]);
  });

  it('ne descend jamais une marche à zéro', () => {
    // 5 kg x 40 % = 2 -> arrondi à 2,5 plutôt qu'à 0.
    const ramp = warmupRamp(5, 10);
    expect(ramp.every((s) => s.weightKg > 0)).toBe(true);
  });

  it('retourne une rampe vide pour une charge nulle ou négative', () => {
    expect(warmupRamp(0, 8)).toEqual([]);
    expect(warmupRamp(-20, 8)).toEqual([]);
  });

  it('borne les reps d’échauffement même pour une série de travail très longue', () => {
    expect(warmupRamp(100, 30).map((s) => s.reps)).toEqual([10, 6, 3]);
  });
});
