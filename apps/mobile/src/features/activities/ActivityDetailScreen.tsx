import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card, EmptyState, Icon, Screen, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { EXERCISE_LIBRARY } from '@supotsu/shared';
import { EXERCISES } from '@/features/exercises/catalog';
import { BackButton } from '@/features/navigation/BackButton';
import { useActivities, useCustomExercises, useWorkoutSets, useWorkouts } from '@/lib/data/queries';
import { activityLabel, formatDate, formatDistance, formatDuration } from '@/lib/format';

const INTENSITY_LABEL: Record<string, string> = {
  low: 'Faible',
  moderate: 'Modérée',
  high: 'Élevée',
  max: 'Maximale',
};

const dayKey = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Small stat block — omits itself when there's no value to show. */
function Stat({ label, value }: { label: string; value: string | null | undefined }): React.JSX.Element | null {
  const { colors } = useTheme();
  if (value == null) return null;
  return (
    <View style={{ flex: 1, minWidth: 100, backgroundColor: colors.surfaceElevated, borderRadius: radii.lg, padding: spacing[4] }}>
      <Text variant="caption" color="textSubtle">
        {label}
      </Text>
      <Text variant="subtitle" style={{ marginTop: spacing[1] }}>
        {value}
      </Text>
    </View>
  );
}

/**
 * Detail for a single activity: its own recorded metrics (durée, distance,
 * calories, FC, dénivelé…), plus — for a "Musculation" activity that has a
 * matching completed workout the same day (e.g. a Garmin import, which
 * produces both a cardio-style activity summary and a separate exercise/set
 * breakdown) — the exercise-by-exercise detail via a link to that workout.
 */
export function ActivityDetailScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: activities = [], isLoading } = useActivities();
  const { data: workouts = [] } = useWorkouts();
  const { data: customExercises = [] } = useCustomExercises();

  const activity = useMemo(() => activities.find((a) => a.id === id), [activities, id]);

  const matchedWorkout = useMemo(() => {
    if (!activity || activity.type !== 'strength') return undefined;
    const key = dayKey(activity.startedAt);
    return workouts.find((w) => w.status === 'completed' && w.completedAt && dayKey(w.completedAt) === key);
  }, [activity, workouts]);

  const { data: sets = [] } = useWorkoutSets(matchedWorkout?.id);

  const exerciseName = useMemo(() => {
    const map = new Map<string, string>();
    // The full library, not the pickable subset — an imported workout can
    // reference ids (e.g. ex-garmin-*) intentionally excluded from manual
    // search but still real entries with a real name to show here.
    for (const e of EXERCISE_LIBRARY) map.set(e.id, e.name);
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
        <Text variant="body" color="textMuted">Chargement…</Text>
      </Screen>
    );
  }

  if (!activity) {
    return (
      <Screen scroll>
        <EmptyState icon={<Icon name="run" size={44} color={colors.textSubtle} />} title="Activité introuvable" message="Cette activité n'existe plus ou n'a pas encore été synchronisée." actionLabel="Retour" onAction={() => router.back()} />
      </Screen>
    );
  }

  const distance = formatDistance(activity.distanceM);

  return (
    <Screen scroll>
      <BackButton />
      <Text variant="title">{activity.type === 'other' && activity.notes ? activity.notes : activityLabel(activity.type)}</Text>
      <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
        {formatDate(activity.startedAt)} · {activity.source}
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3], marginTop: spacing[2] }}>
        <Stat label="Durée" value={formatDuration(activity.durationSec)} />
        <Stat label="Distance" value={distance} />
        <Stat label="Calories" value={activity.calories != null ? `${Math.round(activity.calories)} kcal` : null} />
        <Stat label="FC moyenne" value={activity.avgHeartRate != null ? `${Math.round(activity.avgHeartRate)} bpm` : null} />
        <Stat label="FC max" value={activity.maxHeartRate != null ? `${Math.round(activity.maxHeartRate)} bpm` : null} />
        <Stat label="Dénivelé" value={activity.elevationGainM != null ? `${Math.round(activity.elevationGainM)} m` : null} />
        <Stat label="Intensité" value={activity.intensity ? INTENSITY_LABEL[activity.intensity] ?? activity.intensity : null} />
      </View>

      {activity.notes && activity.type !== 'other' ? (
        <Card>
          <Text variant="heading">Notes</Text>
          <Text variant="body" color="textMuted" style={{ marginTop: spacing[1], lineHeight: 21 }}>
            {activity.notes}
          </Text>
        </Card>
      ) : null}

      {matchedWorkout ? (
        <Card>
          <Text variant="heading">Exercices</Text>
          {byExercise.length === 0 ? (
            <Text variant="body" color="textMuted" style={{ marginTop: spacing[1], lineHeight: 21 }}>
              Aucun détail d'exercice enregistré pour cette séance.
            </Text>
          ) : (
            <View style={{ marginTop: spacing[2], gap: spacing[3] }}>
              {byExercise.map((g) => (
                <View key={g.exerciseId}>
                  <Text variant="body" style={{ fontWeight: '700' }}>{exerciseName(g.exerciseId)}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[1] }}>
                    {g.sets.map((s, i) => (
                      <View key={s.id} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.md, backgroundColor: colors.surfaceElevated }}>
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
          <View style={{ alignItems: 'flex-start', marginTop: spacing[3] }}>
            <Button
              label="Voir la séance complète"
              variant="secondary"
              onPress={() => router.push({ pathname: '/sport/workout/[id]', params: { id: matchedWorkout.id } })}
            />
          </View>
        </Card>
      ) : null}

      <View style={{ alignItems: 'flex-start' }}>
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
