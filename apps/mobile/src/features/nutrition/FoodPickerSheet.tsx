import React, { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, Input, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { FoodItem } from '@supotsu/core';
import { useAddCustomFood, useCustomFoodLookup } from '@/lib/data/queries';
import { getFoodByBarcode, searchFoods } from './foodSearch';
import { takePendingBarcode } from './barcodeHandoff';

export interface FoodPickerSheetProps {
  visible: boolean;
  onPick: (food: FoodItem) => void;
  /** L'aliment déjà choisi (géré par le parent) — sert uniquement à surligner la bonne carte dans les résultats. */
  selected?: FoodItem | null;
  /** Appelé au tout début d'une nouvelle recherche/lookup — laisse le parent effacer une sélection précédente. */
  onSearchStart?: () => void;
}

/** Recherche un aliment (nom, code-barres, scan) avec repli en saisie manuelle si introuvable — extrait de FoodSearchScreen pour être réutilisé par l'écran de recette. */
export function FoodPickerSheet({ visible, onPick, selected, onSearchStart }: FoodPickerSheetProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const lookupCustomFood = useCustomFoodLookup();
  const addCustomFood = useAddCustomFood();

  const [query, setQuery] = useState('');
  const [barcode, setBarcode] = useState('');
  const [results, setResults] = useState<FoodItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [notFoundBarcode, setNotFoundBarcode] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newKcal, setNewKcal] = useState('');
  const [newProtein, setNewProtein] = useState('');
  const [newCarb, setNewCarb] = useState('');
  const [newFat, setNewFat] = useState('');

  const runSearch = async (): Promise<void> => {
    onSearchStart?.();
    setError(null);
    setLoading(true);
    setNotFoundBarcode(null);
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
    onSearchStart?.();
    setError(null);
    setLoading(true);
    setNotFoundBarcode(null);
    try {
      const food = await getFoodByBarcode(code);
      if (food) {
        setResults([food]);
        onPick(food);
        return;
      }
      const custom = await lookupCustomFood(code);
      if (custom) {
        setResults([custom]);
        onPick(custom);
        return;
      }
      setResults([]);
      setNewName('');
      setNewKcal('');
      setNewProtein('');
      setNewCarb('');
      setNewFat('');
      setNotFoundBarcode(code);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('nutrition.foodSearch.errors.searchFailed'));
    } finally {
      setLoading(false);
    }
  };

  const submitNewFood = async (): Promise<void> => {
    const kcal = Number(newKcal);
    if (!notFoundBarcode || !newName.trim() || !newKcal.trim() || !Number.isFinite(kcal) || kcal < 0) {
      setError(t('nutrition.foodSearch.notFound.invalid'));
      return;
    }
    setError(null);
    try {
      const food = await addCustomFood.mutateAsync({
        barcode: notFoundBarcode,
        description: newName.trim(),
        kcal,
        proteinG: newProtein.trim() ? Number(newProtein) : undefined,
        carbG: newCarb.trim() ? Number(newCarb) : undefined,
        fatG: newFat.trim() ? Number(newFat) : undefined,
      });
      setNotFoundBarcode(null);
      setResults([food]);
      onPick(food);
    } catch {
      setError(t('nutrition.foodSearch.notFound.saveFailed'));
    }
  };

  useFocusEffect(
    useCallback(() => {
      const code = takePendingBarcode();
      if (code) {
        setBarcode(code);
        void lookupBarcode(code);
      }
    }, []),
  );

  if (!visible) return null;

  return (
    <View style={{ gap: spacing[3] }}>
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

      <Button
        label={t('nutrition.foodSearch.scanButton')}
        onPress={() => router.push('/nutrition/food/scan')}
        fullWidth
      />

      {error ? <Badge label={error} tone="warning" /> : null}

      {notFoundBarcode ? (
        <Card>
          <Text variant="heading">{t('nutrition.foodSearch.notFound.title')}</Text>
          <Text variant="caption" color="textMuted">
            {t('nutrition.foodSearch.notFound.message')}
          </Text>
          <Input label={t('nutrition.foodSearch.notFound.nameLabel')} value={newName} onChangeText={setNewName} />
          <Input label={t('nutrition.addMeal.calc.kcalPer100')} keyboardType="numeric" value={newKcal} onChangeText={setNewKcal} />
          <View style={{ flexDirection: 'row', gap: spacing[2] }}>
            <View style={{ flex: 1 }}>
              <Input label={t('nutrition.addMeal.calc.proteinPer100')} keyboardType="numeric" value={newProtein} onChangeText={setNewProtein} />
            </View>
            <View style={{ flex: 1 }}>
              <Input label={t('nutrition.addMeal.calc.carbPer100')} keyboardType="numeric" value={newCarb} onChangeText={setNewCarb} />
            </View>
            <View style={{ flex: 1 }}>
              <Input label={t('nutrition.addMeal.calc.fatPer100')} keyboardType="numeric" value={newFat} onChangeText={setNewFat} />
            </View>
          </View>
          <Button
            label={addCustomFood.isPending ? '…' : t('nutrition.foodSearch.notFound.addButton')}
            onPress={submitNewFood}
            disabled={addCustomFood.isPending}
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
              onPress={() => onPick(food)}
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
    </View>
  );
}
