import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, Input, Screen, SegmentedControl, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { scaleMacros } from '@supotsu/connectors';
import type { FoodItem } from '@supotsu/core';
import { type NutritionEntryInput } from '@supotsu/shared';
import { useAddNutritionEntry } from '@/lib/data/queries';
import { getFoodByBarcode, searchFoods } from './foodSearch';

/** Search foods on Open Food Facts and log a portion (Master Prompt P11). */
export function FoodSearchScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const addMeal = useAddNutritionEntry();
  const params = useLocalSearchParams<{ barcode?: string }>();

  const MEALS = [
    { value: 'breakfast', label: t('nutrition.foodSearch.meals.breakfast') },
    { value: 'lunch', label: t('nutrition.foodSearch.meals.lunch') },
    { value: 'dinner', label: t('nutrition.foodSearch.meals.dinner') },
    { value: 'snack', label: t('nutrition.foodSearch.meals.snack') },
  ] as const;

  const [query, setQuery] = useState('');
  const [barcode, setBarcode] = useState('');
  const [results, setResults] = useState<FoodItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<FoodItem | null>(null);
  const [grams, setGrams] = useState('100');
  const [mealType, setMealType] = useState<(typeof MEALS)[number]['value']>('lunch');

  const runSearch = async (): Promise<void> => {
    setError(null);
    setLoading(true);
    setSelected(null);
    try {
      const found = await searchFoods(query);
      setResults(found);
      if (found.length === 0) setError(t('nutrition.foodSearch.errors.noResults'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('nutrition.foodSearch.errors.searchFailed'));
    } finally {
      setLoading(false);
    }
  };

  const lookupBarcode = async (code: string): Promise<void> => {
    setError(null);
    setLoading(true);
    setSelected(null);
    try {
      const food = await getFoodByBarcode(code);
      if (food) {
        setResults([food]);
        pick(food);
      } else {
        setResults([]);
        setError(t('nutrition.foodSearch.errors.barcodeNotFound'));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('nutrition.foodSearch.errors.searchFailed'));
    } finally {
      setLoading(false);
    }
  };

  const pick = (food: FoodItem): void => {
    setSelected(food);
    setGrams(food.servingSizeG ? String(food.servingSizeG) : '100');
  };

  // Arriving from the scanner with a barcode param → look it up automatically.
  useEffect(() => {
    if (params.barcode) {
      setBarcode(params.barcode);
      void lookupBarcode(params.barcode);
    }
  }, [params.barcode]);

  const portion = selected ? scaleMacros(selected, Number(grams) || 0) : null;

  const add = async (): Promise<void> => {
    if (!selected || !portion) return;
    const input: NutritionEntryInput = {
      mealType,
      description: selected.brand
        ? t('nutrition.foodSearch.descriptionWithBrand', { name: selected.name, brand: selected.brand, grams })
        : t('nutrition.foodSearch.description', { name: selected.name, grams }),
      kcal: portion.kcal,
      proteinG: portion.proteinG,
      carbG: portion.carbG,
      fatG: portion.fatG,
      source: 'manual',
      loggedAt: new Date().toISOString(),
    };
    try {
      await addMeal.mutateAsync(input);
      router.back();
    } catch {
      setError(t('nutrition.foodSearch.errors.saveFailed'));
    }
  };

  return (
    <Screen scroll>
      <Text variant="title">{t('nutrition.foodSearch.title')}</Text>
      <Text variant="caption" color="textMuted">
        {t('nutrition.foodSearch.subtitle')}
      </Text>

      <View style={{ flexDirection: 'row', gap: spacing[2], alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <Input label={t('nutrition.foodSearch.nameLabel')} value={query} onChangeText={setQuery} />
        </View>
        <Button label={loading ? '…' : t('nutrition.foodSearch.searchButton')} onPress={runSearch} disabled={loading} />
      </View>

      <View style={{ flexDirection: 'row', gap: spacing[2], alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <Input label={t('nutrition.foodSearch.barcodeLabel')} keyboardType="numeric" value={barcode} onChangeText={setBarcode} />
        </View>
        <Button label={t('nutrition.foodSearch.searchButton')} variant="secondary" onPress={() => lookupBarcode(barcode)} disabled={loading} />
      </View>

      <Button label={t('nutrition.foodSearch.scanButton')} onPress={() => router.push('/nutrition/food/scan')} fullWidth />

      {error ? <Badge label={error} tone="warning" /> : null}

      {selected && portion ? (
        <Card>
          <Text variant="heading">{selected.name}</Text>
          {selected.brand ? (
            <Text variant="caption" color="textMuted">
              {selected.brand}
            </Text>
          ) : null}
          <Input label={t('nutrition.foodSearch.quantityLabel')} keyboardType="numeric" value={grams} onChangeText={setGrams} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            <Badge label={t('nutrition.foodSearch.badges.kcal', { kcal: portion.kcal })} tone="info" />
            <Badge label={t('nutrition.foodSearch.badges.protein', { value: portion.proteinG })} tone="neutral" />
            <Badge label={t('nutrition.foodSearch.badges.carb', { value: portion.carbG })} tone="neutral" />
            <Badge label={t('nutrition.foodSearch.badges.fat', { value: portion.fatG })} tone="neutral" />
          </View>
          <View style={{ gap: spacing[2] }}>
            <Text variant="label" color="textMuted">
              {t('nutrition.foodSearch.momentLabel')}
            </Text>
            <SegmentedControl options={MEALS} value={mealType} onChange={setMealType} />
          </View>
          <Button
            label={addMeal.isPending ? '…' : t('nutrition.foodSearch.addButton')}
            onPress={add}
            disabled={addMeal.isPending}
            fullWidth
          />
        </Card>
      ) : null}

      {results.length > 0 ? (
        <View style={{ gap: spacing[2] }}>
          <Text variant="label" color="textMuted">
            {t('nutrition.foodSearch.resultsLabel')}
          </Text>
          {results.map((food, i) => (
            <Pressable
              key={`${food.barcode ?? food.name}-${i}`}
              onPress={() => pick(food)}
              style={{
                padding: spacing[3],
                borderRadius: radii.md,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: selected === food ? colors.primary : colors.border,
              }}
            >
              <Text variant="body">{food.name}</Text>
              <Text variant="caption" color="textMuted">
                {food.brand ? `${food.brand} · ` : ''}
                {t('nutrition.foodSearch.perServing', { kcal: food.per100g.kcal })}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={{ alignItems: 'flex-start' }}>
        <Button label={t('nutrition.foodSearch.backButton')} variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
