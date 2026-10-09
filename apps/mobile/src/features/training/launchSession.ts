import type { SetEntry } from '@supotsu/core';

/**
 * True if any set in the session carries a home alternative — the signal
 * `LaunchSessionButton` uses to gate the inline salle/maison choice instead
 * of navigating straight to the runner.
 *
 * Kept in its own plain module, separate from the `.tsx` component: this
 * repo's test runner (plain Vite, no React Native/Flow transform configured
 * — see /vitest.config.ts) cannot load a module that transitively imports
 * `react-native`/`expo-router`, and there is no other precedent in this app
 * for testing a rendered component. Every other piece of testable logic
 * under this feature (`runnerState.ts`, `blockRunnerEngine.ts`,
 * `sessionBuilder.ts`...) follows the same split.
 */
export function hasHomeAlternative(sets: SetEntry[]): boolean {
  return sets.some((s) => s.homeAlternativeExerciseId != null);
}
