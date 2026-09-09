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

/**
 * L'instant auquel évaluer la récupération pour un jour consulté.
 *
 * Le sélecteur de jour porte 23:59:59.999. Pris tel quel pour aujourd'hui, il
 * projette la récupération jusqu'à treize heures en avant et rend chaque muscle
 * plus frais d'un cran que ce que montre l'écran Récupération, qui évalue à
 * maintenant. On borne donc à maintenant : consulter un jour passé garde sa fin
 * de journée, aujourd'hui et demain valent maintenant.
 *
 * PlanningScreen ne passe pas par ici : y projeter la récupération est
 * justement ce qu'on lui demande.
 */
export function recoveryAsOf(selectedDay: string, now: string): string {
  const day = new Date(selectedDay).getTime();
  if (!Number.isFinite(day)) return now;
  return day > new Date(now).getTime() ? now : selectedDay;
}

export function muscleStatesFor(sessions: MuscleSession[], asOf: string): MuscleStatus[] {
  return computeMuscleStates(sessions, asOf);
}
