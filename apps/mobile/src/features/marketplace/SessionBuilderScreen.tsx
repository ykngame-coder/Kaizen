import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { EmptyState, Icon, Screen, SegmentedControl, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { suggestProgression, type ProgressionSuggestion } from '@supotsu/engines';
import type { Visibility } from '@supotsu/core';
import { toCatalogExercise } from '@/features/exercises/catalog';
import { useAuth } from '@/features/auth/AuthProvider';
import { loadFavorites, toggleFavorite } from '@/features/exercises/favorites';
import {
  useAddUserSession,
  useCustomExercises,
  useExerciseHistory,
  useSessionBlocks as useSessionBlocksQuery,
  useSessionExercises,
  useUpdateUserSession,
  useUserSessions,
} from '@/lib/data/queries';
import { BackButton } from '@/features/navigation/BackButton';
import { blocksToSessionInput, useSessionBlocks, type BlockDraft } from '@/features/training/sessionBuilder';
import { sessionToBlockDrafts } from '@/features/training/sessionToDrafts';
import { SessionBlocksEditor } from '@/features/training/SessionBlocksEditor';

const SESSIONS_QUOTA = 50;

/**
 * Create or edit a reusable session template (exercises without a date) — the
 * "séance" library behind programmes. Same block editor as Nouvelle séance /
 * Modifier la séance (harmonized creation flow).
 *
 * With an `id` param it edits that session. The form is a separate component so
 * that it only mounts once the session has loaded: `useSessionBlocks` seeds its
 * state from `initialName`/`initialBlocks` on first render only, so mounting it
 * against a still-empty query would leave the editor blank for good.
 */
export function SessionBuilderScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();
  const sessionId = typeof params.id === 'string' && params.id ? params.id : undefined;

  const { data: sessions = [], isLoading: sessionsLoading } = useUserSessions();
  const { data: storedBlocks = [], isLoading: blocksLoading } = useSessionBlocksQuery(sessionId);
  const { data: storedExercises = [], isLoading: exercisesLoading } = useSessionExercises(sessionId);

  const existing = sessionId ? sessions.find((s) => s.id === sessionId) : undefined;
  const loading = !!sessionId && (sessionsLoading || blocksLoading || exercisesLoading);

  const initialBlocks = useMemo(
    () => (existing ? sessionToBlockDrafts(storedBlocks, storedExercises) : undefined),
    [existing?.id, storedBlocks, storedExercises],
  );

  if (loading) {
    return (
      <Screen>
        <BackButton />
        <Text variant="body" color="textMuted">{t('common.loading')}</Text>
      </Screen>
    );
  }

  if (sessionId && !existing) {
    return (
      <Screen>
        <EmptyState
          icon={<Icon name="dumbbell" size={44} color={colors.textSubtle} />}
          title={t('sport.sessionBuilder.notFound.title')}
          message={t('sport.sessionBuilder.notFound.message')}
          actionLabel={t('common.back')}
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  return (
    <SessionForm
      key={sessionId ?? 'new'}
      sessionId={sessionId}
      initialName={existing?.name}
      initialBlocks={initialBlocks}
      initialVisibility={existing?.visibility ?? 'private'}
      sessionCount={sessions.length}
    />
  );
}

interface SessionFormProps {
  /** Absent when creating. */
  sessionId?: string;
  initialName?: string;
  initialBlocks?: BlockDraft[];
  initialVisibility: Visibility;
  sessionCount: number;
}

function SessionForm({
  sessionId,
  initialName,
  initialBlocks,
  initialVisibility,
  sessionCount,
}: SessionFormProps): React.JSX.Element {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { data: customExercises = [] } = useCustomExercises();
  const { data: history = {} } = useExerciseHistory();
  const addSession = useAddUserSession();
  const updateSession = useUpdateUserSession();
  const isEdit = !!sessionId;

  const isCustomExercise = (exId: string): boolean => exId.startsWith('custom-');
  const catalogCustom = useMemo(() => customExercises.map(toCatalogExercise), [customExercises]);
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
    initialName,
    initialBlocks,
    customExercises: catalogCustom,
    recentExerciseIds,
    lastKnownFor,
  });
  const [visibility, setVisibility] = useState<'private' | 'public'>(
    initialVisibility === 'public' ? 'public' : 'private',
  );
  const [error, setError] = useState<string | null>(null);

  // Le quota ne borne que la création : éditer une séance existante n'en ajoute pas.
  const atQuota = !isEdit && sessionCount >= SESSIONS_QUOTA;
  const saving = addSession.isPending || updateSession.isPending;

  const submit = async (): Promise<void> => {
    setError(null);
    if (!builder.name.trim() || !builder.hasAnyExercise) {
      setError(t('sport.sessionBuilder.errors.missingFields'));
      return;
    }
    const input = {
      name: builder.name.trim(),
      visibility,
      blocks: blocksToSessionInput(builder.blocks),
    };
    try {
      if (sessionId) await updateSession.mutateAsync({ sessionId, input });
      else await addSession.mutateAsync(input);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('sport.sessionBuilder.errors.saveFailed'));
    }
  };

  if (atQuota) {
    return (
      <Screen>
        <EmptyState
          icon={<Icon name="packageBox" size={44} color={colors.textSubtle} />}
          title={t('sport.sessionBuilder.quota.title')}
          message={t('sport.sessionBuilder.quota.message', { quota: SESSIONS_QUOTA })}
          actionLabel={t('common.back')}
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <BackButton />
      <Text variant="title">
        {isEdit ? t('sport.sessionBuilder.editTitle') : t('sport.sessionBuilder.title')}
      </Text>
      {isEdit ? null : (
        <Text variant="caption" color="textSubtle" style={{ marginBottom: spacing[3] }}>
          {t('sport.sessionBuilder.quotaCaption', { count: sessionCount, quota: SESSIONS_QUOTA })}
        </Text>
      )}
      <SessionBlocksEditor
        t={t}
        builder={builder}
        isCustomExercise={isCustomExercise}
        lastKnownFor={lastKnownFor}
        suggestionFor={suggestionFor}
        favorites={favorites}
        onToggleFavorite={onToggleFavorite}
        onCreateExercise={() => router.push('/sport/exercise/new')}
        error={error}
        saving={saving}
        saveLabel={
          saving
            ? t('sport.sessionBuilder.form.submitPending')
            : isEdit
              ? t('sport.sessionBuilder.form.submitEdit')
              : t('sport.sessionBuilder.form.submitLibrary')
        }
        onSave={submit}
        cancelLabel={t('common.cancel')}
        onCancel={() => router.back()}
        headerAfterName={
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
            <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[1] }}>
              {visibility === 'private' ? t('sport.sessionBuilder.visibility.privateHint') : t('sport.sessionBuilder.visibility.publicHint')}
            </Text>
          </View>
        }
      />
    </Screen>
  );
}
