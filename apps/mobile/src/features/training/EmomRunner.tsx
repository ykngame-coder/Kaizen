import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { triggerHaptic, useTheme } from '@supotsu/ui';
import { EXERCISE_LIBRARY } from '@supotsu/shared';
import { EXERCISES } from '@/features/exercises/catalog';
import { useCustomExercises } from '@/lib/data/queries';
import { computeEmomState, formatClock } from './blockRunnerEngine';
import { emomMinuteTask } from './runnerState';
import { useRunClock } from './useRunClock';
import { RunnerFocus } from './RunnerFocus';
import type { TimedRunnerProps } from './AmrapRunner';

/**
 * EMOM en direct (Lot 2b) : décompte de la minute en cours, bande des
 * intervalles, et la tâche du top à cocher. Le cochage n'avance pas la minute
 * — seul le chrono le fait ; il bascule l'affichage en repos jusqu'au top
 * suivant.
 */
export function EmomRunner({ block, sets, onFinished }: TimedRunnerProps): React.JSX.Element {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { data: customExercises = [] } = useCustomExercises();
  const clock = useRunClock(block.id);

  const total = block.targetRounds ?? 1;
  const state = computeEmomState(clock.elapsedSec, block.timeCapSec ?? 60, total);
  const [doneMinute, setDoneMinute] = useState<number | undefined>(undefined);

  const exerciseName = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of EXERCISE_LIBRARY) map.set(e.id, e.name);
    for (const e of EXERCISES) map.set(e.id, e.name);
    for (const e of customExercises) map.set(e.id, e.name);
    return (exerciseId: string): string => map.get(exerciseId) ?? exerciseId;
  }, [customExercises]);

  const task = emomMinuteTask(sets, state.currentRound);
  const isResting = doneMinute === state.currentRound;

  // Le cochage vaut pour une minute donnée : au top suivant, il retombe.
  useEffect(() => {
    if (doneMinute !== undefined && doneMinute !== state.currentRound) setDoneMinute(undefined);
  }, [state.currentRound]);

  useEffect(() => {
    if (state.isFinished) {
      triggerHaptic();
      onFinished(total, clock.elapsedSec);
    }
  }, [state.isFinished]);

  return (
    <RunnerFocus
      tag="EMOM"
      title={task ? exerciseName(task.exerciseId) : '—'}
      total={total}
      current={state.currentRound}
      context={t('sport.runner.minuteCounter', { current: state.currentRound, total })}
      value={formatClock(state.displaySec)}
      valueHint={isResting ? t('sport.runner.restUntilMinute', { next: Math.min(total, state.currentRound + 1) }) : t('sport.runner.beforeNextMinute')}
      accent={isResting ? colors.success : undefined}
      // Cocher n'avance pas la minute — seul le chrono le fait. L'action
      // marque donc « c'est fait », et bascule l'affichage en repos.
      actionLabel={t('sport.runner.minuteDone')}
      onAction={() => {
        triggerHaptic();
        setDoneMinute(state.currentRound);
      }}
      actionDisabled={isResting}
      secondaryLabel={clock.isPaused ? t('sport.runner.resumeClock') : t('sport.runner.pause')}
      onSecondary={clock.togglePause}
    />
  );
}
