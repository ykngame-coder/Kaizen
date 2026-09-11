import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text, triggerHaptic, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { SetEntry } from '@supotsu/core';
import { computePlates } from '@supotsu/engines';
import { EXERCISE_LIBRARY } from '@supotsu/shared';
import { EXERCISES } from '@/features/exercises/catalog';
import { useAddSetsToWorkout, useCustomExercises, useExerciseHistory, useLogSet } from '@/lib/data/queries';
import { usePreferences } from '@/lib/preferences';
import { buildRunProgress, restRemainingSec, warmupProposal } from './runnerState';
import { RunnerFocus } from './RunnerFocus';

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
  const addSets = useAddSetsToWorkout();

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
  /**
   * Trois temps distincts, comme dans la référence : faire la série, puis
   * l'enregistrer, puis récupérer. `validate()` faisait les trois d'un coup,
   * avec la saisie noyée dans la ligne active.
   */
  const [phase, setPhase] = useState<'work' | 'log'>('work');

  useEffect(() => {
    setRepsDraft(activeSet?.reps != null ? String(activeSet.reps) : '');
    setWeightDraft(activeSet?.weightKg != null ? String(activeSet.weightKg) : '');
    setEffort(undefined);
    setPhase('work');
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

  // Proposée seulement sur une première série de travail chargée encore
  // intouchée : après coup, un échauffement n'a plus de sens.
  const warmup = useMemo(() => {
    if (!activeSet || activeSet.isWarmup) return [];
    if (progress.activeSetIndexInExercise !== 0) return [];
    if (ordered.some((s) => s.exerciseId === activeSet.exerciseId && s.isWarmup)) return [];
    return warmupProposal({
      workKg: activeSet.weightKg,
      workReps: activeSet.reps,
      barWeightKg: preferences.barWeightKg,
    });
  }, [activeSet, progress.activeSetIndexInExercise, ordered, preferences.barWeightKg]);

  const addWarmup = (): void => {
    if (!activeSet || warmup.length === 0) return;
    addSets.mutate({
      workoutId,
      sets: warmup.map((w, i) => ({
        exerciseId: activeSet.exerciseId,
        // Placées avant la série de travail : ordres fractionnaires évités en
        // décalant vers le bas depuis son propre ordre.
        order: activeSet.order - warmup.length + i,
        blockId: activeSet.blockId,
        reps: w.reps,
        weightKg: w.weightKg,
        isWarmup: true,
      })),
    });
  };

  const plates = useMemo(() => {
    const weight = weightDraft ? Number(weightDraft) : activeSet?.weightKg;
    if (!weight || !Number.isFinite(weight)) return undefined;
    const solution = computePlates(weight, preferences.barWeightKg, preferences.availablePlates);
    return solution ? { ...solution, requestedKg: weight } : undefined;
  }, [weightDraft, activeSet?.weightKg, preferences.barWeightKg, preferences.availablePlates]);

  const isResting = restEndsAtMs !== undefined && restLeft > 0;
  const setLabel = t('sport.runner.setCounter', {
    done: progress.activeSetIndexInExercise + 1,
    total: progress.workingSetsInExercise,
  });

  if (!activeSet || !progress.activeExerciseId) {
    return (
      <RunnerFocus
        title={t('sport.runner.allDone')}
        value="✓"
        actionLabel={t('sport.runner.validate')}
        onAction={onBlockFinished}
      />
    );
  }

  // Repos : le décompte devient l'information dominante, et l'action sert à
  // l'écourter — on ne reste pas bloqué à regarder un chrono.
  if (isResting) {
    return (
      <RunnerFocus
        tag={t('sport.runner.restTag')}
        title={exerciseName(progress.activeExerciseId)}
        total={progress.workingSetsInExercise}
        current={progress.activeSetIndexInExercise + 1}
        context={t('sport.runner.restContext', { total: restTotalSec })}
        value={`${restLeft}s`}
        accent={colors.success}
        actionLabel={t('sport.runner.skipRest')}
        onAction={() => setRestEndsAtMs(undefined)}
      />
    );
  }

  // Saisie : son propre écran, seulement le poids et les répétitions (plus
  // l'effort), au lieu de champs glissés dans une liste.
  if (phase === 'log') {
    return (
      <RunnerFocus
        tag={activeSet.isWarmup ? t('sport.runner.warmup') : undefined}
        title={exerciseName(progress.activeExerciseId)}
        total={progress.workingSetsInExercise}
        current={progress.activeSetIndexInExercise + 1}
        context={t('sport.runner.logContext', { n: progress.activeSetIndexInExercise + 1 })}
        value={`${repsDraft || '—'} × ${weightDraft || '—'} kg`}
        actionLabel={t('sport.runner.saveAndContinue')}
        onAction={() => {
          validate();
          setPhase('work');
        }}
        actionDisabled={logSet.isPending}
        secondaryLabel={t('sport.runner.skipLogging')}
        onSecondary={() => {
          setPhase('work');
          const restSec = activeSet.restSec ?? preferences.defaultRestSec;
          buzzedRef.current = false;
          setRestTotalSec(restSec);
          setNowMs(Date.now());
          setRestEndsAtMs(Date.now() + restSec * 1000);
        }}
      >
        <View style={{ flexDirection: 'row', gap: spacing[3] }}>
          <View style={{ flex: 1 }}>
            <Text variant="label" color="textMuted" style={{ marginBottom: spacing[2] }}>{t('sport.runner.repsA11y')}</Text>
            <TextInput
              value={repsDraft}
              onChangeText={setRepsDraft}
              keyboardType="numeric"
              accessibilityLabel={t('sport.runner.repsA11y')}
              style={{ color: colors.text, fontSize: 22, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, paddingVertical: spacing[3], textAlign: 'center' }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="label" color="textMuted" style={{ marginBottom: spacing[2] }}>{t('sport.runner.weightA11y')}</Text>
            <TextInput
              value={weightDraft}
              onChangeText={setWeightDraft}
              keyboardType="numeric"
              accessibilityLabel={t('sport.runner.weightA11y')}
              style={{ color: colors.text, fontSize: 22, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, paddingVertical: spacing[3], textAlign: 'center' }}
            />
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: spacing[3], flexWrap: 'wrap' }}>
          <Text variant="caption" color="textMuted">
            {preferences.effortMetric === 'rir' ? t('sport.runner.rir') : t('sport.runner.rpe')}
          </Text>
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
        </View>
      </RunnerFocus>
    );
  }

  // Série en cours : l'objectif prévu domine, une seule action.
  return (
    <RunnerFocus
      tag={activeSet.isWarmup ? t('sport.runner.warmup') : undefined}
      title={exerciseName(progress.activeExerciseId)}
      total={progress.workingSetsInExercise}
      current={progress.activeSetIndexInExercise + 1}
      context={setLabel}
      value={activeSet.reps != null ? t('sport.circuitRunner.reps', { reps: activeSet.reps }) : '—'}
      valueHint={
        activeSet.weightKg != null
          ? t('sport.runner.targetWeight', { weight: activeSet.weightKg })
          : previous
            ? t('sport.runner.previous', { weight: previous.weightKg, reps: previous.reps })
            : undefined
      }
      actionLabel={t('sport.runner.setDone')}
      onAction={() => setPhase('log')}
      secondaryLabel={warmup.length > 0 ? t('sport.runner.addWarmup', { count: warmup.length }) : undefined}
      onSecondary={warmup.length > 0 ? addWarmup : undefined}
    >
      {plates ? (
        <Text variant="caption" color="textSubtle" style={{ textAlign: 'center' }}>
          {plates.perSide.map((pl) => `${pl}`).join(' · ')}
        </Text>
      ) : null}
    </RunnerFocus>
  );
}
