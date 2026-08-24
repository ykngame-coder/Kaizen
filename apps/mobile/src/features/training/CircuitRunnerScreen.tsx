import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, EmptyState, Icon, Screen, Text, triggerHaptic, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { EXERCISE_LIBRARY } from '@supotsu/shared';
import { useSetWorkoutStatus, useWorkoutBlocks, useBlockSets, useCompleteBlock, useCustomExercises } from '@/lib/data/queries';
import { computeAmrapState, computeEmomState, computeForTimeState, formatClock } from './blockRunnerEngine';

const FORMAT_COLOR_KEY: Record<string, 'accentStrength' | 'accentEndurance' | 'accentLime'> = {
  amrap: 'accentStrength',
  emom: 'accentEndurance',
  for_time: 'accentLime',
};

/** Live-guided execution for a session's blocks, one at a time — timer + the current block's exercises, advancing automatically when a timed block finishes. */
export function CircuitRunnerScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();

  const FORMAT_LABEL: Record<string, string> = {
    strength: t('sport.circuitRunner.format.strength'),
    amrap: t('sport.circuitRunner.format.amrap'),
    emom: t('sport.circuitRunner.format.emom'),
    for_time: t('sport.circuitRunner.format.forTime'),
  };
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: blocks = [], isLoading } = useWorkoutBlocks(id);
  const { data: customExercises = [] } = useCustomExercises();
  const completeBlock = useCompleteBlock();
  const setWorkoutStatus = useSetWorkoutStatus();

  const exerciseName = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of EXERCISE_LIBRARY) map.set(e.id, e.name);
    for (const e of customExercises) map.set(e.id, e.name);
    return (exerciseId: string): string => map.get(exerciseId) ?? exerciseId;
  }, [customExercises]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [roundsCompleted, setRoundsCompleted] = useState(0);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  const active = blocks[activeIndex];
  const { data: sets = [] } = useBlockSets(active?.id);

  useEffect(() => {
    setElapsedSec(0);
    setRoundsCompleted(0);
  }, [activeIndex]);

  useEffect(() => {
    if (!active || active.format === 'strength') return;
    tick.current = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => {
      if (tick.current) clearInterval(tick.current);
    };
  }, [active?.id, active?.format]);

  const state =
    active?.format === 'amrap'
      ? computeAmrapState(elapsedSec, active.timeCapSec ?? 0, roundsCompleted)
      : active?.format === 'emom'
        ? computeEmomState(elapsedSec, active.timeCapSec ?? 60, active.targetRounds ?? 1)
        : active?.format === 'for_time'
          ? computeForTimeState(elapsedSec, roundsCompleted, active.targetRounds ?? 1)
          : null;

  const finishActiveBlock = async (): Promise<void> => {
    if (!active) return;
    if (tick.current) clearInterval(tick.current);
    if (active.format !== 'strength') {
      await completeBlock.mutateAsync({
        blockId: active.id,
        workoutId: active.workoutId,
        completedRounds: active.format === 'emom' ? active.targetRounds : roundsCompleted,
        resultTimeSec:
          active.format === 'for_time'
            ? elapsedSec
            : active.format === 'amrap'
              ? (active.timeCapSec ?? 0)
              : (active.timeCapSec ?? 0) * (active.targetRounds ?? 0),
      });
    }
    if (activeIndex + 1 < blocks.length) {
      setActiveIndex(activeIndex + 1);
    } else {
      await setWorkoutStatus.mutateAsync({ workoutId: active.workoutId, status: 'completed', completedAt: new Date().toISOString() });
      router.replace({ pathname: '/sport/workout/[id]', params: { id: active.workoutId } });
    }
  };

  useEffect(() => {
    if (state?.isFinished) {
      triggerHaptic();
      void finishActiveBlock();
    }
  }, [state?.isFinished]);

  if (isLoading) {
    return (
      <Screen>
        <Text variant="body" color="textMuted">{t('common.loading')}</Text>
      </Screen>
    );
  }
  if (!active) {
    return (
      <Screen>
        <EmptyState
          icon={<Icon name="dumbbell" size={44} color={colors.textSubtle} />}
          title={t('sport.circuitRunner.notFound.title')}
          message={t('sport.circuitRunner.notFound.message')}
          actionLabel={t('common.back')}
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  const colorKey = FORMAT_COLOR_KEY[active.format];
  const accent = colorKey ? colors[colorKey] : colors.primary;

  return (
    <Screen style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
        <Text variant="heading">{FORMAT_LABEL[active.format]}</Text>
        {blocks.length > 1 ? <Badge label={t('sport.circuitRunner.blockCounter', { current: activeIndex + 1, total: blocks.length })} tone="info" /> : null}
      </View>

      {active.format === 'strength' ? (
        <View style={{ flex: 1, gap: spacing[3] }}>
          <View style={{ gap: spacing[2] }}>
            {sets.map((s) => (
              <Card key={s.id}>
                <Text variant="body" style={{ fontWeight: '700' }}>{exerciseName(s.exerciseId)}</Text>
                <Text variant="caption" color="textSubtle">
                  {s.reps != null ? t('sport.circuitRunner.reps', { reps: s.reps }) : '—'}{s.weightKg != null ? t('sport.circuitRunner.weightSuffix', { weight: s.weightKg }) : ''}
                </Text>
              </Card>
            ))}
          </View>
          <Button label={t('sport.circuitRunner.nextBlock')} onPress={() => void finishActiveBlock()} />
        </View>
      ) : (
        <View style={{ flex: 1, gap: spacing[4] }}>
          <View style={{ alignItems: 'center', gap: spacing[3] }}>
            <Text variant="caption" color="textSubtle">
              {active.format === 'emom'
                ? t('sport.circuitRunner.interval', { current: state!.currentRound, total: active.targetRounds })
                : t('sport.circuitRunner.round', { current: state!.currentRound })}
            </Text>
            <View style={{ width: 224, height: 224, borderRadius: radii.full, borderWidth: 3, borderColor: accent, backgroundColor: `${accent}22`, alignItems: 'center', justifyContent: 'center' }}>
              <Text variant="display">{formatClock(state!.displaySec)}</Text>
            </View>
          </View>
          <View style={{ gap: spacing[2] }}>
            {sets.map((s) => (
              <Card key={s.id}>
                <Text variant="body" style={{ fontWeight: '700' }}>{exerciseName(s.exerciseId)}</Text>
                <Text variant="caption" color="textSubtle">
                  {s.reps != null
                    ? t('sport.circuitRunner.reps', { reps: s.reps })
                    : s.durationSec != null
                      ? t('sport.circuitRunner.durationSec', { sec: s.durationSec })
                      : '—'}
                </Text>
              </Card>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <Button label={t('sport.circuitRunner.stop')} variant="secondary" onPress={() => router.back()} />
            {active.format !== 'emom' ? <Button label={t('sport.circuitRunner.roundDone')} onPress={() => setRoundsCompleted((r) => r + 1)} /> : null}
          </View>
        </View>
      )}
    </Screen>
  );
}
