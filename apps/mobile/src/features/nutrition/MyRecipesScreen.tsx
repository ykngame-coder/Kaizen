import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Icon, Screen, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { recipeToFoodItem } from '@supotsu/engines';
import type { Recipe } from '@supotsu/core';
import { useDeleteRecipe, useRecipes } from '@/lib/data/queries';
import { FoodLogCard } from './FoodLogCard';

/** « Mes recettes » : les recettes de l'utilisateur (privées + publiques), tap → journalisation directe. */
export function MyRecipesScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { data: recipes = [] } = useRecipes();
  const deleteRecipe = useDeleteRecipe();
  const [logging, setLogging] = useState<Recipe | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remove = async (id: string): Promise<void> => {
    setError(null);
    try {
      await deleteRecipe.mutateAsync(id);
    } catch {
      setError(t('nutrition.recipes.errors.deleteFailed'));
    }
  };

  return (
    <Screen scroll>
      <Text variant="title">{t('nutrition.recipes.myRecipes.title')}</Text>

      <View style={{ flexDirection: 'row', gap: spacing[2] }}>
        <View style={{ flex: 1 }}>
          <Button label={t('nutrition.recipes.myRecipes.newButton')} onPress={() => router.push('/nutrition/recipes/new')} fullWidth />
        </View>
        <View style={{ flex: 1 }}>
          <Button label={t('nutrition.recipes.myRecipes.communityButton')} variant="secondary" onPress={() => router.push('/nutrition/recipes/community')} fullWidth />
        </View>
      </View>

      {error ? <Badge label={error} tone="warning" /> : null}

      {recipes.length === 0 ? (
        <Text variant="body" color="textMuted">{t('nutrition.recipes.myRecipes.empty')}</Text>
      ) : (
        <View style={{ gap: spacing[2] }}>
          {recipes.map((r) => {
            const food = recipeToFoodItem(r);
            return (
              <Pressable
                key={r.id}
                onPress={() => setLogging(r)}
                style={{ padding: spacing[3], borderRadius: radii.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="body">{r.name}</Text>
                    <Text variant="caption" color="textMuted">{t('nutrition.foodSearch.perServing', { kcal: Math.round(food.per100g.kcal) })}</Text>
                  </View>
                  <Pressable onPress={() => router.push(`/nutrition/recipes/${r.id}`)} accessibilityLabel={t('nutrition.recipes.myRecipes.editA11y', { name: r.name })} hitSlop={8} style={{ padding: spacing[2] }}>
                    <Icon name="pencil" size={18} color={colors.textMuted} />
                  </Pressable>
                  <Pressable onPress={() => void remove(r.id)} accessibilityLabel={t('nutrition.recipes.myRecipes.deleteA11y', { name: r.name })} hitSlop={8} style={{ padding: spacing[2] }}>
                    <Icon name="trash" size={18} color={colors.error} />
                  </Pressable>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {logging ? <FoodLogCard key={logging.id} food={recipeToFoodItem(logging)} onLogged={() => router.back()} /> : null}

      <Button label={t('common.cancel')} variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}
