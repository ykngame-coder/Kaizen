import React, { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Card, Text, triggerHaptic, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { EXERCISE_LIBRARY } from '@supotsu/shared';
import { EXERCISES } from '@/features/exercises/catalog';
import { useCustomExercises } from '@/lib/data/queries';
import { computeTabataState, formatClock } from './blockRunnerEngine';
import { emomMinuteTask } from './runnerState';
import { useRunClock } from './useRunClock';
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
    <View style={{ flex: 1, gap: spacing[4] }}>
      <View style={{ alignItems: 'center', gap: spacing[2] }}>
        <Text variant="caption" color="textSubtle">
          {t('sport.runner.tabata.roundCounter', { current: state.currentRound, total })}
        </Text>
        <Text variant="heading" style={{ color: isRest ? colors.success : colors.primary }}>
          {isRest ? t('sport.runner.tabata.rest') : t('sport.runner.tabata.work')}
        </Text>
        <Text variant="display" style={{ color: isRest ? colors.success : colors.text }}>
          {formatClock(state.displaySec)}
        </Text>

        {/* Une pastille par round : fait, en cours, à venir. */}
        <View style={{ flexDirection: 'row', gap: spacing[1], flexWrap: 'wrap', justifyContent: 'center' }}>
          {Array.from({ length: total }, (_, i) => {
            const n = i + 1;
            const color =
              n < state.currentRound ? colors.success : n === state.currentRound ? colors.primary : colors.surfaceElevated;
            return <View key={n} style={{ width: 22, height: 8, borderRadius: 4, backgroundColor: color }} />;
          })}
        </View>
      </View>

      <Card style={isRest ? { borderWidth: 1, borderColor: colors.success } : undefined}>
        <Text variant="caption" color="textSubtle">
          {isRest ? t('sport.runner.tabata.nextUp') : t('sport.runner.tabata.current')}
        </Text>
        <Text variant="heading" style={{ marginTop: spacing[2] }}>
          {isRest
            ? nextTask
              ? exerciseName(nextTask.exerciseId)
              : '—'
            : task
              ? `${task.reps != null ? `${task.reps} ` : ''}${exerciseName(task.exerciseId)}`
              : '—'}
        </Text>
      </Card>

      <View style={{ flex: 1 }} />

      <View style={{ flexDirection: 'row', gap: spacing[3] }}>
        <Button
          label={clock.isPaused ? t('sport.runner.resumeClock') : t('sport.runner.pause')}
          variant="secondary"
          onPress={clock.togglePause}
        />
      </View>
    </View>
  );
}
