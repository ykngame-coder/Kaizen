import { describe, expect, it } from 'vitest';
import type { SetEntry } from '@supotsu/core';
import { substituteForLocation } from './circuitRunnerSubstitution';

const set = (over: Partial<SetEntry> & { exerciseId: string }): SetEntry => ({
  id: `s-${over.exerciseId}`,
  workoutId: 'w1',
  order: 0,
  ...over,
});

describe('substituteForLocation', () => {
  it('ne change rien en mode salle, même avec une alternative définie', () => {
    const sets = [set({ exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', homeAlternativeExerciseId: 'Dips_-_Chest_Version' })];
    expect(substituteForLocation(sets, 'gym')).toEqual(sets);
  });

  it('remplace exerciseId par l alternative en mode maison, seulement quand elle existe', () => {
    const sets = [
      set({ exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', order: 0, homeAlternativeExerciseId: 'Dips_-_Chest_Version' }),
      set({ exerciseId: 'Barbell_Squat', order: 1 }),
    ];
    const out = substituteForLocation(sets, 'home');
    expect(out[0]!.exerciseId).toBe('Dips_-_Chest_Version');
    expect(out[1]!.exerciseId).toBe('Barbell_Squat');
  });
});
