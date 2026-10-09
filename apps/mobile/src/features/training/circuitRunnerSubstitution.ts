import type { SetEntry } from '@supotsu/core';

/**
 * Substitue l'exercice "maison" quand il existe, en mémoire uniquement —
 * rien n'est réécrit en base, le choix peut changer au prochain lancement.
 */
export function substituteForLocation(sets: SetEntry[], mode: 'gym' | 'home'): SetEntry[] {
  if (mode === 'gym') return sets;
  return sets.map((s) => (s.homeAlternativeExerciseId != null ? { ...s, exerciseId: s.homeAlternativeExerciseId } : s));
}
