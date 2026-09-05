import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, EmptyState, Icon, Screen, Text, triggerHaptic, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { EXERCISE_LIBRARY } from '@supotsu/shared';
import { EXERCISES } from '@/features/exercises/catalog';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useSetWorkoutStatus, useWorkoutBlocks, useBlockSets, useCompleteBlock, useCustomExercises, useWorkouts } from '@/lib/data/queries';
import { clearRunState, loadRunState, saveRunState } from './runStore';
import { formatClock, supersetPartners } from './blockRunnerEngine';
import { StrengthRunner } from './StrengthRunner';
import { AmrapRunner } from './AmrapRunner';
import { EmomRunner } from './EmomRunner';
import { ForTimeRunner } from './ForTimeRunner';
import { BlockTimeline } from './BlockTimeline';

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
    for (const e of EXERCISES) map.set(e.id, e.name);
    for (const e of customExercises) map.set(e.id, e.name);
    return (exerciseId: string): string => map.get(exerciseId) ?? exerciseId;
  }, [customExercises]);

  const { data: workouts = [] } = useWorkouts();

  // L'écran reste allumé pendant la séance — même pattern que SleepTrackingScreen.
  useEffect(() => {
    void activateKeepAwakeAsync();
    return () => {
      void deactivateKeepAwake();
    };
  }, []);

  // Rien ne posait 'in_progress' jusqu'ici : le statut sautait de 'planned' à
  // 'completed', ce qui rendait une séance en cours irrécupérable après une
  // fermeture. On le pose à l'entrée, et on amorce le chrono persistant.
  useEffect(() => {
    if (!id) return;
    const workout = workouts.find((w) => w.id === id);
    if (workout?.status === 'planned') {
      setWorkoutStatus.mutate({ workoutId: id, status: 'in_progress' });
    }
    void (async () => {
      if ((await loadRunState(id)) === null) {
        await saveRunState(id, { startedAtMs: Date.now(), activeBlockIndex: 0 });
      }
    })();
  }, [id, workouts.length]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [roundsCompleted, setRoundsCompleted] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [restCountdown, setRestCountdown] = useState<number | null>(null);
  const [showTimeline, setShowTimeline] = useState(true);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  const active = blocks[activeIndex];
  const { data: sets = [] } = useBlockSets(active?.id);

  useEffect(() => {
    setRoundsCompleted(0);
    setStepIndex(0);
    setRestCountdown(null);
  }, [activeIndex]);

  // A "Musculation" block can optionally repeat as a circuit — no timer
  // (strength has none), just a manual round counter like Pour le temps.
  const repeatRounds = active?.format === 'strength' ? active.targetRounds ?? 1 : undefined;
  const isRepeatingStrength = active?.format === 'strength' && (repeatRounds ?? 1) > 1;
  // A block with any superset-tagged sets steps through its round one
  // exercise at a time (A -> B, no pause) instead of showing every exercise
  // at once — rounds still come from the same targetRounds/roundsCompleted
  // state the plain repeat feature already maintains.
  const hasSuperset = active?.format === 'strength' && sets.some((s) => s.supersetGroup != null);
  // Les formats chronométrés signalent leur propre fin (onFinished) : ici il ne
  // reste que la musculation répétée et les supersets, comptés à la main.
  const isFinished = (isRepeatingStrength || hasSuperset) && roundsCompleted >= (repeatRounds ?? 1);

  useEffect(() => {
    if (restCountdown == null || restCountdown <= 0) return;
    const timerId = setInterval(() => setRestCountdown((s) => (s == null ? null : Math.max(0, s - 1))), 1000);
    return () => clearInterval(timerId);
  }, [restCountdown != null]);

  useEffect(() => {
    if (restCountdown === 0) setRestCountdown(null);
  }, [restCountdown]);

  const advanceSupersetStep = (): void => {
    if (!active) return;
    if (stepIndex + 1 < sets.length) {
      setStepIndex(stepIndex + 1);
      return;
    }
    const nextRounds = roundsCompleted + 1;
    setRoundsCompleted(nextRounds);
    setStepIndex(0);
    const target = repeatRounds ?? 1;
    if (nextRounds < target) {
      setRestCountdown(sets.at(-1)?.restSec ?? 90);
    }
  };

  /** Passe au bloc suivant, ou termine la séance si c'était le dernier. */
  const advanceOrFinish = async (): Promise<void> => {
    if (!active) return;
    if (activeIndex + 1 < blocks.length) {
      setActiveIndex(activeIndex + 1);
      // Retour au fil : on voit ce qui vient d'être bouclé et ce qui reste.
      setShowTimeline(true);
    } else {
      await setWorkoutStatus.mutateAsync({ workoutId: active.workoutId, status: 'completed', completedAt: new Date().toISOString() });
      await clearRunState(active.workoutId);
      router.replace({ pathname: '/sport/workout/[id]', params: { id: active.workoutId } });
    }
  };

  /**
   * Fin d'un bloc chronométré : les tours et le temps viennent de l'écran de
   * format, qui porte désormais sa propre horloge — plus d'état de chrono ici.
   */
  const finishTimedBlock = async (roundsDone: number, elapsed?: number): Promise<void> => {
    if (!active) return;
    await completeBlock.mutateAsync({
      blockId: active.id,
      workoutId: active.workoutId,
      completedRounds: roundsDone,
      resultTimeSec:
        active.format === 'for_time'
          ? elapsed
          : active.format === 'amrap'
            ? (active.timeCapSec ?? 0)
            : (active.timeCapSec ?? 0) * (active.targetRounds ?? 0),
    });
    await advanceOrFinish();
  };

  const finishActiveBlock = async (): Promise<void> => {
    if (!active) return;
    if (tick.current) clearInterval(tick.current);
    if (isRepeatingStrength) {
      await completeBlock.mutateAsync({
        blockId: active.id,
        workoutId: active.workoutId,
        completedRounds: roundsCompleted,
      });
    }
    await advanceOrFinish();
  };

  useEffect(() => {
    if (isFinished) {
      triggerHaptic();
      void finishActiveBlock();
    }
  }, [isFinished]);

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

  // Vue d'ensemble entre les blocs, seulement au-delà d'un bloc : pour un bloc
  // unique elle n'ajouterait qu'une étape sans information.
  if (blocks.length > 1 && showTimeline) {
    return (
      <Screen style={{ flex: 1 }}>
        <BlockTimeline
          workoutName={workouts.find((w) => w.id === id)?.name ?? ''}
          blocks={blocks}
          activeIndex={activeIndex}
          onContinue={() => setShowTimeline(false)}
          onSkip={() => void advanceOrFinish()}
        />
      </Screen>
    );
  }

  return (
    <Screen style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
        <Text variant="heading">{FORMAT_LABEL[active.format]}</Text>
        {blocks.length > 1 ? <Badge label={t('sport.circuitRunner.blockCounter', { current: activeIndex + 1, total: blocks.length })} tone="info" /> : null}
      </View>

      {active.format === 'strength' && !isRepeatingStrength && !hasSuperset ? (
        <StrengthRunner workoutId={active.workoutId} sets={sets} onBlockFinished={() => void finishActiveBlock()} />
      ) : active.format === 'strength' && isRepeatingStrength && !hasSuperset ? (
        <View style={{ flex: 1, gap: spacing[4] }}>
          <View style={{ alignItems: 'center', gap: spacing[3] }}>
            <Text variant="caption" color="textSubtle">
              {t('sport.circuitRunner.round', { current: Math.min(roundsCompleted + 1, repeatRounds ?? 1) })}
            </Text>
            <View style={{ width: 224, height: 224, borderRadius: radii.full, borderWidth: 3, borderColor: accent, backgroundColor: `${accent}22`, alignItems: 'center', justifyContent: 'center' }}>
              <Text variant="display">{roundsCompleted}/{repeatRounds}</Text>
            </View>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: spacing[2] }}>
            {sets.map((s) => (
              <Card key={s.id}>
                <Text variant="body" style={{ fontWeight: '700' }}>{exerciseName(s.exerciseId)}</Text>
                <Text variant="caption" color="textSubtle">
                  {s.reps != null ? t('sport.circuitRunner.reps', { reps: s.reps }) : '—'}{s.weightKg != null ? t('sport.circuitRunner.weightSuffix', { weight: s.weightKg }) : ''}
                </Text>
              </Card>
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <Button label={t('sport.circuitRunner.stop')} variant="secondary" onPress={() => router.back()} />
            <Button label={t('sport.circuitRunner.roundDone')} onPress={() => setRoundsCompleted((r) => r + 1)} />
          </View>
        </View>
      ) : active.format === 'strength' && hasSuperset ? (
        restCountdown != null ? (
          <View style={{ flex: 1, gap: spacing[4], alignItems: 'center', justifyContent: 'center' }}>
            <Text variant="caption" color="textSubtle">{t('sport.circuitRunner.superset.resting')}</Text>
            <View style={{ width: 224, height: 224, borderRadius: radii.full, borderWidth: 3, borderColor: accent, backgroundColor: `${accent}22`, alignItems: 'center', justifyContent: 'center' }}>
              <Text variant="display">{formatClock(restCountdown)}</Text>
            </View>
            <Button label={t('sport.circuitRunner.superset.skipRest')} variant="secondary" onPress={() => setRestCountdown(0)} />
          </View>
        ) : (
          <View style={{ flex: 1, gap: spacing[4] }}>
            <View style={{ alignItems: 'center', gap: spacing[3] }}>
              <Text variant="caption" color="textSubtle">
                {t('sport.circuitRunner.round', { current: Math.min(roundsCompleted + 1, repeatRounds ?? 1) })}
              </Text>
              {(() => {
                const s = sets[stepIndex];
                if (!s) return null;
                const partners = supersetPartners(sets, stepIndex);
                return (
                  <Card style={{ width: '100%' }}>
                    {partners.length > 0 ? <Badge label={t('sport.circuitRunner.superset.withPartner', { name: exerciseName(partners[0]!) })} tone="info" /> : null}
                    <Text variant="heading" style={{ marginTop: spacing[2] }}>{exerciseName(s.exerciseId)}</Text>
                    <Text variant="caption" color="textSubtle">
                      {s.reps != null ? t('sport.circuitRunner.reps', { reps: s.reps }) : '—'}{s.weightKg != null ? t('sport.circuitRunner.weightSuffix', { weight: s.weightKg }) : ''}
                    </Text>
                  </Card>
                );
              })()}
            </View>
            <View style={{ flexDirection: 'row', gap: spacing[3] }}>
              <Button label={t('sport.circuitRunner.stop')} variant="secondary" onPress={() => router.back()} />
              <Button label={t('sport.circuitRunner.superset.itemDone')} onPress={advanceSupersetStep} />
            </View>
          </View>
        )
      ) : active.format === 'amrap' ? (
        <AmrapRunner block={active} sets={sets} onFinished={(r) => void finishTimedBlock(r)} />
      ) : active.format === 'emom' ? (
        <EmomRunner block={active} sets={sets} onFinished={(r) => void finishTimedBlock(r)} />
      ) : (
        <ForTimeRunner block={active} sets={sets} onFinished={(r, e) => void finishTimedBlock(r, e)} />
      )}
    </Screen>
  );
}
