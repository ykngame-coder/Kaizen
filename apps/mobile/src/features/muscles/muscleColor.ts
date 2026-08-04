import type { MuscleGroup } from '@supotsu/core';
import { computeMuscleStates, type MuscleSession, type MuscleState, type MuscleStatus } from '@supotsu/engines';
import type { useTheme } from '@supotsu/ui';

export const MUSCLE_STATE_LABEL: Record<MuscleState, string> = {
  fatigued: 'Fatigué',
  worked: 'Modéré',
  fresh: 'Bon',
  rested: 'Prêt',
};

export const MUSCLE_STATE_TONE: Record<MuscleState, 'success' | 'info' | 'warning' | 'error'> = {
  fatigued: 'error',
  worked: 'warning',
  fresh: 'success',
  rested: 'info',
};

type ThemeColors = ReturnType<typeof useTheme>['colors'];

/**
 * `MuscleBody`'s `colorFor` — shared between `MusclesScreen` and the Sport
 * hub mini-accueil so the recovery color mapping only lives in one place.
 * Never-trained muscles render transparent (the base body shows through).
 */
export function muscleColorFor(statuses: MuscleStatus[], colors: ThemeColors): (muscle: MuscleGroup) => string {
  const byMuscle = new Map<MuscleGroup, MuscleStatus>(statuses.map((s) => [s.muscle, s]));
  return (muscle: MuscleGroup): string => {
    const status = byMuscle.get(muscle);
    if (!status || status.lastTrainedDaysAgo === null) return 'transparent';
    return colors[MUSCLE_STATE_TONE[status.state]];
  };
}

export function muscleStatesFor(sessions: MuscleSession[], asOf: string): MuscleStatus[] {
  return computeMuscleStates(sessions, asOf);
}
