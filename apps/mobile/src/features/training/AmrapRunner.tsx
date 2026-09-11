import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { triggerHaptic } from '@supotsu/ui';
import type { SetEntry, WorkoutBlock } from '@supotsu/core';
import { EXERCISE_LIBRARY } from '@supotsu/shared';
import { EXERCISES } from '@/features/exercises/catalog';
import { useCustomExercises } from '@/lib/data/queries';
import { computeAmrapState, formatClock } from './blockRunnerEngine';
import { cadenceSecPerRound } from './runnerState';
import { useRunClock } from './useRunClock';
import { RunnerFocus } from './RunnerFocus';
import { MovementChecklist } from './MovementChecklist';

export interface TimedRunnerProps {
  block: WorkoutBlock;
  sets: SetEntry[];
  onFinished: (roundsCompleted: number, elapsedSec: number) => void;
}

/**
 * AMRAP en direct (Lot 2b) : décompte du plafond, tours réalisés, cadence, et
 * les mouvements du tour à cocher. Les cochages sont éphémères — ils repartent
 * à zéro à chaque tour ; seul le nombre de tours est un résultat durable.
 */
export function AmrapRunner({ block, sets, onFinished }: TimedRunnerProps): React.JSX.Element {
  const { t } = useTranslation();
  const { data: customExercises = [] } = useCustomExercises();
  const clock = useRunClock(block.id);

  const [rounds, setRounds] = useState(0);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});

  const exerciseName = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of EXERCISE_LIBRARY) map.set(e.id, e.name);
    for (const e of EXERCISES) map.set(e.id, e.name);
    for (const e of customExercises) map.set(e.id, e.name);
    return (exerciseId: string): string => map.get(exerciseId) ?? exerciseId;
  }, [customExercises]);

  const state = computeAmrapState(clock.elapsedSec, block.timeCapSec ?? 0, rounds);
  const cadence = cadenceSecPerRound(clock.elapsedSec, rounds);

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

  // Le mouvement en cours = le premier non coché. C'est ce qu'on fait à
  // l'instant, donc ce qui mérite le titre — les autres restent dans la liste.
  const current = sets.find((x) => !ticked[x.id]) ?? sets[0];

  return (
    <RunnerFocus
      tag="AMRAP"
      title={current ? exerciseName(current.exerciseId) : t('sport.runner.roundDone')}
      context={t('sport.runner.remaining')}
      value={formatClock(state.displaySec)}
      valueHint={
        cadence !== undefined
          ? `${t('sport.runner.roundsDone', { done: rounds })} · ${t('sport.runner.cadence', { sec: cadence })}`
          : t('sport.runner.roundsDone', { done: rounds })
      }
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
