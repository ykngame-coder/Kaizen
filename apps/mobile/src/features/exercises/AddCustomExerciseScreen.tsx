import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, FilterChip, Input, Screen, Text } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import type { MuscleGroup } from '@supotsu/core';
import { customExerciseInputSchema } from '@supotsu/shared';
import { BackButton } from '@/features/navigation/BackButton';
import { useAddCustomExercise } from '@/lib/data/queries';
import { MUSCLE_LABEL } from './catalog';

const MUSCLES: MuscleGroup[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core', 'full_body'];

/** Add a custom exercise the shared catalogue doesn't cover — home-gym equipment, a personal variant. */
export function AddCustomExerciseScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const addCustomExercise = useAddCustomExercise();

  const [name, setName] = useState('');
  const [primaryMuscle, setPrimaryMuscle] = useState<MuscleGroup | null>(null);
  const [equipment, setEquipment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setError(null);
    const parsed = customExerciseInputSchema.safeParse({
      name,
      primaryMuscle,
      equipment: equipment.trim() || undefined,
    });
    if (!parsed.success) {
      setError(t('sport.exercises.addCustom.errorMissingFields'));
      return;
    }
    try {
      await addCustomExercise.mutateAsync(parsed.data);
      router.back();
    } catch {
      setError(t('sport.exercises.addCustom.errorSaveFailed'));
    }
  };

  return (
    <Screen scroll>
      <BackButton />
      <Text variant="title">{t('sport.exercises.addCustom.title')}</Text>
      <Text variant="caption" color="textMuted">
        {t('sport.exercises.addCustom.subtitle')}
      </Text>

      <Input label={t('sport.exercises.addCustom.nameLabel')} placeholder={t('sport.exercises.addCustom.namePlaceholder')} value={name} onChangeText={setName} />

      <View style={{ gap: spacing[2] }}>
        <Text variant="label" color="textMuted">{t('sport.exercises.addCustom.muscleLabel')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
          {MUSCLES.map((m) => (
            <FilterChip key={m} label={MUSCLE_LABEL[m]} active={primaryMuscle === m} onPress={() => setPrimaryMuscle(m)} />
          ))}
        </View>
      </View>

      <Input
        label={t('sport.exercises.addCustom.equipmentLabel')}
        placeholder={t('sport.exercises.addCustom.equipmentPlaceholder')}
        value={equipment}
        onChangeText={setEquipment}
      />

      {error ? <Badge label={error} tone="error" /> : null}

      <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[2] }}>
        <Button label={t('common.cancel')} variant="secondary" onPress={() => router.back()} />
        <View style={{ flex: 1 }} />
        <Button
          label={addCustomExercise.isPending ? '…' : t('sport.exercises.addCustom.submit')}
          onPress={submit}
          disabled={addCustomExercise.isPending}
        />
      </View>
    </Screen>
  );
}
