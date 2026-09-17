import React, { useMemo } from 'react';
import { Alert, Image, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, EmptyState, Icon, Screen, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { useCustomExercises, useDeleteCustomExercise } from '@/lib/data/queries';
import { EXERCISES, MUSCLE_LABEL, exerciseImageUrl, toCatalogExercise } from './catalog';

/** Exercise detail — image, targeted muscles, equipment/level, step-by-step instructions. */
export function ExerciseDetailScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: customExercises = [] } = useCustomExercises();
  const deleteCustomExercise = useDeleteCustomExercise();
  // Un exercice perso n'est jamais dans le catalogue statique — sans ce
  // repli, sa fiche affichait "introuvable" bien qu'il existe (retour
  // TestFlight : impossible de retrouver/supprimer un exercice perso).
  const custom = useMemo(() => customExercises.find((e) => e.id === id), [customExercises, id]);
  const exercise = useMemo(() => EXERCISES.find((e) => e.id === id) ?? (custom ? toCatalogExercise(custom) : undefined), [id, custom]);
  const isCustom = !!custom;

  const askDelete = (): void => {
    if (!custom) return;
    Alert.alert(
      t('sport.exercises.detail.deleteConfirmTitle', { name: custom.name }),
      t('sport.exercises.detail.deleteConfirmMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('sport.exercises.detail.deleteAction'),
          style: 'destructive',
          onPress: () => {
            deleteCustomExercise.mutate(custom.id, {
              onSuccess: () => router.back(),
              onError: (error) => {
                const inUse = error instanceof Error && error.message === 'EXERCISE_IN_USE';
                Alert.alert(
                  t('sport.exercises.detail.deleteErrorTitle'),
                  inUse ? t('sport.exercises.detail.deleteInUseMessage') : t('sport.exercises.detail.deleteGenericMessage'),
                );
              },
            });
          },
        },
      ],
    );
  };

  if (!exercise) {
    return (
      <Screen scroll>
        <EmptyState icon={<Icon name="dumbbell" size={44} color={colors.textSubtle} />} title={t('sport.exercises.detail.notFoundTitle')} message={t('sport.exercises.detail.notFoundMessage')} actionLabel={t('common.back')} onAction={() => router.back()} />
      </Screen>
    );
  }

  const img = exerciseImageUrl(exercise.image);
  const muscles = [exercise.primary, ...exercise.secondary];

  return (
    <Screen scroll>
      <Text variant="title">{exercise.name}</Text>
      <Text variant="caption" color="textSubtle">{MUSCLE_LABEL[exercise.primary]} · {exercise.category}</Text>

      {img ? (
        <View style={{ borderRadius: radii.xl, overflow: 'hidden', backgroundColor: colors.surfaceElevated }}>
          <Image source={{ uri: img }} style={{ width: '100%', aspectRatio: 4 / 3 }} resizeMode="cover" />
        </View>
      ) : null}

      {/* Meta badges */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        {isCustom ? <Badge label={t('sport.exercises.detail.customBadge')} tone="success" /> : null}
        <Badge label={exercise.equipment} tone="info" />
        <Badge label={exercise.level} tone="neutral" />
        {exercise.mechanic ? <Badge label={exercise.mechanic === 'compound' ? t('sport.exercises.detail.mechanicCompound') : t('sport.exercises.detail.mechanicIsolation')} tone="neutral" /> : null}
      </View>

      {/* Muscles */}
      <Card>
        <Text variant="heading">{t('sport.exercises.detail.targetMusclesHeading')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[2] }}>
          {muscles.map((m, i) => (
            <View key={`${m}-${i}`} style={{ borderRadius: radii.full, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: i === 0 ? 'rgba(45,127,249,0.16)' : colors.surfaceElevated, borderWidth: 1, borderColor: i === 0 ? 'rgba(45,127,249,0.35)' : colors.border }}>
              <Text variant="caption" style={{ color: i === 0 ? colors.primary : colors.textMuted, fontWeight: '600' }}>{MUSCLE_LABEL[m]}{i === 0 ? t('sport.exercises.detail.primaryMuscleSuffix') : ''}</Text>
            </View>
          ))}
        </View>
      </Card>

      {/* Instructions */}
      {exercise.instructions.length > 0 ? (
        <Card>
          <Text variant="heading">{t('sport.exercises.detail.executionHeading')}</Text>
          <View style={{ gap: spacing[3], marginTop: spacing[3] }}>
            {exercise.instructions.map((step, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: spacing[3] }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}><Text variant="caption" style={{ fontWeight: '800' }}>{i + 1}</Text></View>
                <Text variant="body" color="textMuted" style={{ flex: 1, lineHeight: 21 }}>{step}</Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      <View style={{ flexDirection: 'row', gap: spacing[3] }}>
        <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
        {isCustom ? (
          <Button
            label={t('sport.exercises.detail.deleteAction')}
            variant="danger"
            onPress={askDelete}
            disabled={deleteCustomExercise.isPending}
          />
        ) : null}
      </View>
    </Screen>
  );
}
