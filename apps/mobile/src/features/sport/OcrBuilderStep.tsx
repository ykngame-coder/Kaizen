import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen, SegmentedControl, Text, Toggle, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
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
} from '@/lib/data/queries';
import {
  blocksToSessionInput,
  blocksToWorkoutInput,
  useSessionBlocks,
  type BlockDraft,
} from '@/features/training/sessionBuilder';
import { SessionBlocksEditor } from '@/features/training/SessionBlocksEditor';

const SESSIONS_QUOTA = 50;

export interface OcrBuilderStepProps {
  initialName: string;
  /** The reviewed screenshot, as one strength block. */
  initialBlock: BlockDraft;
}

/**
 * Second half of the screenshot import: the reviewed lines handed to the same
 * builder as Nouvelle séance / Modifier la séance / Programmes.
 *
 * The import used to carry its own editor, which is why an imported session
 * could only ever be a single strength block — no second block, no AMRAP, no
 * Tabata, no warm-up, no progression suggestion. Mounted as its own component
 * so `useSessionBlocks` is seeded once, on mount.
 */
export function OcrBuilderStep({ initialName, initialBlock }: OcrBuilderStepProps): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { data: customExercises = [] } = useCustomExercises();
  const { data: history = {} } = useExerciseHistory();
  const { data: userSessions = [] } = useUserSessions();
  const addCircuitWorkout = useAddCircuitWorkout();
  const addUserSession = useAddUserSession();

  const catalogCustom = useMemo(() => customExercises.map(toCatalogExercise), [customExercises]);
  const recentExerciseIds = useMemo(() => Object.keys(history), [history]);
  const isCustomExercise = (exId: string): boolean => exId.startsWith('custom-');

  const lastKnownFor = (exerciseId: string): { reps?: number; weightKg?: number } | undefined => {
    const sets = history[exerciseId];
    if (!sets || sets.length === 0) return undefined;
    const top = [...sets].sort((a, b) => (b.weightKg ?? 0) - (a.weightKg ?? 0))[0]!;
    return { reps: top.reps, weightKg: top.weightKg };
  };
  const suggestionFor = (exerciseId: string): ProgressionSuggestion | undefined =>
    suggestProgression(history[exerciseId] ?? []);

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
    initialName,
    initialBlocks: [initialBlock],
    customExercises: catalogCustom,
    recentExerciseIds,
    lastKnownFor,
  });
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [addToLibrary, setAddToLibrary] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const atQuota = userSessions.length >= SESSIONS_QUOTA;
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
      await addCircuitWorkout.mutateAsync({
        name: builder.name.trim(),
        blocks: blocksToWorkoutInput(builder.blocks),
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

  return (
    <Screen>
      <Text variant="title">{t('sport.ocrImport.title')}</Text>
      <Text variant="caption" color="textMuted" style={{ marginBottom: spacing[3] }}>
        {t('sport.ocrImport.builderSubtitle')}
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
