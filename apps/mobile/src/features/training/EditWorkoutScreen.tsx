import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { EmptyState, Icon, Screen, SegmentedControl, Text, Toggle, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { toCatalogExercise } from '@/features/exercises/catalog';
import { BackButton } from '@/features/navigation/BackButton';
import {
  useAddUserSession,
  useCustomExercises,
  useEditCircuitWorkout,
  useEditWorkout,
  useUserSessions,
  useWorkoutBlocks,
  useWorkoutSets,
  useWorkouts,
} from '@/lib/data/queries';
import { emptyBlock, flattenBlocksToExercises, useSessionBlocks, type BlockDraft, type SetDraft } from './sessionBuilder';
import { SessionBlocksEditor } from './SessionBlocksEditor';

const SESSIONS_QUOTA = 50;

/** Edit an existing session's name and exercise list — same block editor as Nouvelle séance, pre-filled from the current sets/blocks. */
export function EditWorkoutScreen(): React.JSX.Element {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: workouts = [], isLoading: loadingWorkout } = useWorkouts();
  const { data: existingSets, isLoading: loadingSets } = useWorkoutSets(id);
  const { data: existingBlocks, isLoading: loadingBlocks } = useWorkoutBlocks(id);
  const { data: customExercises = [] } = useCustomExercises();
  const { data: userSessions = [] } = useUserSessions();
  const editWorkout = useEditWorkout();
  const editCircuitWorkout = useEditCircuitWorkout();
  const addUserSession = useAddUserSession();

  const workout = useMemo(() => workouts.find((w) => w.id === id), [workouts, id]);
  const isCustomExercise = (exId: string): boolean => exId.startsWith('custom-');
  const catalogCustom = useMemo(() => customExercises.map(toCatalogExercise), [customExercises]);

  const builder = useSessionBlocks({ customExercises: catalogCustom });
  const [prefilled, setPrefilled] = useState(false);
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [addToLibrary, setAddToLibrary] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const atQuota = userSessions.length >= SESSIONS_QUOTA;

  // Pre-fill once the workout, its sets and its blocks have all loaded. A
  // flat (no-block) session becomes a single strength block, matching
  // Nouvelle séance's convention (blocks are always the source of truth).
  useEffect(() => {
    if (prefilled || !workout || !existingSets || !existingBlocks) return;
    builder.setName(workout.name);
    if (existingBlocks.length > 0) {
      const sorted = [...existingBlocks].sort((a, b) => a.order - b.order);
      builder.setBlocks(
        sorted.map((b) => {
          const blockSets = existingSets.filter((s) => s.blockId === b.id).sort((a, c) => a.order - c.order);
          const nextOrder: string[] = [];
          const nextSelected: Record<string, SetDraft> = {};
          for (const s of blockSets) {
            if (!nextSelected[s.exerciseId]) {
              nextOrder.push(s.exerciseId);
              nextSelected[s.exerciseId] = {
                reps: s.reps != null ? String(s.reps) : '',
                weight: s.weightKg != null ? String(s.weightKg) : '',
                rest: s.restSec != null ? String(s.restSec) : '',
              };
            }
          }
          const block: BlockDraft = {
            format: b.format,
            timeCapSec: b.timeCapSec != null ? String(b.format === 'amrap' ? Math.round(b.timeCapSec / 60) : b.timeCapSec) : '12',
            targetRounds: b.targetRounds != null ? String(b.targetRounds) : '10',
            order: nextOrder,
            selected: nextSelected,
          };
          return block;
        }),
      );
    } else {
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
      builder.setBlocks([{ ...emptyBlock(), order: nextOrder, selected: nextSelected }]);
    }
    builder.setActiveBlock(0);
    setPrefilled(true);
  }, [prefilled, workout, existingSets, existingBlocks]);

  const isSaving = editWorkout.isPending || editCircuitWorkout.isPending || addUserSession.isPending;

  const submit = async (): Promise<void> => {
    setError(null);
    if (!workout) return;
    if (!builder.name.trim() || builder.blocks.every((b) => b.order.length === 0)) {
      setError(t('sport.sessionBuilder.errors.missingFields'));
      return;
    }
    try {
      if (builder.isSingleStrength) {
        const sets = builder.blocks[0]!.order.map((exerciseId, index) => {
          const s = builder.blocks[0]!.selected[exerciseId]!;
          return {
            exerciseId,
            order: index,
            reps: s.reps ? Number(s.reps) : undefined,
            weightKg: s.weight ? Number(s.weight) : undefined,
            restSec: s.rest ? Number(s.rest) : undefined,
          };
        });
        await editWorkout.mutateAsync({ workoutId: workout.id, name: builder.name.trim(), notes: workout.notes, sets });
      } else {
        await editCircuitWorkout.mutateAsync({
          workoutId: workout.id,
          name: builder.name.trim(),
          notes: workout.notes,
          blocks: builder.blocks.map((b) => ({
            format: b.format,
            timeCapSec: b.format === 'amrap' ? (Number(b.timeCapSec) || 0) * 60 || undefined : b.format === 'emom' ? Number(b.timeCapSec) || undefined : undefined,
            targetRounds: b.format === 'emom' || b.format === 'for_time' ? Number(b.targetRounds) || undefined : undefined,
            sets: b.order.map((exerciseId, index) => {
              const s = b.selected[exerciseId]!;
              return {
                exerciseId,
                order: index,
                reps: s.reps ? Number(s.reps) : undefined,
                weightKg: b.format === 'strength' && s.weight ? Number(s.weight) : undefined,
                restSec: b.format === 'strength' && s.rest ? Number(s.rest) : undefined,
              };
            }),
          })),
        });
      }
      if (addToLibrary && !atQuota) {
        await addUserSession.mutateAsync({
          name: builder.name.trim(),
          visibility,
          exercises: flattenBlocksToExercises(builder.blocks),
        });
      }
      router.back();
    } catch {
      setError(t('sport.sessionBuilder.errors.saveFailed'));
    }
  };

  if (loadingWorkout || loadingSets || loadingBlocks) {
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
    <Screen>
      <BackButton />
      <Text variant="title" style={{ marginBottom: spacing[3] }}>{t('sport.editWorkout.title')}</Text>
      <SessionBlocksEditor
        t={t}
        builder={builder}
        isCustomExercise={isCustomExercise}
        onCreateExercise={() => router.push('/sport/exercise/new')}
        error={error}
        saving={isSaving}
        saveLabel={isSaving ? t('sport.sessionBuilder.form.submitPending') : t('sport.editWorkout.form.submit')}
        onSave={submit}
        cancelLabel={t('common.cancel')}
        onCancel={() => router.back()}
        headerAfterName={
          <View style={{ gap: spacing[3] }}>
            <View>
              <Text variant="label" color="textMuted" style={{ marginBottom: spacing[2] }}>{t('sport.sessionBuilder.visibility.label')}</Text>
              <SegmentedControl
                options={[
                  { value: 'private', label: t('sport.sessionBuilder.visibility.private') },
                  { value: 'public', label: t('sport.sessionBuilder.visibility.public') },
                ]}
                value={visibility}
                onChange={setVisibility}
              />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: spacing[3] }}>
              <View style={{ flex: 1, marginRight: spacing[3] }}>
                <Text variant="body" style={{ fontWeight: '700' }}>{t('sport.sessionBuilder.addToLibrary.label')}</Text>
                <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
                  {atQuota ? t('sport.sessionBuilder.addToLibrary.quotaReached') : t('sport.sessionBuilder.addToLibrary.editHint')}
                </Text>
              </View>
              <Toggle value={addToLibrary && !atQuota} onValueChange={setAddToLibrary} disabled={atQuota} />
            </View>
          </View>
        }
      />
    </Screen>
  );
}
