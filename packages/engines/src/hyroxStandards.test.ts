import { describe, expect, it } from 'vitest';
import { standardSledWeightKg, withStandardSledWeights } from './hyroxStandards';

describe('standardSledWeightKg', () => {
  it('donne les charges Open, poussée et tirage, selon le sexe', () => {
    expect(standardSledWeightKg('Sled_Push', 'male')).toBe(102);
    expect(standardSledWeightKg('Sled_Push', 'female')).toBe(52);
    expect(standardSledWeightKg('Sled Pull', 'male')).toBe(103);
    expect(standardSledWeightKg('Sled Pull', 'female')).toBe(78);
  });

  it('ne suppose rien quand le sexe n est pas renseigné', () => {
    expect(standardSledWeightKg('Sled_Push', 'unspecified')).toBeUndefined();
    expect(standardSledWeightKg('Sled_Push', undefined)).toBeUndefined();
  });

  it('ne s applique qu au traîneau', () => {
    expect(standardSledWeightKg('ex-burpee', 'male')).toBeUndefined();
  });
});

describe('withStandardSledWeights', () => {
  const sets = [
    { exerciseId: 'Sled_Push', order: 0, distanceM: 10 },
    { exerciseId: 'Sled Pull', order: 1, distanceM: 10, weightKg: 100 },
    { exerciseId: 'ex-burpee', order: 2, reps: 10 },
  ];

  it('complète la charge manquante sans toucher à celle du coach', () => {
    const out = withStandardSledWeights(sets, 'male');
    expect(out[0]!.weightKg).toBe(102);
    expect(out[1]!.weightKg).toBe(100); // 100 kg voulus par le coach, on n'y touche pas
    expect(out[2]!.weightKg).toBeUndefined();
  });

  it('laisse tout en l état pour un profil sans sexe renseigné', () => {
    expect(withStandardSledWeights(sets, 'unspecified')).toEqual(sets);
  });
});
