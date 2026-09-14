import { describe, expect, it } from 'vitest';
import { ACTIVITY_MUSCLE_PROFILES, activityMuscleLoad, profileFor } from './activityMuscles';

describe('profileFor', () => {
  it('rend le profil du type d activité', () => {
    expect(profileFor({ type: 'running' })).toEqual({
      primary: ['quads', 'hamstrings', 'glutes', 'calves'],
      secondary: ['core'],
      weight: 'normal',
    });
  });

  it('pour « autre », s appuie sur le nom donné par Apple Santé', () => {
    expect(profileFor({ type: 'other', notes: 'Randonnée' })?.primary).toEqual(['quads', 'glutes', 'calves']);
    expect(profileFor({ type: 'other', notes: 'Montée d’escaliers' })?.primary).toEqual(['quads', 'glutes', 'calves']);
  });

  it('ne préremplit rien quand seul l utilisateur sait', () => {
    expect(profileFor({ type: 'strength' })).toBeNull();
    expect(profileFor({ type: 'cross_training' })).toBeNull();
    expect(profileFor({ type: 'other' })).toBeNull();
    expect(profileFor({ type: 'other', notes: 'Cardio mixte' })).toBeNull();
    expect(profileFor({ type: 'other', notes: 'Un nom inconnu' })).toBeNull();
  });

  it('garde le poids de la table', () => {
    expect(profileFor({ type: 'walking' })?.weight).toBe('light');
    expect(profileFor({ type: 'other', notes: 'Golf' })?.weight).toBe('light');
  });

  it('chaque profil n utilise que des groupes musculaires connus, sans doublon', () => {
    const known = new Set(['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core', 'full_body']);
    for (const [key, p] of Object.entries(ACTIVITY_MUSCLE_PROFILES)) {
      const all = [...p.primary, ...p.secondary];
      expect(all.every((m) => known.has(m)), key).toBe(true);
      expect(new Set(all).size, key).toBe(all.length);
    }
  });
});

describe('activityMuscleLoad', () => {
  const run = { type: 'running' as const };

  it('45 min à intensité modérée pèse une séance', () => {
    expect(activityMuscleLoad({ ...run, durationSec: 45 * 60, intensity: 'moderate' })).toBeCloseTo(1);
  });

  it('pondère par la durée, bornée entre un quart et deux séances', () => {
    expect(activityMuscleLoad({ ...run, durationSec: 33 * 60 })).toBeCloseTo(33 / 45);
    expect(activityMuscleLoad({ ...run, durationSec: 5 * 60 })).toBeCloseTo(0.25);
    expect(activityMuscleLoad({ ...run, durationSec: 4 * 3600 })).toBeCloseTo(2);
  });

  it('pondère par l intensité quand elle est connue', () => {
    const base = activityMuscleLoad({ ...run, durationSec: 45 * 60 });
    expect(activityMuscleLoad({ ...run, durationSec: 45 * 60, intensity: 'low' })).toBeLessThan(base);
    expect(activityMuscleLoad({ ...run, durationSec: 45 * 60, intensity: 'max' })).toBeGreaterThan(base);
  });

  it('applique le poids du type : une marche pèse bien moins qu une course de même durée', () => {
    const walk = activityMuscleLoad({ type: 'walking', durationSec: 45 * 60 });
    expect(walk).toBeCloseTo(0.4);
  });

  it('un type sans profil pèse normalement — c est le cas des activités taguées à la main', () => {
    expect(activityMuscleLoad({ type: 'strength', durationSec: 45 * 60 })).toBeCloseTo(1);
  });
});
