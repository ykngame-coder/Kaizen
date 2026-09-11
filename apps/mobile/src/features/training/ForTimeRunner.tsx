import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { triggerHaptic } from '@supotsu/ui';
import { EXERCISE_LIBRARY } from '@supotsu/shared';
import { EXERCISES } from '@/features/exercises/catalog';
import { useCustomExercises } from '@/lib/data/queries';
import { computeForTimeState, formatClock } from './blockRunnerEngine';
import { useRunClock } from './useRunClock';
import { RunnerFocus } from './RunnerFocus';
import { MovementChecklist } from './MovementChecklist';
import type { TimedRunnerProps } from './AmrapRunner';

/**
 * For Time en direct (Lot 2b) : chrono qui monte, tours à valider, mouvements
 * à cocher. `timeCapSec` — inutilisé par ce format jusqu'ici — sert d'objectif
 * de temps, saisi dans le builder ; rien ne s'affiche s'il est absent.
 */
export function ForTimeRunner({ block, sets, onFinished }: TimedRunnerProps): React.JSX.Element {
  const { t } = useTranslation();
  const { data: customExercises = [] } = useCustomExercises();
  const clock = useRunClock(block.id);

  const total = block.targetRounds ?? 1;
  const [rounds, setRounds] = useState(0);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const state = computeForTimeState(clock.elapsedSec, rounds, total);

  const exerciseName = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of EXERCISE_LIBRARY) map.set(e.id, e.name);
    for (const e of EXERCISES) map.set(e.id, e.name);
    for (const e of customExercises) map.set(e.id, e.name);
    return (exerciseId: string): string => map.get(exerciseId) ?? exerciseId;
  }, [customExercises]);

  useEffect(() => {
    if (state.isFinished) {
      triggerHaptic();
      onFinished(rounds, clock.elapsedSec);
    }
  }, [state.isFinished]);

  const finishRound = (): void => {
    triggerHaptic();
    setRounds((r) => r + 1);
    setTicked({});
  };

  const current = sets.find((x) => !ticked[x.id]) ?? sets[0];

  return (
    <RunnerFocus
      tag={t('sport.sessionBuilder.blockFormat.forTime')}
      title={current ? exerciseName(current.exerciseId) : t('sport.runner.roundDone')}
      total={total}
      current={state.currentRound}
      context={t('sport.runner.elapsed')}
      value={formatClock(clock.elapsedSec)}
      // L'objectif n'apparaît que s'il a été saisi — pas de mention vide.
      valueHint={block.timeCapSec ? t('sport.runner.target', { time: formatClock(block.timeCapSec) }) : undefined}
      actionLabel={t('sport.runner.roundDone')}
      onAction={finishRound}
      secondaryLabel={clock.isPaused ? t('sport.runner.resumeClock') : t('sport.runner.pause')}
      onSecondary={clock.togglePause}
    >
      <MovementChecklist
        sets={sets}
        ticked={ticked}
        onToggle={(id) => setTicked((p) => ({ ...p, [id]: !p[id] }))}
        exerciseName={exerciseName}
      />
    </RunnerFocus>
  );
}
