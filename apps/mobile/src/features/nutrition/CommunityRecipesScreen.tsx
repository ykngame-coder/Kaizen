import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, Input, Screen, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { recipeToFoodItem } from '@supotsu/engines';
import type { Recipe } from '@supotsu/core';
import { useCommunityRecipes, useCopyRecipe } from '@/lib/data/queries';
import { FoodLogCard } from './FoodLogCard';

/** Recettes publiques des autres utilisateurs — lecture, journalisation directe, ou copie dans ses propres recettes. */
export function CommunityRecipesScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { data: recipes = [] } = useCommunityRecipes();
  const copyRecipe = useCopyRecipe();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(
    () => (query.trim() ? recipes.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase())) : recipes),
    [recipes, query],
  );

  const copy = async (): Promise<void> => {
    if (!selected) return;
    setError(null);
    try {
      await copyRecipe.mutateAsync(selected.id);
      setSelected(null);
      router.back();
    } catch {
      setError(t('nutrition.recipes.community.copyFailed'));
    }
  };

  return (
    <Screen scroll>
      <Text variant="title">{t('nutrition.recipes.community.title')}</Text>
      <Input label={t('nutrition.recipes.community.searchLabel')} value={query} onChangeText={setQuery} />

      {error ? <Badge label={error} tone="warning" /> : null}

      {filtered.length === 0 ? (
        <Text variant="body" color="textMuted">{t('nutrition.recipes.community.empty')}</Text>
      ) : (
        <View style={{ gap: spacing[2] }}>
          {filtered.map((r) => {
            const food = recipeToFoodItem(r);
            return (
              <Pressable
                key={r.id}
                onPress={() => {
                  setSelected(r);
                  setError(null);
                }}
                style={{ padding: spacing[3], borderRadius: radii.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: selected?.id === r.id ? colors.primary : colors.border }}
              >
                <Text variant="body">{r.name}</Text>
                <Text variant="caption" color="textMuted">{t('nutrition.foodSearch.perServing', { kcal: Math.round(food.per100g.kcal) })}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {selected ? (
        <Card>
          <Text variant="heading">{selected.name}</Text>
          <View style={{ gap: spacing[1] }}>
            {selected.ingredients.map((i) => (
              <Text key={i.id} variant="caption" color="textMuted">
                {i.description} · {t('nutrition.recipes.ingredientQuantity', { grams: i.quantityG })}
              </Text>
            ))}
          </View>
          <Button
            label={copyRecipe.isPending ? '…' : t('nutrition.recipes.community.copyButton')}
            variant="secondary"
            onPress={copy}
            disabled={copyRecipe.isPending}
            fullWidth
          />
        </Card>
      ) : null}

      {selected ? <FoodLogCard key={selected.id} food={recipeToFoodItem(selected)} onLogged={() => router.back()} /> : null}

      <Button label={t('common.cancel')} variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}
