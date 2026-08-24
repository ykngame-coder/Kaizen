import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Input, Screen, SegmentedControl, Text } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { nutritionEntryInputSchema, type NutritionEntryInput } from '@supotsu/shared';
import { useAddNutritionEntry } from '@/lib/data/queries';

const numOrUndef = (s: string): number | undefined => (s ? Number(s) : undefined);

/** Manual meal logging form (Master Prompt P11 nutrition). */
export function AddMealScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const addMeal = useAddNutritionEntry();

  const MEALS = [
    { value: 'breakfast', label: t('nutrition.addMeal.meals.breakfast') },
    { value: 'lunch', label: t('nutrition.addMeal.meals.lunch') },
    { value: 'dinner', label: t('nutrition.addMeal.meals.dinner') },
    { value: 'snack', label: t('nutrition.addMeal.meals.snack') },
  ] as const;

  const [mealType, setMealType] = useState<(typeof MEALS)[number]['value']>('lunch');
  const [description, setDescription] = useState('');
  const [kcal, setKcal] = useState('');
  const [proteinG, setProteinG] = useState('');
  const [hydrationMl, setHydrationMl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setError(null);
    const candidate = {
      mealType,
      description,
      kcal: Number(kcal),
      proteinG: numOrUndef(proteinG),
      hydrationMl: numOrUndef(hydrationMl),
      source: 'manual' as const,
      loggedAt: new Date().toISOString(),
    };
    const parsed = nutritionEntryInputSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(t('nutrition.addMeal.errors.invalid'));
      return;
    }
    try {
      await addMeal.mutateAsync(parsed.data as NutritionEntryInput);
      router.back();
    } catch {
      setError(t('nutrition.addMeal.errors.saveFailed'));
    }
  };

  return (
    <Screen scroll>
      <Text variant="title">{t('nutrition.addMeal.title')}</Text>

      <Button
        label={t('nutrition.addMeal.searchButton')}
        variant="secondary"
        onPress={() => router.replace('/nutrition/food/search')}
      />

      <View style={{ gap: spacing[2] }}>
        <Text variant="label" color="textMuted">
          {t('nutrition.addMeal.momentLabel')}
        </Text>
        <SegmentedControl options={MEALS} value={mealType} onChange={setMealType} />
      </View>

      <Input label={t('nutrition.addMeal.descriptionLabel')} value={description} onChangeText={setDescription} />

      <View style={{ flexDirection: 'row', gap: spacing[4] }}>
        <View style={{ flex: 1 }}>
          <Input label={t('nutrition.addMeal.kcalLabel')} keyboardType="numeric" value={kcal} onChangeText={setKcal} />
        </View>
        <View style={{ flex: 1 }}>
          <Input
            label={t('nutrition.addMeal.proteinLabel')}
            keyboardType="numeric"
            value={proteinG}
            onChangeText={setProteinG}
          />
        </View>
      </View>

      <Input
        label={t('nutrition.addMeal.hydrationLabel')}
        keyboardType="numeric"
        value={hydrationMl}
        onChangeText={setHydrationMl}
      />

      {error ? <Badge label={error} tone="error" /> : null}

      <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[2] }}>
        <Button label={t('nutrition.addMeal.cancelButton')} variant="secondary" onPress={() => router.back()} />
        <View style={{ flex: 1 }} />
        <Button
          label={addMeal.isPending ? '…' : t('nutrition.addMeal.saveButton')}
          onPress={submit}
          disabled={addMeal.isPending}
        />
      </View>
    </Screen>
  );
}
