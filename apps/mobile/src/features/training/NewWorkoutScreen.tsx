import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Screen, SegmentedControl, Text, Toggle, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { EXERCISE_LIBRARY } from '@supotsu/shared';
import { suggestProgression, type ProgressionSuggestion } from '@supotsu/engines';
import { toCatalogExercise } from '@/features/exercises/catalog';
import { useAuth } from '@/features/auth/AuthProvider';
import { loadFavorites, toggleFavorite } from '@/features/exercises/favorites';
import {
  useAddCircuitWorkout,
  useAddUserSession,
  useCustomExercises,
  useExerciseHistory,
  useUserSessions,
  useWorkouts,
  useWorkoutSets,
} from '@/lib/data/queries';
import { blocksToSessionInput, newSlotId, useSessionBlocks, type SetDraft } from './sessionBuilder';
import { SessionBlocksEditor } from './SessionBlocksEditor';

const SESSIONS_QUOTA = 50;
/** Name Garmin imports are stored under (repository.ts upsertImportedWorkouts) — flags the badge below. */
const GARMIN_IMPORT_NAME = 'Musculation (import Garmin)';

/**
 * Create a session plan: name, one or more blocks (Musculation/AMRAP/EMOM/
 * Pour le temps), each with its own search + add exercises, set target
 * reps/charge. Same block editor as EditWorkoutScreen and SessionBuilderScreen
 * (harmonized creation flow) — see SessionBlocksEditor.
 */
export function NewWorkoutScreen(): React.JSX.Element {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ openPicker?: string }>();
  const addCircuitWorkout = useAddCircuitWorkout();
  const addUserSession = useAddUserSession();
  const { data: history = {} } = useExerciseHistory();
  const { data: customExercises = [] } = useCustomExercises();
  const { data: allWorkouts = [] } = useWorkouts();
  const { data: userSessions = [] } = useUserSessions();

  const isCustomExercise = (id: string): boolean => id.startsWith('custom-');
  const catalogCustom = useMemo(() => customExercises.map(toCatalogExercise), [customExercises]);
  const resolvableExercises = useMemo(() => EXERCISE_LIBRARY.map(toCatalogExercise), []);
  const recentExerciseIds = useMemo(() => Object.keys(history), [history]);

  const lastKnownFor = (exerciseId: string): { reps?: number; weightKg?: number } | undefined => {
    const sets = history[exerciseId];
    if (!sets || sets.length === 0) return undefined;
    const top = [...sets].sort((a, b) => (b.weightKg ?? 0) - (a.weightKg ?? 0))[0]!;
    return { reps: top.reps, weightKg: top.weightKg };
  };

  /** Surcharge progressive proposée d'après la dernière séance — éditable, jamais imposée. */
  const suggestionFor = (exerciseId: string): ProgressionSuggestion | undefined =>
    suggestProgression(history[exerciseId] ?? []);

  const { user } = useAuth();
  const [favorites, setFavorites] = useState<string[]>([]);
  useEffect(() => {
    if (!user) return;
    void loadFavorites(user.id).then(setFavorites);
  }, [user?.id]);
  const onToggleFavorite = async (exerciseId: string): Promise<void> => {
    if (!user) return;
    setFavorites(await toggleFavorite(user.id, exerciseId));
  };

  const builder = useSessionBlocks({
    customExercises: catalogCustom,
    resolvableExercises,
    recentExerciseIds,
    lastKnownFor,
  });

  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [addToLibrary, setAddToLibrary] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const atQuota = userSessions.length >= SESSIONS_QUOTA;

  // "Importer une séance déjà faite" (pastWorkouts picker) is paused — kept
  // wired (pickerOpen/importSourceId below) for when it comes back, but has
  // no UI entry point.
  const [pickerOpen, setPickerOpen] = useState(params.openPicker === '1');
  const [importSourceId, setImportSourceId] = useState<string | undefined>();
  const pastWorkouts = useMemo(
    () => [...allWorkouts].filter((w) => w.status === 'completed').sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')),
    [allWorkouts],
  );
  const { data: importSets } = useWorkoutSets(importSourceId);
  useEffect(() => {
    if (!importSourceId || !importSets) return;
    const source = allWorkouts.find((w) => w.id === importSourceId);
    const nextOrder: string[] = [];
    const nextSelected: Record<string, SetDraft> = {};
    for (const s of [...importSets].sort((a, b) => a.order - b.order)) {
      const slotId = newSlotId(s.exerciseId);
      nextOrder.push(slotId);
      nextSelected[slotId] = {
        exerciseId: s.exerciseId,
        reps: s.reps != null ? String(s.reps) : '',
        weight: s.weightKg != null ? String(s.weightKg) : '',
        rest: s.restSec != null ? String(s.restSec) : '',
      };
    }
    if (source && source.name !== GARMIN_IMPORT_NAME) {
      builder.setName((prev) => (prev.trim() ? prev : source.name));
    }
    builder.setBlocks([{ format: 'strength', timeCapSec: '12', targetRounds: '', order: nextOrder, selected: nextSelected, supersetGroups: {} }]);
    builder.setActiveBlock(0);
    setImportSourceId(undefined);
    setPickerOpen(false);
  }, [importSourceId, importSets, allWorkouts]);

  const isPending = addCircuitWorkout.isPending || addUserSession.isPending;

  const submit = async (): Promise<void> => {
    setError(null);
    if (!builder.name.trim()) {
      setError(t('sport.sessionBuilder.errors.missingName'));
      return;
    }
    if (builder.blocks.every((b) => b.order.length === 0)) {
      setError(t('sport.sessionBuilder.errors.missingExercise'));
      return;
    }
    try {
      // Always a circuit-shaped workout (even a plain single strength block)
      // so every newly created session — not just AMRAP/EMOM circuits — is
      // immediately eligible for the live runner (WorkoutDetailScreen's
      // "Commencer" button and CircuitRunnerScreen both require at least one
      // workout_blocks row).
      await addCircuitWorkout.mutateAsync({
        name: builder.name.trim(),
        blocks: builder.blocks.map((b) => ({
          format: b.format,
          timeCapSec:
            b.format === 'amrap' || b.format === 'for_time'
              ? (Number(b.timeCapSec) || 0) * 60 || undefined
              : b.format === 'emom'
                ? Number(b.timeCapSec) || undefined
                : undefined,
          targetRounds: b.format === 'emom' || b.format === 'for_time' || b.format === 'strength' ? Number(b.targetRounds) || undefined : undefined,
          sets: b.order.map((slotId, i) => {
            const s = b.selected[slotId]!;
            return {
              exerciseId: s.exerciseId,
              order: i,
              reps: s.reps ? Number(s.reps) : undefined,
              weightKg: s.weight ? Number(s.weight) : undefined,
              restSec: b.format === 'strength' && s.rest ? Number(s.rest) : undefined,
              supersetGroup: b.supersetGroups[slotId],
            };
          }),
        })),
      });
      if (addToLibrary && !atQuota) {
        await addUserSession.mutateAsync({
          name: builder.name.trim(),
          visibility,
          blocks: blocksToSessionInput(builder.blocks),
        });
      }
      router.back();
    } catch {
      setError(t('sport.sessionBuilder.errors.saveFailed'));
    }
  };

  const { colors } = useTheme();

  return (
    <Screen>
      <Text variant="title">{t('sport.newWorkout.title')}</Text>
      <Text variant="caption" color="textMuted" style={{ marginBottom: spacing[3] }}>
        {t('sport.newWorkout.subtitle')}
      </Text>
      <SessionBlocksEditor
        t={t}
        builder={builder}
        isCustomExercise={isCustomExercise}
        onCreateExercise={() => router.push('/sport/exercise/new')}
        lastKnownFor={lastKnownFor}
        suggestionFor={suggestionFor}
        favorites={favorites}
        onToggleFavorite={onToggleFavorite}
        error={error}
        saving={isPending}
        saveLabel={isPending ? t('sport.sessionBuilder.form.submitPending') : t('sport.newWorkout.form.submit')}
        onSave={submit}
        cancelLabel={t('common.cancel')}
        onCancel={() => router.back()}
        headerTop={
          <Button label={t('sport.newWorkout.import.fromScreenshot')} variant="secondary" onPress={() => router.push('/sport/workout/import')} />
        }
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
                  {atQuota ? t('sport.sessionBuilder.addToLibrary.quotaReached') : t('sport.sessionBuilder.addToLibrary.hint')}
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
