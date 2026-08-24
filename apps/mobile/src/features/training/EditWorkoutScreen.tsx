import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, EmptyState, Icon, Input, Screen, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { EXERCISES, MUSCLE_LABEL, toCatalogExercise, type Exercise } from '@/features/exercises/catalog';
import { BackButton } from '@/features/navigation/BackButton';
import { useCustomExercises, useEditWorkout, useWorkoutSets, useWorkouts } from '@/lib/data/queries';

const LIMIT = 60;

interface SetDraft {
  reps: string;
  weight: string;
  rest: string;
}

/** Edit an existing session's name and exercise list — same search-to-add UI as Nouvelle séance, pre-filled from the current sets. */
export function EditWorkoutScreen(): React.JSX.Element {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: workouts = [], isLoading: loadingWorkout } = useWorkouts();
  const { data: existingSets, isLoading: loadingSets } = useWorkoutSets(id);
  const { data: customExercises = [] } = useCustomExercises();
  const editWorkout = useEditWorkout();

  const workout = useMemo(() => workouts.find((w) => w.id === id), [workouts, id]);

  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<string[]>([]);
  const [selected, setSelected] = useState<Record<string, SetDraft>>({});
  const [error, setError] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  const allExercises = useMemo(() => [...customExercises.map(toCatalogExercise), ...EXERCISES], [customExercises]);
  const byId = useMemo(() => new Map(allExercises.map((ex) => [ex.id, ex])), [allExercises]);
  const isCustom = (exId: string): boolean => exId.startsWith('custom-');

  // Pre-fill once both the workout and its sets have loaded.
  useEffect(() => {
    if (prefilled || !workout || !existingSets) return;
    setName(workout.name);
    const nextOrder: string[] = [];
    const nextSelected: Record<string, SetDraft> = {};
    for (const s of existingSets) {
      if (!nextSelected[s.exerciseId]) {
        nextOrder.push(s.exerciseId);
        nextSelected[s.exerciseId] = {
          reps: s.reps != null ? String(s.reps) : '',
          weight: s.weightKg != null ? String(s.weightKg) : '',
          rest: s.restSec != null ? String(s.restSec) : '',
        };
      }
    }
    setOrder(nextOrder);
    setSelected(nextSelected);
    setPrefilled(true);
  }, [prefilled, workout, existingSets]);

  const q = query.trim().toLowerCase();
  const searchResults = q
    ? allExercises
        .filter(
          (ex) =>
            !selected[ex.id] &&
            (ex.name.toLowerCase().includes(q) || MUSCLE_LABEL[ex.primary].toLowerCase().includes(q) || ex.equipment.toLowerCase().includes(q)),
        )
        .slice(0, LIMIT)
    : [];

  const add = (exId: string): void => {
    setSelected((prev) => ({ ...prev, [exId]: { reps: '', weight: '', rest: '' } }));
    setOrder((prev) => [...prev, exId]);
    setQuery('');
  };
  const remove = (exId: string): void => {
    setSelected((prev) => {
      const next = { ...prev };
      delete next[exId];
      return next;
    });
    setOrder((prev) => prev.filter((x) => x !== exId));
  };
  const update = (exId: string, patch: Partial<SetDraft>): void => {
    setSelected((prev) => ({ ...prev, [exId]: { ...prev[exId]!, ...patch } }));
  };

  const submit = async (): Promise<void> => {
    setError(null);
    if (!workout) return;
    if (!name.trim() || order.length === 0) {
      setError(t('sport.editWorkout.errors.missingFields'));
      return;
    }
    const sets = order.map((exerciseId, index) => ({
      exerciseId,
      order: index,
      reps: selected[exerciseId]!.reps ? Number(selected[exerciseId]!.reps) : undefined,
      weightKg: selected[exerciseId]!.weight ? Number(selected[exerciseId]!.weight) : undefined,
      restSec: selected[exerciseId]!.rest ? Number(selected[exerciseId]!.rest) : undefined,
    }));
    try {
      await editWorkout.mutateAsync({ workoutId: workout.id, name: name.trim(), notes: workout.notes, sets });
      router.back();
    } catch {
      setError(t('sport.editWorkout.errors.saveFailed'));
    }
  };

  const exerciseSubtitle = (ex: Exercise): string =>
    `${isCustom(ex.id) ? t('sport.editWorkout.exercise.customPrefix') : ''}${[ex.primary, ...ex.secondary].map((m) => MUSCLE_LABEL[m]).join(', ')} · ${ex.equipment}`;

  if (loadingWorkout || loadingSets) {
    return (
      <Screen scroll>
        <Text variant="body" color="textMuted">{t('common.loading')}</Text>
      </Screen>
    );
  }

  if (!workout) {
    return (
      <Screen scroll>
        <EmptyState icon={<Icon name="dumbbell" size={44} color={colors.textSubtle} />} title={t('sport.editWorkout.notFound.title')} actionLabel={t('common.back')} onAction={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <BackButton />
      <Text variant="title">{t('sport.editWorkout.title')}</Text>
      <Input
        label={t('sport.editWorkout.form.nameLabel')}
        placeholder={t('sport.editWorkout.form.namePlaceholder')}
        value={name}
        onChangeText={setName}
      />

      <Text variant="heading">{t('sport.editWorkout.addExercise.title')}</Text>
      <Input
        label={t('sport.editWorkout.addExercise.searchLabel')}
        placeholder={t('sport.editWorkout.addExercise.searchPlaceholder')}
        value={query}
        onChangeText={setQuery}
      />
      {q ? (
        searchResults.length === 0 ? (
          <Text variant="caption" color="textSubtle">{t('sport.editWorkout.addExercise.noResults', { query })}</Text>
        ) : (
          <View style={{ gap: spacing[2] }}>
            {searchResults.map((ex) => (
              <Pressable key={ex.id} onPress={() => add(ex.id)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
                <Card>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text variant="subtitle">{ex.name}</Text>
                      <Text variant="caption" color="textMuted">{exerciseSubtitle(ex)}</Text>
                    </View>
                    <Text variant="heading" style={{ color: colors.primary }}>+</Text>
                  </View>
                </Card>
              </Pressable>
            ))}
          </View>
        )
      ) : null}

      <Text variant="heading" style={{ marginTop: spacing[3] }}>
        {order.length > 0 ? t('sport.editWorkout.session.titleWithCount', { count: order.length }) : t('sport.editWorkout.session.title')}
      </Text>
      {order.length === 0 ? (
        <Text variant="caption" color="textSubtle">{t('sport.editWorkout.session.emptyHint')}</Text>
      ) : (
        <View style={{ gap: spacing[2] }}>
          {order.map((exId) => {
            const ex = byId.get(exId);
            if (!ex) return null;
            return (
              <Card key={exId} elevated>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="subtitle">{ex.name}</Text>
                    <Text variant="caption" color="textMuted">{exerciseSubtitle(ex)}</Text>
                  </View>
                  <Pressable onPress={() => remove(exId)} hitSlop={8}>
                    <Text variant="heading" style={{ color: colors.error }}>×</Text>
                  </Pressable>
                </View>
                <View style={{ flexDirection: 'row', gap: spacing[4], marginTop: spacing[2] }}>
                  <View style={{ flex: 1 }}>
                    <Input
                      label={t('sport.editWorkout.set.repsLabel')}
                      keyboardType="numeric"
                      value={selected[exId]!.reps}
                      onChangeText={(v) => update(exId, { reps: v })}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Input
                      label={t('sport.editWorkout.set.weightLabel')}
                      keyboardType="numeric"
                      value={selected[exId]!.weight}
                      onChangeText={(v) => update(exId, { weight: v })}
                    />
                  </View>
                </View>
                <View style={{ marginTop: spacing[2] }}>
                  <Input
                    label={t('sport.editWorkout.set.restLabel')}
                    placeholder={t('sport.editWorkout.set.restPlaceholder')}
                    keyboardType="numeric"
                    value={selected[exId]!.rest}
                    onChangeText={(v) => update(exId, { rest: v })}
                  />
                </View>
              </Card>
            );
          })}
        </View>
      )}

      {error ? <Badge label={error} tone="error" /> : null}

      <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[2] }}>
        <Button label={t('common.cancel')} variant="secondary" onPress={() => router.back()} />
        <View style={{ flex: 1 }} />
        <Button
          label={editWorkout.isPending ? '…' : t('sport.editWorkout.form.submit')}
          onPress={submit}
          disabled={editWorkout.isPending}
        />
      </View>
    </Screen>
  );
}
