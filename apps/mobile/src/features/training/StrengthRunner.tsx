import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Card, ProgressRing, Text, triggerHaptic, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { SetEntry } from '@supotsu/core';
import { computePlates } from '@supotsu/engines';
import { EXERCISE_LIBRARY } from '@supotsu/shared';
import { EXERCISES } from '@/features/exercises/catalog';
import { useClearSetLog, useCustomExercises, useExerciseHistory, useLogSet } from '@/lib/data/queries';
import { usePreferences } from '@/lib/preferences';
import { buildRunProgress, restRemainingSec } from './runnerState';
import { formatClock } from './blockRunnerEngine';

const EFFORT_VALUES = [7, 8, 9, 10];

export interface StrengthRunnerProps {
  workoutId: string;
  sets: SetEntry[];
  /** Called once every set of the block is done. */
  onBlockFinished: () => void;
}

/**
 * Suivi d'un bloc de musculation, série par série (Lot 2a) : on coche, on
 * saisit ce qu'on a réellement fait, et le prévu reste intact en base
 * (`planned_*` n'est jamais réécrit).
 */
export function StrengthRunner({ workoutId, sets, onBlockFinished }: StrengthRunnerProps): React.JSX.Element {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { preferences } = usePreferences();
  const { data: customExercises = [] } = useCustomExercises();
  const { data: history = {} } = useExerciseHistory();
  const logSet = useLogSet();
  const clearSetLog = useClearSetLog();

  const exerciseName = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of EXERCISE_LIBRARY) map.set(e.id, e.name);
    for (const e of EXERCISES) map.set(e.id, e.name);
    for (const e of customExercises) map.set(e.id, e.name);
    return (exerciseId: string): string => map.get(exerciseId) ?? exerciseId;
  }, [customExercises]);

  const ordered = useMemo(() => [...sets].sort((a, b) => a.order - b.order), [sets]);
  const progress = useMemo(() => buildRunProgress(ordered), [ordered]);
  const activeSet = ordered.find((s) => s.id === progress.activeSetId);

  // Saisie locale de la série active — initialisée depuis le prévu, remise à
  // jour dès que la série active change.
  const [repsDraft, setRepsDraft] = useState('');
  const [weightDraft, setWeightDraft] = useState('');
  const [effort, setEffort] = useState<number | undefined>(undefined);

  useEffect(() => {
    setRepsDraft(activeSet?.reps != null ? String(activeSet.reps) : '');
    setWeightDraft(activeSet?.weightKg != null ? String(activeSet.weightKg) : '');
    setEffort(undefined);
  }, [activeSet?.id]);

  useEffect(() => {
    if (progress.isFinished) onBlockFinished();
  }, [progress.isFinished]);

  const previous = useMemo(() => {
    if (!progress.activeExerciseId) return undefined;
    const last = history[progress.activeExerciseId];
    if (!last || last.length === 0) return undefined;
    const top = [...last].sort((a, b) => (b.weightKg ?? 0) - (a.weightKg ?? 0))[0]!;
    if (top.weightKg == null || top.reps == null) return undefined;
    return { weightKg: top.weightKg, reps: top.reps };
  }, [history, progress.activeExerciseId]);

  // Repos : on retient l'échéance, jamais un compteur décrémenté — iOS suspend
  // les timers en arrière-plan et un compteur prendrait du retard en silence.
  const [restEndsAtMs, setRestEndsAtMs] = useState<number | undefined>(undefined);
  const [restTotalSec, setRestTotalSec] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const buzzedRef = useRef(false);

  useEffect(() => {
    if (restEndsAtMs === undefined) return;
    const id = setInterval(() => setNowMs(Date.now()), 500);
    return () => clearInterval(id);
  }, [restEndsAtMs]);

  const restLeft = restRemainingSec(restEndsAtMs, nowMs);

  useEffect(() => {
    if (restEndsAtMs === undefined || restLeft > 0 || buzzedRef.current) return;
    buzzedRef.current = true;
    triggerHaptic();
  }, [restLeft, restEndsAtMs]);

  const validate = (): void => {
    if (!activeSet) return;
    logSet.mutate({
      setId: activeSet.id,
      workoutId,
      done: {
        reps: repsDraft ? Number(repsDraft) : undefined,
        weightKg: weightDraft ? Number(weightDraft) : undefined,
        rpe: preferences.effortMetric === 'rpe' ? effort : undefined,
        rir: preferences.effortMetric === 'rir' ? effort : undefined,
        completedAt: new Date().toISOString(),
      },
    });
    const restSec = activeSet.restSec ?? preferences.defaultRestSec;
    buzzedRef.current = false;
    setRestTotalSec(restSec);
    setNowMs(Date.now());
    setRestEndsAtMs(Date.now() + restSec * 1000);
  };

  const plates = useMemo(() => {
    const weight = weightDraft ? Number(weightDraft) : activeSet?.weightKg;
    if (!weight || !Number.isFinite(weight)) return undefined;
    const solution = computePlates(weight, preferences.barWeightKg, preferences.availablePlates);
    return solution ? { ...solution, requestedKg: weight } : undefined;
  }, [weightDraft, activeSet?.weightKg, preferences.barWeightKg, preferences.availablePlates]);

  return (
    <View style={{ flex: 1, gap: spacing[3] }}>
      <View>
        <Text variant="heading">
          {progress.activeExerciseId ? exerciseName(progress.activeExerciseId) : t('sport.runner.allDone')}
        </Text>
        {progress.activeExerciseId ? (
          <Text variant="caption" color="textSubtle">
            {t('sport.runner.setCounter', {
              done: progress.activeSetIndexInExercise + 1,
              total: progress.workingSetsInExercise,
            })}
          </Text>
        ) : null}
        {/* Ligne omise plutôt qu'un tiret quand l'exercice n'a pas d'historique. */}
        {previous ? (
          <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
            {t('sport.runner.previous', { weight: previous.weightKg, reps: previous.reps })}
          </Text>
        ) : null}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: spacing[2] }}>
        {ordered.map((s, index) => {
          const isActive = s.id === progress.activeSetId;
          const isDone = !!s.completedAt;
          return (
            <Card
              key={s.id}
              style={{
                borderWidth: isActive ? 2 : 1,
                borderColor: isActive ? colors.primary : colors.border,
                backgroundColor: isDone ? colors.surfaceElevated : colors.surface,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isDone }}
                  accessibilityLabel={t('sport.runner.toggleSetA11y', { n: index + 1 })}
                  onPress={() => (isDone ? clearSetLog.mutate({ setId: s.id, workoutId }) : undefined)}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 7,
                    borderWidth: 2,
                    borderColor: isDone ? colors.success : colors.border,
                    backgroundColor: isDone ? colors.success : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {isDone ? <Text variant="caption" style={{ color: colors.background }}>✓</Text> : null}
                </Pressable>

                <Text variant="caption" color={s.isWarmup ? 'warning' : 'textSubtle'} style={{ width: 76 }}>
                  {s.isWarmup ? t('sport.runner.warmup') : String(index + 1)}
                </Text>

                {isActive ? (
                  <>
                    <TextInput
                      value={repsDraft}
                      onChangeText={setRepsDraft}
                      keyboardType="numeric"
                      accessibilityLabel={t('sport.runner.repsA11y')}
                      style={{ flex: 1, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing[2], paddingVertical: spacing[1], textAlign: 'center' }}
                    />
                    <TextInput
                      value={weightDraft}
                      onChangeText={setWeightDraft}
                      keyboardType="numeric"
                      accessibilityLabel={t('sport.runner.weightA11y')}
                      style={{ flex: 1, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing[2], paddingVertical: spacing[1], textAlign: 'center' }}
                    />
                  </>
                ) : (
                  <Text variant="body" color="textMuted" style={{ flex: 2 }}>
                    {s.reps != null ? t('sport.circuitRunner.reps', { reps: s.reps }) : '—'}
                    {s.weightKg != null ? t('sport.circuitRunner.weightSuffix', { weight: s.weightKg }) : ''}
                  </Text>
                )}
              </View>

              {isActive ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: spacing[3] }}>
                  <Text variant="caption" color="textMuted">{t('sport.runner.effort')}</Text>
                  {EFFORT_VALUES.map((v) => (
                    <Pressable
                      key={v}
                      onPress={() => setEffort(v === effort ? undefined : v)}
                      style={{
                        paddingHorizontal: spacing[3],
                        paddingVertical: spacing[1],
                        borderRadius: radii.md,
                        backgroundColor: effort === v ? colors.primary : colors.surfaceElevated,
                      }}
                    >
                      <Text variant="caption" style={{ color: effort === v ? colors.background : colors.text }}>{v}</Text>
                    </Pressable>
                  ))}
                  <Text variant="caption" color="textSubtle" style={{ marginLeft: 'auto' }}>
                    {preferences.effortMetric === 'rir' ? t('sport.runner.rir') : t('sport.runner.rpe')}
                  </Text>
                </View>
              ) : null}
            </Card>
          );
        })}
      </ScrollView>

      {restEndsAtMs !== undefined && restLeft > 0 ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
            <View style={{ alignItems: 'center', justifyContent: 'center' }}>
              <ProgressRing
                value={restTotalSec > 0 ? ((restTotalSec - restLeft) / restTotalSec) * 100 : 0}
                size={72}
              />
              <View style={{ position: 'absolute' }}>
                <Text variant="caption" style={{ fontWeight: '700' }}>{formatClock(restLeft)}</Text>
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="body" style={{ fontWeight: '700' }}>{t('sport.runner.resting')}</Text>
              <Text variant="caption" color="textSubtle">{t('sport.runner.restAuto')}</Text>
            </View>
            <View style={{ gap: spacing[2] }}>
              <Button
                label={t('sport.runner.restPlus15')}
                variant="secondary"
                onPress={() => setRestEndsAtMs((e) => (e === undefined ? e : e + 15_000))}
              />
              <Button
                label={t('sport.runner.restSkip')}
                variant="secondary"
                onPress={() => setRestEndsAtMs(undefined)}
              />
            </View>
          </View>
        </Card>
      ) : null}

      {/* Masquée sans charge chargeable : haltères et poids du corps n'ont pas de disques. */}
      {plates ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Text variant="body" style={{ fontWeight: '700' }}>
              {t('sport.runner.plates', { weight: plates.achievedKg })}
            </Text>
            <Text variant="caption" color="textSubtle">
              {t('sport.runner.platesBar', { bar: preferences.barWeightKg })}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[2] }}>
            {plates.perSide.length === 0 ? (
              <Text variant="caption" color="textMuted">{t('sport.runner.platesBarOnly')}</Text>
            ) : (
              plates.perSide.map((p) => (
                <View
                  key={p.plateKg}
                  style={{ paddingHorizontal: spacing[3], paddingVertical: spacing[1], borderRadius: radii.full, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border }}
                >
                  <Text variant="caption">{p.count > 1 ? `${p.plateKg} × ${p.count}` : `${p.plateKg}`}</Text>
                </View>
              ))
            )}
          </View>
          {/* La cible n'est pas toujours chargeable avec les disques déclarés : le dire. */}
          {Math.abs(plates.achievedKg - plates.requestedKg) > 0.01 ? (
            <Text variant="caption" color="warning" style={{ marginTop: spacing[2] }}>
              {t('sport.runner.platesApprox', { requested: plates.requestedKg, achieved: plates.achievedKg })}
            </Text>
          ) : null}
        </Card>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        {progress.nextExerciseId ? (
          <Text variant="caption" color="textMuted" style={{ flex: 1 }}>
            {t('sport.runner.next', { name: exerciseName(progress.nextExerciseId) })}
          </Text>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <Button
          label={t('sport.runner.validate')}
          onPress={validate}
          disabled={!activeSet || logSet.isPending}
        />
      </View>
    </View>
  );
}
