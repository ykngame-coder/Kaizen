import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, Text, triggerHaptic, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import type { SetEntry, WorkoutBlock } from '@supotsu/core';
import { EXERCISE_LIBRARY } from '@supotsu/shared';
import { EXERCISES } from '@/features/exercises/catalog';
import { useCustomExercises } from '@/lib/data/queries';
import { computeAmrapState, formatClock } from './blockRunnerEngine';
import { cadenceSecPerRound } from './runnerState';
import { useRunClock } from './useRunClock';

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
  const { colors } = useTheme();
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

  return (
    <View style={{ flex: 1, gap: spacing[4] }}>
      <View style={{ alignItems: 'center', gap: spacing[2] }}>
        <Text variant="caption" color="textSubtle">{t('sport.runner.remaining')}</Text>
        <Text variant="display">{formatClock(state.displaySec)}</Text>
        <View style={{ flexDirection: 'row', gap: spacing[2] }}>
          <Badge label={t('sport.runner.roundsDone', { done: rounds })} tone="info" />
          {/* Masquée tant qu'aucun tour n'est fini : une moyenne sur zéro ne dit rien. */}
          {cadence !== undefined ? (
            <Badge label={t('sport.runner.cadence', { sec: cadence })} tone="neutral" />
          ) : null}
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: spacing[2] }}>
        {sets.map((s) => {
          const isTicked = !!ticked[s.id];
          return (
            <Pressable key={s.id} onPress={() => setTicked((p) => ({ ...p, [s.id]: !p[s.id] }))}>
              <Card style={{ borderWidth: 1, borderColor: isTicked ? colors.success : colors.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
                  <View
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 7,
                      borderWidth: 2,
                      borderColor: isTicked ? colors.success : colors.border,
                      backgroundColor: isTicked ? colors.success : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {isTicked ? <Text variant="caption" style={{ color: colors.background }}>✓</Text> : null}
                  </View>
                  <Text variant="body" style={{ fontWeight: '700' }}>
                    {s.reps != null ? `${s.reps} ` : ''}{exerciseName(s.exerciseId)}
                  </Text>
                </View>
              </Card>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: spacing[3] }}>
        <Button
          label={clock.isPaused ? t('sport.runner.resumeClock') : t('sport.runner.pause')}
          variant="secondary"
          onPress={clock.togglePause}
        />
        <View style={{ flex: 1 }}>
          <Button label={t('sport.runner.roundDone')} onPress={finishRound} />
        </View>
      </View>
    </View>
  );
}
