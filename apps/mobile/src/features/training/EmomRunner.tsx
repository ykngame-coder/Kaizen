import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Card, Text, triggerHaptic, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { EXERCISE_LIBRARY } from '@supotsu/shared';
import { EXERCISES } from '@/features/exercises/catalog';
import { useCustomExercises } from '@/lib/data/queries';
import { computeEmomState, formatClock } from './blockRunnerEngine';
import { emomMinuteTask } from './runnerState';
import { useRunClock } from './useRunClock';
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
    <View style={{ flex: 1, gap: spacing[4] }}>
      <View style={{ alignItems: 'center', gap: spacing[2] }}>
        <Text variant="caption" color="textSubtle">
          {t('sport.runner.minuteCounter', { current: state.currentRound, total })}
        </Text>
        <Text variant="display">{formatClock(state.displaySec)}</Text>
        <Text variant="caption" color="textSubtle">{t('sport.runner.beforeNextMinute')}</Text>

        {/* Une pastille par intervalle : faite, en cours, à venir. */}
        <View style={{ flexDirection: 'row', gap: spacing[1], flexWrap: 'wrap', justifyContent: 'center' }}>
          {Array.from({ length: total }, (_, i) => {
            const n = i + 1;
            const color =
              n < state.currentRound ? colors.success : n === state.currentRound ? colors.primary : colors.surfaceElevated;
            return <View key={n} style={{ width: 22, height: 8, borderRadius: 4, backgroundColor: color }} />;
          })}
        </View>
      </View>

      {isResting ? (
        <Card style={{ borderWidth: 1, borderColor: colors.success }}>
          <Text variant="body" style={{ color: colors.success, textAlign: 'center' }}>
            {t('sport.runner.restUntilMinute', { next: Math.min(total, state.currentRound + 1) })}
          </Text>
        </Card>
      ) : (
        <Card>
          <Text variant="caption" color="textSubtle">{t('sport.runner.thisMinute')}</Text>
          <Pressable
            onPress={() => {
              triggerHaptic();
              setDoneMinute(state.currentRound);
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginTop: spacing[2] }}
          >
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                borderWidth: 2,
                borderColor: colors.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            />
            <Text variant="heading">
              {task?.reps != null ? `${task.reps} ` : ''}{task ? exerciseName(task.exerciseId) : '—'}
            </Text>
          </Pressable>
        </Card>
      )}

      <View style={{ flex: 1 }} />

      <View style={{ flexDirection: 'row', gap: spacing[3] }}>
        <Button
          label={clock.isPaused ? t('sport.runner.resumeClock') : t('sport.runner.pause')}
          variant="secondary"
          onPress={clock.togglePause}
        />
        <View style={{ flex: 1 }}>
          <Button
            label={t('sport.runner.minuteDone')}
            onPress={() => {
              triggerHaptic();
              setDoneMinute(state.currentRound);
            }}
            disabled={isResting}
          />
        </View>
      </View>
    </View>
  );
}
