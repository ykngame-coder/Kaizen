import React, { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { triggerHaptic, useTheme } from '@supotsu/ui';
import { EXERCISE_LIBRARY } from '@supotsu/shared';
import { EXERCISES } from '@/features/exercises/catalog';
import { useCustomExercises } from '@/lib/data/queries';
import { computeTabataState, formatClock } from './blockRunnerEngine';
import { emomMinuteTask } from './runnerState';
import { useRunClock } from './useRunClock';
import { RunnerFocus } from './RunnerFocus';
import type { TimedRunnerProps } from './AmrapRunner';

const DEFAULT_WORK_SEC = 20;
const DEFAULT_REST_SEC = 10;

/**
 * Tabata en direct : travail et repos s'enchaînent tout seuls, le chrono seul
 * fait avancer les rounds — rien à cocher, contrairement à l'EMOM.
 *
 * La rotation des exercices réutilise `emomMinuteTask` : un round prend
 * l'exercice suivant de la liste, exactement comme une minute d'EMOM, plutôt
 * que d'inventer une seconde règle de rotation.
 */
export function TabataRunner({ block, sets, onFinished }: TimedRunnerProps): React.JSX.Element {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { data: customExercises = [] } = useCustomExercises();
  const clock = useRunClock(block.id);

  const total = block.targetRounds ?? 1;
  const workSec = block.timeCapSec ?? DEFAULT_WORK_SEC;
  const restSec = block.restSec ?? DEFAULT_REST_SEC;
  const state = computeTabataState(clock.elapsedSec, workSec, restSec, total);

  const exerciseName = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of EXERCISE_LIBRARY) map.set(e.id, e.name);
    for (const e of EXERCISES) map.set(e.id, e.name);
    for (const e of customExercises) map.set(e.id, e.name);
    return (exerciseId: string): string => map.get(exerciseId) ?? exerciseId;
  }, [customExercises]);

  const isRest = state.phase === 'rest';
  const task = emomMinuteTask(sets, state.currentRound);
  // L'exercice du round suivant, annoncé pendant le repos.
  const nextTask = emomMinuteTask(sets, Math.min(total, state.currentRound + 1));

  // Une vibration à chaque bascule, pour ne pas avoir à regarder l'écran.
  const lastPhase = useRef<string | undefined>(undefined);
  useEffect(() => {
    const key = `${state.currentRound}:${state.phase}`;
    if (lastPhase.current !== undefined && lastPhase.current !== key) triggerHaptic();
    lastPhase.current = key;
  }, [state.currentRound, state.phase]);

  useEffect(() => {
    if (state.isFinished) {
      triggerHaptic();
      onFinished(total, clock.elapsedSec);
    }
  }, [state.isFinished]);

  return (
    <RunnerFocus
      tag={isRest ? t('sport.runner.tabata.rest') : t('sport.runner.tabata.work')}
      title={
        isRest
          ? nextTask
            ? exerciseName(nextTask.exerciseId)
            : '—'
          : task
            ? exerciseName(task.exerciseId)
            : '—'
      }
      total={total}
      current={state.currentRound}
      context={t('sport.runner.tabata.roundCounter', { current: state.currentRound, total })}
      value={formatClock(state.displaySec)}
      // Pendant le repos on annonce ce qui arrive : c'est l'information utile
      // à cet instant, pas ce qu'on vient de finir.
      valueHint={isRest ? t('sport.runner.tabata.nextUp') : task?.reps != null ? String(task.reps) : undefined}
      accent={isRest ? colors.success : undefined}
      actionLabel={clock.isPaused ? t('sport.runner.resumeClock') : t('sport.runner.pause')}
      onAction={clock.togglePause}
    />
  );
}
