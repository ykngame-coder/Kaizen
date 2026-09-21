import React, { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, Input, SegmentedControl, Text } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { scaleMacros } from '@supotsu/connectors';
import type { FoodItem } from '@supotsu/core';
import { type NutritionEntryInput } from '@supotsu/shared';
import { useAddNutritionEntry } from '@/lib/data/queries';

export interface FoodLogCardProps {
  food: FoodItem;
  /** Appelé après un ajout réussi au journal — laisse l'appelant fermer/naviguer. */
  onLogged: () => void;
}

const MEAL_VALUES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

/** Journalise n'importe quel FoodItem (aliment OFF, personnalisé, ou recette calculée) — extrait de FoodSearchScreen. */
export function FoodLogCard({ food, onLogged }: FoodLogCardProps): React.JSX.Element {
  const { t } = useTranslation();
  const addMeal = useAddNutritionEntry();
  const [error, setError] = useState<string | null>(null);
  const [grams, setGrams] = useState(food.servingSizeG ? String(food.servingSizeG) : '100');
  const [mealType, setMealType] = useState<(typeof MEAL_VALUES)[number]>('lunch');

  const MEALS = MEAL_VALUES.map((value) => ({ value, label: t(`nutrition.foodSearch.meals.${value}`) }));
  const portion = scaleMacros(food, Number(grams) || 0);

  const add = async (): Promise<void> => {
    const input: NutritionEntryInput = {
      mealType,
      description: food.brand
        ? t('nutrition.foodSearch.descriptionWithBrand', { name: food.name, brand: food.brand, grams })
        : t('nutrition.foodSearch.description', { name: food.name, grams }),
      kcal: portion.kcal,
      proteinG: portion.proteinG,
      carbG: portion.carbG,
      fatG: portion.fatG,
      source: 'manual',
      loggedAt: new Date().toISOString(),
    };
    try {
      await addMeal.mutateAsync(input);
      onLogged();
    } catch {
      setError(t('nutrition.foodSearch.errors.saveFailed'));
    }
  };

  return (
    <Card>
      <Text variant="heading">{food.name}</Text>
      {food.brand ? <Text variant="caption" color="textMuted">{food.brand}</Text> : null}
      <Input label={t('nutrition.foodSearch.quantityLabel')} keyboardType="numeric" value={grams} onChangeText={setGrams} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        <Badge label={t('nutrition.foodSearch.badges.kcal', { kcal: portion.kcal })} tone="info" />
        <Badge label={t('nutrition.foodSearch.badges.protein', { value: portion.proteinG })} tone="neutral" />
        <Badge label={t('nutrition.foodSearch.badges.carb', { value: portion.carbG })} tone="neutral" />
        <Badge label={t('nutrition.foodSearch.badges.fat', { value: portion.fatG })} tone="neutral" />
      </View>
      <View style={{ gap: spacing[2] }}>
        <Text variant="label" color="textMuted">{t('nutrition.foodSearch.momentLabel')}</Text>
        <SegmentedControl options={MEALS} value={mealType} onChange={setMealType} />
      </View>
      {error ? <Badge label={error} tone="warning" /> : null}
      <Button label={addMeal.isPending ? '…' : t('nutrition.foodSearch.addButton')} onPress={add} disabled={addMeal.isPending} fullWidth />
    </Card>
  );
}
