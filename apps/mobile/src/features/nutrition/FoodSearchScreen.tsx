import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Badge, Button, Card, Input, Screen, SegmentedControl, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { scaleMacros } from '@supotsu/connectors';
import type { FoodItem } from '@supotsu/core';
import { type NutritionEntryInput } from '@supotsu/shared';
import { useAddNutritionEntry } from '@/lib/data/queries';
import { getFoodByBarcode, searchFoods } from './foodSearch';

const MEALS = [
  { value: 'breakfast', label: 'Petit-déj' },
  { value: 'lunch', label: 'Déjeuner' },
  { value: 'dinner', label: 'Dîner' },
  { value: 'snack', label: 'Collation' },
] as const;

/** Search foods on Open Food Facts and log a portion (Master Prompt P11). */
export function FoodSearchScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const addMeal = useAddNutritionEntry();
  const params = useLocalSearchParams<{ barcode?: string }>();

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
      if (found.length === 0) setError('Aucun aliment trouvé pour cette recherche.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Recherche impossible.');
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
        setError('Code-barres inconnu dans Open Food Facts.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Recherche impossible.');
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
      description: `${selected.name}${selected.brand ? ` (${selected.brand})` : ''} · ${grams} g`,
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
      setError('Enregistrement impossible.');
    }
  };

  return (
    <Screen scroll>
      <Text variant="title">Chercher un aliment</Text>
      <Text variant="caption" color="textMuted">
        Base ouverte Open Food Facts — macros par 100 g, recalculées pour ta portion.
      </Text>

      <View style={{ flexDirection: 'row', gap: spacing[2], alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <Input label="Nom (ex. yaourt grec)" value={query} onChangeText={setQuery} />
        </View>
        <Button label={loading ? '…' : 'Chercher'} onPress={runSearch} disabled={loading} />
      </View>

      <View style={{ flexDirection: 'row', gap: spacing[2], alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <Input label="Code-barres" keyboardType="numeric" value={barcode} onChangeText={setBarcode} />
        </View>
        <Button label="Chercher" variant="secondary" onPress={() => lookupBarcode(barcode)} disabled={loading} />
      </View>

      <Button label="📷 Scanner un code-barres" onPress={() => router.push('/nutrition/food/scan')} fullWidth />

      {error ? <Badge label={error} tone="warning" /> : null}

      {selected && portion ? (
        <Card>
          <Text variant="heading">{selected.name}</Text>
          {selected.brand ? (
            <Text variant="caption" color="textMuted">
              {selected.brand}
            </Text>
          ) : null}
          <Input label="Quantité (g)" keyboardType="numeric" value={grams} onChangeText={setGrams} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            <Badge label={`${portion.kcal} kcal`} tone="info" />
            <Badge label={`P ${portion.proteinG} g`} tone="neutral" />
            <Badge label={`G ${portion.carbG} g`} tone="neutral" />
            <Badge label={`L ${portion.fatG} g`} tone="neutral" />
          </View>
          <View style={{ gap: spacing[2] }}>
            <Text variant="label" color="textMuted">
              MOMENT
            </Text>
            <SegmentedControl options={MEALS} value={mealType} onChange={setMealType} />
          </View>
          <Button
            label={addMeal.isPending ? '…' : 'Ajouter au journal'}
            onPress={add}
            disabled={addMeal.isPending}
            fullWidth
          />
        </Card>
      ) : null}

      {results.length > 0 ? (
        <View style={{ gap: spacing[2] }}>
          <Text variant="label" color="textMuted">
            RÉSULTATS
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
                {food.per100g.kcal} kcal / 100 g
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={{ alignItems: 'flex-start' }}>
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
