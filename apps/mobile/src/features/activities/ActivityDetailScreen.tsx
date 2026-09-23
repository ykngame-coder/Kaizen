import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Card, EmptyState, FilterChip, Icon, Screen, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { MuscleGroup } from '@supotsu/core';
import { EXERCISE_LIBRARY } from '@supotsu/shared';
import { profileFor } from '@supotsu/engines';
import { EXERCISES, MUSCLE_LABEL } from '@/features/exercises/catalog';
import { BackButton } from '@/features/navigation/BackButton';
import { sourceName } from '@/features/connectors/sourceLabel';
import { useActivities, useCustomExercises, useDeleteActivity, useSessionMatching, useSetSessionLink, useUpdateActivityMuscles, useWorkoutBlocks, useWorkoutSets, useWorkouts } from '@/lib/data/queries';
import { activityTitle, formatDate, formatDistance, formatDuration } from '@/lib/format';
import { BlockSummaryCard } from '@/features/training/WorkoutDetailScreen';

const MUSCLES: MuscleGroup[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core', 'full_body'];

const formatTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

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
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: activities = [], isLoading } = useActivities();
  const { data: workouts = [] } = useWorkouts();
  const { data: customExercises = [] } = useCustomExercises();
  const deleteActivity = useDeleteActivity();
  const { workoutForActivity } = useSessionMatching();
  const setSessionLink = useSetSessionLink();
  const [linking, setLinking] = useState(false);
  // Un rattachement qui ne dit rien laisse croire qu'il n'a pas pris.
  const [linkFeedback, setLinkFeedback] = useState<'linked' | 'separated' | string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const updateActivityMuscles = useUpdateActivityMuscles();
  const [selectedMuscles, setSelectedMuscles] = useState<MuscleGroup[] | null>(null);
  const [musclesSaved, setMusclesSaved] = useState(false);

  const activity = useMemo(() => activities.find((a) => a.id === id), [activities, id]);
  // Sans tag manuel, les muscles viennent du profil du type d'activité — déjà
  // comptés dans la récupération (buildActivityMuscleSessions). On les affiche
  // comme une estimation qu'on peut corriger.
  const tagged = !!activity?.muscles && activity.muscles.length > 0;
  const profile = activity && !tagged ? profileFor(activity) : null;
  const estimated = selectedMuscles === null && profile !== null;
  const musclesValue = selectedMuscles ?? (tagged ? activity!.muscles! : profile ? [...profile.primary, ...profile.secondary] : []);
  const canReturnToEstimate = tagged && activity != null && profileFor({ type: activity.type, notes: activity.notes }) !== null;

  // Même appariement que partout ailleurs (temps réellement partagé, décisions
  // manuelles comprises) : cet écran avait sa propre règle « musculation, même
  // jour », qui ratait un cross-training et confondait matin et soir.
  const matchedWorkout = activity ? workoutForActivity(activity.id) : undefined;

  /** Les séances terminées du jour, à proposer quand le calcul n'a rien vu. */
  const sameDayWorkouts = useMemo(() => {
    if (!activity) return [];
    const key = dayKey(activity.startedAt);
    return workouts.filter((w) => w.status === 'completed' && w.completedAt && dayKey(w.completedAt) === key);
  }, [activity, workouts]);

  const { data: sets = [] } = useWorkoutSets(matchedWorkout?.id);
  const { data: blocks = [] } = useWorkoutBlocks(matchedWorkout?.id);

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
  const endedAt = new Date(new Date(activity.startedAt).getTime() + activity.durationSec * 1000).toISOString();

  const onDelete = async (): Promise<void> => {
    await deleteActivity.mutateAsync(activity.id);
    router.back();
  };

  const toggleMuscle = (m: MuscleGroup): void => {
    const current = musclesValue;
    setSelectedMuscles(current.includes(m) ? current.filter((x) => x !== m) : [...current, m]);
    setMusclesSaved(false);
  };

  const onSaveMuscles = async (): Promise<void> => {
    if (!activity) return;
    await updateActivityMuscles.mutateAsync({ activityId: activity.id, muscles: musclesValue });
    setMusclesSaved(true);
  };

  /** Efface le tag manuel : l'activité retombe sur l'estimation de son type. */
  const onReturnToEstimate = async (): Promise<void> => {
    if (!activity) return;
    await updateActivityMuscles.mutateAsync({ activityId: activity.id, muscles: [] });
    setSelectedMuscles(null);
    setMusclesSaved(false);
  };

  return (
    <Screen scroll>
      <BackButton />
      <Text variant="title">{activityTitle(activity.type, activity.notes)}</Text>
      <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
        {formatDate(activity.startedAt)} · {sourceName(activity.source, t)}
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3], marginTop: spacing[2] }}>
        <Stat label="Heure de début" value={formatTime(activity.startedAt)} />
        <Stat label="Heure de fin" value={formatTime(endedAt)} />
        <Stat label="Durée" value={formatDuration(activity.durationSec)} />
        <Stat label="Distance" value={distance} />
        <Stat label="Calories" value={activity.calories != null ? `${Math.round(activity.calories)} kcal` : null} />
        <Stat label="FC moyenne" value={activity.avgHeartRate != null ? `${Math.round(activity.avgHeartRate)} bpm` : null} />
        <Stat label="FC max" value={activity.maxHeartRate != null ? `${Math.round(activity.maxHeartRate)} bpm` : null} />
        <Stat label="Dénivelé +" value={activity.elevationGainM != null ? `${Math.round(activity.elevationGainM)} m` : null} />
        <Stat label="Dénivelé -" value={activity.elevationLossM != null ? `${Math.round(activity.elevationLossM)} m` : null} />
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

      {/* Même effort vu deux fois : la séance de l'app et ce que la montre en a
          gardé. On le dit, et on laisse défaire — ou rattacher à la main. */}
      <Card>
        <Text variant="heading">{t('sport.activityDetail.link.heading')}</Text>
        {matchedWorkout ? (
          <>
            <Text variant="body" color="textMuted" style={{ marginTop: spacing[1] }}>
              {t('sport.activityDetail.link.linkedTo', { name: matchedWorkout.name })}
            </Text>
            <View style={{ alignItems: 'flex-start', marginTop: spacing[2] }}>
              <Button
                label={setSessionLink.isPending ? '…' : t('sport.activityDetail.link.separate')}
                variant="secondary"
                disabled={setSessionLink.isPending}
                onPress={() =>
                  setSessionLink.mutate(
                    { workoutId: matchedWorkout.id, activityId: activity.id, mode: 'separate' },
                    {
                      onSuccess: () => setLinkFeedback('separated'),
                      onError: (e) => setLinkFeedback(e instanceof Error ? e.message : 'erreur'),
                    },
                  )
                }
              />
            </View>
          </>
        ) : sameDayWorkouts.length === 0 ? (
          <Text variant="caption" color="textMuted" style={{ marginTop: spacing[1] }}>
            {t('sport.activityDetail.link.noCandidate')}
          </Text>
        ) : linking ? (
          <View style={{ gap: spacing[2], marginTop: spacing[2] }}>
            <Text variant="caption" color="textMuted">{t('sport.activityDetail.link.pick')}</Text>
            {sameDayWorkouts.map((w) => (
              <Pressable
                key={w.id}
                onPress={() => {
                  setSessionLink.mutate(
                    { workoutId: w.id, activityId: activity.id, mode: 'linked' },
                    {
                      onSuccess: () => setLinkFeedback('linked'),
                      onError: (e) => setLinkFeedback(e instanceof Error ? e.message : 'erreur'),
                    },
                  );
                  setLinking(false);
                }}
                style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing[3] }}
              >
                <Text variant="body">{w.name}</Text>
                <Text variant="caption" color="textSubtle">{formatDate(w.completedAt ?? w.createdAt)}</Text>
              </Pressable>
            ))}
            <View style={{ alignItems: 'flex-start' }}>
              <Button label={t('common.cancel')} variant="secondary" onPress={() => setLinking(false)} />
            </View>
          </View>
        ) : (
          <View style={{ alignItems: 'flex-start', marginTop: spacing[2] }}>
            <Button label={t('sport.activityDetail.link.attach')} variant="secondary" onPress={() => setLinking(true)} />
          </View>
        )}
        {linkFeedback ? (
          <Text
            variant="caption"
            color={linkFeedback === 'linked' || linkFeedback === 'separated' ? 'accentData' : 'error'}
            style={{ marginTop: spacing[2] }}
          >
            {linkFeedback === 'linked'
              ? t('sport.activityDetail.link.linkedConfirm')
              : linkFeedback === 'separated'
                ? t('sport.activityDetail.link.separatedConfirm')
                : t('sport.activityDetail.link.failed', { error: linkFeedback })}
          </Text>
        ) : null}
      </Card>

      {!matchedWorkout ? (
        <Card>
          <Text variant="heading">{t('sport.activityDetail.muscles.heading')}</Text>
          <Text variant="caption" color="textMuted" style={{ marginTop: spacing[1] }}>
            {estimated ? t('sport.activityDetail.muscles.estimated') : t('sport.activityDetail.muscles.hint')}
          </Text>
          {estimated && profile && profile.secondary.length > 0 ? (
            <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[1] }}>
              {t('sport.activityDetail.muscles.estimatedSecondary', { muscles: profile.secondary.map((m) => MUSCLE_LABEL[m]).join(', ') })}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[3] }}>
            {MUSCLES.map((m) => (
              <FilterChip key={m} label={MUSCLE_LABEL[m]} active={musclesValue.includes(m)} onPress={() => toggleMuscle(m)} />
            ))}
          </View>
          {/* Une estimation intacte est déjà comptée : rien à enregistrer. L'enregistrer
              telle quelle ferait passer ses muscles secondaires en principaux. */}
          {!estimated ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginTop: spacing[3] }}>
              <Button
                label={updateActivityMuscles.isPending ? '…' : musclesSaved ? t('sport.activityDetail.muscles.saved') : t('sport.activityDetail.muscles.save')}
                onPress={onSaveMuscles}
                disabled={updateActivityMuscles.isPending}
              />
              {canReturnToEstimate ? (
                <Pressable onPress={onReturnToEstimate} hitSlop={8} disabled={updateActivityMuscles.isPending}>
                  <Text variant="caption" color="primary">{t('sport.activityDetail.muscles.backToEstimate')}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </Card>
      ) : null}

      {matchedWorkout && blocks.length > 0 ? (
        <View style={{ gap: spacing[3] }}>
          {blocks.map((b, i) => (
            <BlockSummaryCard key={b.id} block={b} index={i} exerciseName={exerciseName} />
          ))}
          <View style={{ alignItems: 'flex-start' }}>
            <Button
              label="Voir la séance complète"
              variant="secondary"
              onPress={() => router.push({ pathname: '/sport/workout/[id]', params: { id: matchedWorkout.id } })}
            />
          </View>
        </View>
      ) : matchedWorkout ? (
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

      {confirmingDelete ? (
        <Card>
          <Text variant="body">Supprimer définitivement cette activité ?</Text>
          <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[3] }}>
            <Button label="Annuler" variant="secondary" onPress={() => setConfirmingDelete(false)} />
            <Button
              label={deleteActivity.isPending ? '…' : 'Supprimer'}
              variant="danger"
              onPress={onDelete}
              disabled={deleteActivity.isPending}
            />
          </View>
        </Card>
      ) : (
        <View style={{ flexDirection: 'row', gap: spacing[3] }}>
          <Button label="Retour" variant="secondary" onPress={() => router.back()} />
          <Button label="Supprimer" variant="secondary" onPress={() => setConfirmingDelete(true)} />
        </View>
      )}
    </Screen>
  );
}
