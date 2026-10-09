import { describe, expect, it } from 'vitest';
import { hasHomeAlternative } from './launchSession';
import type { SetEntry } from '@supotsu/core';

const set = (over: Partial<SetEntry> & { exerciseId: string }): SetEntry => ({
  id: `s-${over.exerciseId}`,
  workoutId: 'w1',
  order: 0,
  ...over,
});

/**
 * `LaunchSessionButton` renders UI (choice card / button), but this codebase
 * has no precedent for testing a rendered component (no `.test.tsx` file and
 * no `@testing-library/react-native` dependency anywhere in the repo) — only
 * pure-function tests. So the gating logic that decides whether to show the
 * salle/maison choice is exported separately and tested here, matching the
 * `sport.workoutDetail.locationChoice` behavior the component implements.
 */
describe('hasHomeAlternative', () => {
  it('est faux quand aucun set n a d alternative maison', () => {
    const sets = [set({ exerciseId: 'Barbell_Squat' })];
    expect(hasHomeAlternative(sets)).toBe(false);
  });

  it('est vrai dès qu un set porte une alternative maison', () => {
    const sets = [
      set({ exerciseId: 'Barbell_Squat' }),
      set({ exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', homeAlternativeExerciseId: 'Dips_-_Chest_Version' }),
    ];
    expect(hasHomeAlternative(sets)).toBe(true);
  });

  it('est faux pour une liste de sets vide', () => {
    expect(hasHomeAlternative([])).toBe(false);
  });
});
