import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Badge, Button, Card, EmptyState, Icon, Screen, Text, useTheme, type BadgeTone } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { WorkoutStatus } from '@supotsu/core';
import { PICKABLE_EXERCISES } from '@supotsu/shared';
import { EXERCISES } from '@/features/exercises/catalog';
import { BackButton } from '@/features/navigation/BackButton';
import { useCustomExercises, useDeletePlannedWorkout, useWorkoutSets, useWorkouts } from '@/lib/data/queries';
import { formatDate } from '@/lib/format';

const STATUS: Record<WorkoutStatus, { label: string; tone: BadgeTone }> = {
  planned: { label: 'Planifiée', tone: 'info' },
  in_progress: { label: 'En cours', tone: 'warning' },
  completed: { label: 'Terminée', tone: 'success' },
  skipped: { label: 'Manquée', tone: 'error' },
};

function fmtDur(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
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
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: workouts = [], isLoading } = useWorkouts();
  const { data: sets = [] } = useWorkoutSets(id);
  const { data: customExercises = [] } = useCustomExercises();
  const deleteWorkout = useDeletePlannedWorkout();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const workout = useMemo(() => workouts.find((w) => w.id === id), [workouts, id]);

  const exerciseName = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of PICKABLE_EXERCISES) map.set(e.id, e.name);
    for (const e of EXERCISES) map.set(e.id, e.name);
    for (const e of customExercises) map.set(e.id, e.name);
    return (exerciseId: string): string => map.get(exerciseId) ?? exerciseId;
  }, [customExercises]);

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
          Chargement…
        </Text>
      </Screen>
    );
  }

  if (!workout) {
    return (
      <Screen scroll>
        <EmptyState icon={<Icon name="dumbbell" size={44} color={colors.textSubtle} />} title="Séance introuvable" message="Cette séance n'existe plus ou n'a pas encore été synchronisée." actionLabel="Retour" onAction={() => router.back()} />
      </Screen>
    );
  }

  const status = STATUS[workout.status];

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
      <View style={{ flexDirection: 'row', gap: spacing[3], marginTop: spacing[2] }}>
        <Stat label="Durée" value={workout.durationSec ? fmtDur(workout.durationSec) : '—'} />
        <Stat label="RPE" value={workout.rpe != null ? `${workout.rpe}/10` : '—'} />
        <Stat label="Statut" value={status.label} />
      </View>

      {/* Notes */}
      {workout.notes ? (
        <Card>
          <Text variant="heading">Notes</Text>
          <Text variant="body" color="textMuted" style={{ marginTop: spacing[1], lineHeight: 21 }}>
            {workout.notes}
          </Text>
        </Card>
      ) : null}

      {/* Exercices */}
      <Card>
        <Text variant="heading">Exercices</Text>
        {byExercise.length === 0 ? (
          <Text variant="body" color="textMuted" style={{ marginTop: spacing[1], lineHeight: 21 }}>
            Aucun exercice enregistré pour cette séance.
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
                        Série {i + 1} · {s.reps != null ? `${s.reps} reps` : '—'}{s.weightKg != null ? ` · ${s.weightKg} kg` : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}
      </Card>

      {confirmingDelete ? (
        <Card>
          <Text variant="body">Supprimer définitivement cette séance ?</Text>
          <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[3] }}>
            <Button label="Annuler" variant="secondary" onPress={() => setConfirmingDelete(false)} />
            <Button
              label={deleteWorkout.isPending ? '…' : 'Supprimer'}
              variant="danger"
              onPress={onDelete}
              disabled={deleteWorkout.isPending}
            />
          </View>
        </Card>
      ) : (
        <View style={{ flexDirection: 'row', gap: spacing[3] }}>
          <Button label="Retour" variant="secondary" onPress={() => router.back()} />
          <Button
            label="Modifier"
            variant="secondary"
            onPress={() => router.push({ pathname: '/sport/workout/[id]/edit', params: { id: workout.id } })}
          />
          <Button label="Supprimer" variant="secondary" onPress={() => setConfirmingDelete(true)} />
        </View>
      )}
    </Screen>
  );
}
