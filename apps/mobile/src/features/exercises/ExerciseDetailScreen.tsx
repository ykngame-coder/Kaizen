import React, { useMemo } from 'react';
import { Image, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, EmptyState, Icon, Screen, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { EXERCISES, MUSCLE_LABEL, exerciseImageUrl } from './catalog';

/** Exercise detail — image, targeted muscles, equipment/level, step-by-step instructions. */
export function ExerciseDetailScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const exercise = useMemo(() => EXERCISES.find((e) => e.id === id), [id]);

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
      </View>
    </Screen>
  );
}
