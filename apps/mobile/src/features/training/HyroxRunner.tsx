import React, { useEffect, useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text, triggerHaptic, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { EXERCISE_LIBRARY } from '@supotsu/shared';
import { EXERCISES } from '@/features/exercises/catalog';
import { useCustomExercises, useLogSet } from '@/lib/data/queries';
import { computeHyroxStationState, formatClock } from './blockRunnerEngine';
import { useRunClock } from './useRunClock';
import { RunnerFocus } from './RunnerFocus';
import type { TimedRunnerProps } from './AmrapRunner';

/**
 * Hyrox en direct : stations enchaînées sans repos, chacune avec son propre
 * chrono (chronomètre pour une station distance, décompte pour une station
 * temps) et sa propre saisie du réalisé — cycle `work` → `log`, comme la
 * Musculation, pas un chrono unique sur tout le bloc comme Pour le temps.
 */
export function HyroxRunner({ block, sets, onFinished }: TimedRunnerProps): React.JSX.Element {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { data: customExercises = [] } = useCustomExercises();
  const logSet = useLogSet();

  const ordered = useMemo(() => [...sets].sort((a, b) => a.order - b.order), [sets]);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeSet = ordered[activeIndex];
  const [phase, setPhase] = useState<'work' | 'log'>('work');
  const [totalSec, setTotalSec] = useState(0);
  // Capturé au moment où une station distance est arrêtée manuellement — la
  // phase log affiche ce temps figé, pas le chrono qui continue de tourner.
  const [stationResultSec, setStationResultSec] = useState(0);
  const [distanceDraft, setDistanceDraft] = useState('');
  const [weightDraft, setWeightDraft] = useState('');

  const clock = useRunClock(activeSet?.id);
  const isTimeMode = activeSet?.durationSec != null;
  const state = activeSet ? computeHyroxStationState(clock.elapsedSec, activeSet) : undefined;

  useEffect(() => {
    setPhase('work');
    setDistanceDraft('');
    setWeightDraft(activeSet?.weightKg != null ? String(activeSet.weightKg) : '');
  }, [activeSet?.id]);

  useEffect(() => {
    if (state?.isFinished && phase === 'work') {
      triggerHaptic();
      setStationResultSec(activeSet?.durationSec ?? 0);
      setPhase('log');
    }
  }, [state?.isFinished, phase]);

  useEffect(() => {
    if (!activeSet && ordered.length > 0) onFinished(ordered.length, totalSec);
  }, [activeSet]);

  const exerciseName = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of EXERCISE_LIBRARY) map.set(e.id, e.name);
    for (const e of EXERCISES) map.set(e.id, e.name);
    for (const e of customExercises) map.set(e.id, e.name);
    return (exerciseId: string): string => map.get(exerciseId) ?? exerciseId;
  }, [customExercises]);

  if (!activeSet) {
    return <RunnerFocus title={t('sport.runner.allDone')} value="✓" actionLabel={t('sport.runner.validate')} onAction={() => onFinished(ordered.length, totalSec)} />;
  }

  const finishWork = (): void => {
    triggerHaptic();
    setStationResultSec(clock.elapsedSec);
    setPhase('log');
  };

  const finishStation = (): void => {
    const resultSec = isTimeMode ? (activeSet.durationSec ?? 0) : stationResultSec;
    logSet.mutate({
      setId: activeSet.id,
      workoutId: block.workoutId,
      done: {
        distanceM: isTimeMode ? (distanceDraft ? Number(distanceDraft) : undefined) : undefined,
        durationSec: isTimeMode ? undefined : resultSec,
        weightKg: weightDraft ? Number(weightDraft) : undefined,
        completedAt: new Date().toISOString(),
      },
    });
    setTotalSec((t) => t + resultSec);
    setActiveIndex((i) => i + 1);
  };

  if (phase === 'work') {
    return (
      <RunnerFocus
        tag="Hyrox"
        title={exerciseName(activeSet.exerciseId)}
        total={ordered.length}
        current={activeIndex + 1}
        context={isTimeMode ? t('sport.runner.remaining') : t('sport.runner.elapsed')}
        value={formatClock(state!.displaySec)}
        valueHint={!isTimeMode && activeSet.distanceM != null ? t('sport.runner.hyroxTargetDistance', { distance: activeSet.distanceM }) : undefined}
        actionLabel={isTimeMode ? t('sport.runner.hyroxInProgress') : t('sport.runner.hyroxDistanceReached')}
        onAction={isTimeMode ? () => undefined : finishWork}
        actionDisabled={isTimeMode}
        // Un imprévu en pleine station ne doit pas fausser le chrono : la
        // pause gèle aussi bien le décompte d'une station en temps que le
        // chronomètre d'une station en distance.
        secondaryLabel={clock.isPaused ? t('sport.runner.resumeClock') : t('sport.runner.pause')}
        onSecondary={clock.togglePause}
      />
    );
  }

  return (
    <RunnerFocus
      tag="Hyrox"
      title={exerciseName(activeSet.exerciseId)}
      total={ordered.length}
      current={activeIndex + 1}
      context={t('sport.runner.hyroxLogContext')}
      value={formatClock(resultSecForDisplay(isTimeMode, activeSet.durationSec, stationResultSec))}
      actionLabel={t('sport.runner.saveAndContinue')}
      onAction={finishStation}
    >
      {isTimeMode ? (
        <View style={{ marginBottom: spacing[3] }}>
          <Text variant="label" color="textMuted" style={{ marginBottom: spacing[2] }}>{t('sport.runner.hyroxDistanceA11y')}</Text>
          <TextInput
            value={distanceDraft}
            onChangeText={setDistanceDraft}
            keyboardType="numeric"
            accessibilityLabel={t('sport.runner.hyroxDistanceA11y')}
            style={{ color: colors.text, fontSize: 22, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, paddingVertical: spacing[3], textAlign: 'center' }}
          />
        </View>
      ) : null}
      <View>
        <Text variant="label" color="textMuted" style={{ marginBottom: spacing[2] }}>{t('sport.runner.weightA11y')}</Text>
        <TextInput
          value={weightDraft}
          onChangeText={setWeightDraft}
          keyboardType="numeric"
          accessibilityLabel={t('sport.runner.weightA11y')}
          style={{ color: colors.text, fontSize: 22, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, paddingVertical: spacing[3], textAlign: 'center' }}
        />
      </View>
    </RunnerFocus>
  );
}

function resultSecForDisplay(isTimeMode: boolean, durationSec: number | undefined, stationResultSec: number): number {
  return isTimeMode ? (durationSec ?? 0) : stationResultSec;
}
