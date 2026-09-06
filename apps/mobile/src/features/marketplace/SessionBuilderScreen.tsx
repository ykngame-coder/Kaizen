import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { EmptyState, Icon, Screen, SegmentedControl, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { suggestProgression, type ProgressionSuggestion } from '@supotsu/engines';
import { toCatalogExercise } from '@/features/exercises/catalog';
import { useAddUserSession, useCustomExercises, useExerciseHistory, useUserSessions } from '@/lib/data/queries';
import { BackButton } from '@/features/navigation/BackButton';
import { blocksToSessionInput, useSessionBlocks } from '@/features/training/sessionBuilder';
import { SessionBlocksEditor } from '@/features/training/SessionBlocksEditor';

const SESSIONS_QUOTA = 50;

/** Create a reusable session template (exercises without a date) — the "séance" library behind programmes. Same block editor as Nouvelle séance / Modifier la séance (harmonized creation flow). */
export function SessionBuilderScreen(): React.JSX.Element {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { data: sessions = [] } = useUserSessions();
  const { data: customExercises = [] } = useCustomExercises();
  const { data: history = {} } = useExerciseHistory();
  const addSession = useAddUserSession();

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

  const builder = useSessionBlocks({ customExercises: catalogCustom, recentExerciseIds, lastKnownFor });
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [error, setError] = useState<string | null>(null);

  const atQuota = sessions.length >= SESSIONS_QUOTA;

  const submit = async (): Promise<void> => {
    setError(null);
    if (!builder.name.trim() || !builder.hasAnyExercise) {
      setError(t('sport.sessionBuilder.errors.missingFields'));
      return;
    }
    try {
      await addSession.mutateAsync({
        name: builder.name.trim(),
        visibility,
        blocks: blocksToSessionInput(builder.blocks),
      });
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
      <Text variant="title">{t('sport.sessionBuilder.title')}</Text>
      <Text variant="caption" color="textSubtle" style={{ marginBottom: spacing[3] }}>
        {t('sport.sessionBuilder.quotaCaption', { count: sessions.length, quota: SESSIONS_QUOTA })}
      </Text>
      <SessionBlocksEditor
        t={t}
        builder={builder}
        isCustomExercise={isCustomExercise}
        lastKnownFor={lastKnownFor}
        suggestionFor={suggestionFor}
        onCreateExercise={() => router.push('/sport/exercise/new')}
        error={error}
        saving={addSession.isPending}
        saveLabel={addSession.isPending ? t('sport.sessionBuilder.form.submitPending') : t('sport.sessionBuilder.form.submitLibrary')}
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
