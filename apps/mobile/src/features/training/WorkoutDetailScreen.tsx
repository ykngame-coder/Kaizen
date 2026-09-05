import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Badge, Button, Card, EmptyState, Icon, Screen, Text, useTheme, type BadgeTone } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { WorkoutBlock, WorkoutStatus } from '@supotsu/core';
import { computePlanAdherence } from '@supotsu/engines';
import { EXERCISE_LIBRARY } from '@supotsu/shared';
import { EXERCISES } from '@/features/exercises/catalog';
import { BackButton } from '@/features/navigation/BackButton';
import { useBlockSets, useCustomExercises, useDeletePlannedWorkout, useWorkoutBlocks, useWorkoutSets, useWorkouts } from '@/lib/data/queries';
import { formatDate } from '@/lib/format';
import { supersetPartners } from './blockRunnerEngine';
import { adherenceTone } from './runnerState';

const STATUS_TONE: Record<WorkoutStatus, BadgeTone> = {
  planned: 'info',
  in_progress: 'warning',
  completed: 'success',
  skipped: 'error',
};

function statusLabel(status: WorkoutStatus, t: TFunction): string {
  switch (status) {
    case 'planned':
      return t('sport.workoutDetail.status.planned');
    case 'in_progress':
      return t('sport.workoutDetail.status.inProgress');
    case 'completed':
      return t('sport.workoutDetail.status.completed');
    case 'skipped':
      return t('sport.workoutDetail.status.skipped');
  }
}

function fmtDur(sec: number, t: TFunction): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0
    ? t('sport.workoutDetail.duration.hoursMinutes', { h, m: String(m).padStart(2, '0') })
    : t('sport.workoutDetail.duration.minutes', { m });
}

/** Small stat block. */
function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceElevated, borderRadius: radii.lg, padding: spacing[4] }}>
      <Text variant="caption" color="textSubtle">
        {label}
      </Text>
      <Text variant="subtitle" style={{ marginTop: spacing[1] }}>
        {value}
      </Text>
    </View>
  );
}

/** Détail d'une séance : nom, statut, date, durée, RPE, notes, et le détail exercice par exercice (séries, répétitions, charges). */
export function WorkoutDetailScreen(): React.JSX.Element {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: workouts = [], isLoading } = useWorkouts();
  const { data: sets = [] } = useWorkoutSets(id);
  const { data: blocks = [] } = useWorkoutBlocks(id);
  const { data: customExercises = [] } = useCustomExercises();
  const deleteWorkout = useDeletePlannedWorkout();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const workout = useMemo(() => workouts.find((w) => w.id === id), [workouts, id]);

  const exerciseName = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of EXERCISE_LIBRARY) map.set(e.id, e.name);
    for (const e of EXERCISES) map.set(e.id, e.name);
    for (const e of customExercises) map.set(e.id, e.name);
    return (exerciseId: string): string => map.get(exerciseId) ?? exerciseId;
  }, [customExercises]);

  // undefined pour toute séance antérieure à la migration 0029 : le badge
  // disparaît alors complètement, plutôt que d'afficher un tiret ou 0 %.
  const adherence = useMemo(() => computePlanAdherence(sets), [sets]);

  const byExercise = useMemo(() => {
    const groups: { exerciseId: string; sets: typeof sets }[] = [];
    for (const s of [...sets].sort((a, b) => a.order - b.order)) {
      const last = groups.at(-1);
      if (last && last.exerciseId === s.exerciseId) last.sets.push(s);
      else groups.push({ exerciseId: s.exerciseId, sets: [s] });
    }
    return groups;
  }, [sets]);

  if (isLoading) {
    return (
      <Screen scroll>
        <Text variant="body" color="textMuted">
          {t('common.loading')}
        </Text>
      </Screen>
    );
  }

  if (!workout) {
    return (
      <Screen scroll>
        <EmptyState icon={<Icon name="dumbbell" size={44} color={colors.textSubtle} />} title={t('sport.workoutDetail.notFound.title')} message={t('sport.workoutDetail.notFound.message')} actionLabel={t('common.back')} onAction={() => router.back()} />
      </Screen>
    );
  }

  const status = { label: statusLabel(workout.status, t), tone: STATUS_TONE[workout.status] };

  const onDelete = async (): Promise<void> => {
    await deleteWorkout.mutateAsync(workout.id);
    router.back();
  };

  return (
    <Screen scroll>
      <BackButton />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text variant="title">{workout.name}</Text>
          <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
            {formatDate(workout.completedAt ?? workout.plannedFor ?? workout.createdAt)}
          </Text>
        </View>
        <Badge label={status.label} tone={status.tone} />
      </View>

      {/* Résumé */}
      <View style={{ flexDirection: 'row', gap: spacing[3], marginTop: spacing[2], flexWrap: 'wrap' }}>
        <Stat label={t('sport.workoutDetail.stats.duration')} value={workout.durationSec ? fmtDur(workout.durationSec, t) : '—'} />
        <Stat label={t('sport.workoutDetail.stats.rpe')} value={workout.rpe != null ? `${workout.rpe}/10` : '—'} />
        <Stat label={t('sport.workoutDetail.stats.status')} value={status.label} />
        {workout.avgHeartRate != null ? (
          <Stat label={t('sport.workoutDetail.stats.avgHeartRate')} value={`${workout.avgHeartRate} bpm`} />
        ) : null}
      </View>

      {adherence ? (
        <View style={{ alignItems: 'flex-start' }}>
          <Badge
            label={t('sport.runner.adherence', { percent: Math.round(adherence.ratio * 100) })}
            tone={adherenceTone(adherence.ratio) === 'neutral' ? 'info' : adherenceTone(adherence.ratio)}
          />
        </View>
      ) : null}

      {/* Notes */}
      {workout.notes ? (
        <Card>
          <Text variant="heading">{t('sport.workoutDetail.notesTitle')}</Text>
          <Text variant="body" color="textMuted" style={{ marginTop: spacing[1], lineHeight: 21 }}>
            {workout.notes}
          </Text>
        </Card>
      ) : null}

      {/* Exercices — par bloc si la séance en a, sinon la liste à plat comme avant */}
      {blocks.length > 0 ? (
        <View style={{ gap: spacing[3] }}>
          {blocks.map((b, i) => (
            <BlockSummaryCard key={b.id} block={b} index={i} exerciseName={exerciseName} />
          ))}
        </View>
      ) : (
        <Card>
          <Text variant="heading">{t('sport.workoutDetail.exercisesTitle')}</Text>
          {byExercise.length === 0 ? (
            <Text variant="body" color="textMuted" style={{ marginTop: spacing[1], lineHeight: 21 }}>
              {t('sport.workoutDetail.noExercises')}
            </Text>
          ) : (
            <View style={{ marginTop: spacing[2], gap: spacing[3] }}>
              {byExercise.map((g) => (
                <View key={g.exerciseId}>
                  <Text variant="body" style={{ fontWeight: '700' }}>{exerciseName(g.exerciseId)}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[1] }}>
                    {g.sets.map((s, i) => (
                      <View
                        key={s.id}
                        style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.md, backgroundColor: colors.surfaceElevated }}
                      >
                        <Text variant="caption" color="textMuted">
                          {t('sport.workoutDetail.setLabel', { n: i + 1 })} · {s.reps != null ? `${s.reps} reps` : '—'}{s.weightKg != null ? ` · ${s.weightKg} kg` : ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          )}
        </Card>
      )}

      {!confirmingDelete && (workout.status === 'planned' || workout.status === 'in_progress') && blocks.length > 0 ? (
        <View style={{ alignItems: 'flex-start' }}>
          <Button
            label={workout.status === 'in_progress' ? t('sport.runner.resume') : t('sport.workoutDetail.actions.start')}
            onPress={() => router.push({ pathname: '/sport/workout/[id]/run', params: { id: workout.id } })}
          />
        </View>
      ) : null}

      {confirmingDelete ? (
        <Card>
          <Text variant="body">{t('sport.workoutDetail.deleteConfirm.message')}</Text>
          <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[3] }}>
            <Button label={t('common.cancel')} variant="secondary" onPress={() => setConfirmingDelete(false)} />
            <Button
              label={deleteWorkout.isPending ? '…' : t('sport.workoutDetail.actions.delete')}
              variant="danger"
              onPress={onDelete}
              disabled={deleteWorkout.isPending}
            />
          </View>
        </Card>
      ) : (
        <View style={{ flexDirection: 'row', gap: spacing[3] }}>
          <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
          <Button
            label={t('sport.workoutDetail.actions.edit')}
            variant="secondary"
            onPress={() => router.push({ pathname: '/sport/workout/[id]/edit', params: { id: workout.id } })}
          />
          <Button label={t('sport.workoutDetail.actions.delete')} variant="secondary" onPress={() => setConfirmingDelete(true)} />
        </View>
      )}
    </Screen>
  );
}

function blockFormatLabel(format: WorkoutBlock['format'], t: TFunction): string {
  if (format === 'strength') return t('sport.workoutDetail.blockFormat.strength');
  if (format === 'for_time') return t('sport.workoutDetail.blockFormat.forTime');
  if (format === 'amrap') return 'AMRAP';
  return 'EMOM';
}

function blockResultLine(b: WorkoutBlock, t: TFunction): string {
  if (b.format === 'amrap') return `AMRAP ${b.timeCapSec ? Math.round(b.timeCapSec / 60) : '?'} min${b.completedRounds != null ? ` — ${b.completedRounds} rounds` : ''}`;
  if (b.format === 'emom') return `EMOM ${b.targetRounds ?? '?'}×${b.timeCapSec ?? '?'} s`;
  if (b.format === 'for_time') return `${t('sport.workoutDetail.blockFormat.forTime')}${b.resultTimeSec != null ? ` — ${Math.floor(b.resultTimeSec / 60)} min ${b.resultTimeSec % 60}` : ''}`;
  const rounds = b.completedRounds ?? b.targetRounds;
  return rounds ? t('sport.workoutDetail.blockFormat.strengthRepeated', { rounds }) : t('sport.workoutDetail.blockFormat.strength');
}

/** One block's summary + exercises — reused by ActivityDetailScreen for a matched Garmin/circuit workout. */
export function BlockSummaryCard({
  block,
  index,
  exerciseName,
}: {
  block: WorkoutBlock;
  index: number;
  exerciseName: (id: string) => string;
}): React.JSX.Element {
  const { t } = useTranslation();
  const { data: sets = [] } = useBlockSets(block.id);
  return (
    <Card>
      <Text variant="heading">{t('sport.workoutDetail.blockLabel', { n: index + 1 })} · {blockFormatLabel(block.format, t)}</Text>
      <Text variant="caption" color="textMuted">{blockResultLine(block, t)}</Text>
      <View style={{ marginTop: spacing[2], gap: spacing[1] }}>
        {sets.map((s, i) => (
          <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
            <Text variant="caption" color="textSubtle">
              {exerciseName(s.exerciseId)}{s.reps != null ? ` · ${s.reps} reps` : ''}{s.weightKg != null ? ` · ${s.weightKg} kg` : ''}
            </Text>
            {supersetPartners(sets, i).length > 0 ? <Badge label={t('sport.workoutDetail.superset.badge')} tone="info" /> : null}
          </View>
        ))}
      </View>
    </Card>
  );
}
