import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, Icon, Input, SegmentedControl, Screen, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { recipeToFoodItem } from '@supotsu/engines';
import type { FoodItem, RecipeIngredient, Visibility } from '@supotsu/core';
import { useAddRecipe, useDeleteRecipe, useRecipe, useUpdateRecipe } from '@/lib/data/queries';
import type { RecipeIngredientInput } from '@/lib/data/repository';
import { randomId } from '@/lib/id';
import { FoodPickerSheet } from './FoodPickerSheet';

/** Crée ou édite une recette — id absent des params : création ; sinon édition (Task 6 de la spec recettes). */
export function RecipeEditScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id?: string; barcode?: string }>();
  const { data: existing } = useRecipe(params.id);
  const addRecipe = useAddRecipe();
  const updateRecipe = useUpdateRecipe();
  const deleteRecipe = useDeleteRecipe();

  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [pickerVisible, setPickerVisible] = useState(false);
  const [pendingFood, setPendingFood] = useState<FoodItem | null>(null);
  const [pendingGrams, setPendingGrams] = useState('100');

  // Préremplit depuis la recette existante une fois chargée (édition).
  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setVisibility(existing.visibility);
      setIngredients(existing.ingredients);
    }
  }, [existing]);

  // Retour du scanner avec un code-barres : rouvre le sélecteur pour le relancer.
  useEffect(() => {
    if (params.barcode) setPickerVisible(true);
  }, [params.barcode]);

  const scanReturnPath = params.id ? `/nutrition/recipes/${params.id}` : '/nutrition/recipes/new';

  const onPickFood = (food: FoodItem): void => {
    setPickerVisible(false);
    setPendingFood(food);
    setPendingGrams(food.servingSizeG ? String(food.servingSizeG) : '100');
  };

  const confirmAddIngredient = (): void => {
    const grams = Number(pendingGrams);
    if (!pendingFood || !Number.isFinite(grams) || grams <= 0) return;
    setIngredients((prev) => [
      ...prev,
      {
        id: randomId(),
        barcode: pendingFood.barcode,
        description: pendingFood.name,
        kcalPer100g: pendingFood.per100g.kcal,
        proteinGPer100g: pendingFood.per100g.proteinG,
        carbGPer100g: pendingFood.per100g.carbG,
        fatGPer100g: pendingFood.per100g.fatG,
        quantityG: grams,
        order: prev.length,
      },
    ]);
    setPendingFood(null);
  };

  const removeIngredient = (id: string): void => {
    setIngredients((prev) => prev.filter((i) => i.id !== id));
  };

  const preview = recipeToFoodItem({
    id: 'preview',
    userId: '',
    name: name || '—',
    visibility,
    createdAt: '',
    updatedAt: '',
    ingredients,
  });

  const save = async (): Promise<void> => {
    if (!name.trim()) {
      setError(t('nutrition.recipes.errors.nameRequired'));
      return;
    }
    if (ingredients.length === 0) {
      setError(t('nutrition.recipes.errors.noIngredients'));
      return;
    }
    setError(null);
    const input = {
      name: name.trim(),
      visibility,
      ingredients: ingredients.map<RecipeIngredientInput>((i) => ({
        barcode: i.barcode,
        description: i.description,
        kcalPer100g: i.kcalPer100g,
        proteinGPer100g: i.proteinGPer100g,
        carbGPer100g: i.carbGPer100g,
        fatGPer100g: i.fatGPer100g,
        quantityG: i.quantityG,
      })),
    };
    try {
      if (params.id) await updateRecipe.mutateAsync({ recipeId: params.id, input });
      else await addRecipe.mutateAsync(input);
      router.back();
    } catch {
      setError(t('nutrition.recipes.errors.saveFailed'));
    }
  };

  const remove = async (): Promise<void> => {
    if (!params.id) return;
    try {
      await deleteRecipe.mutateAsync(params.id);
      router.back();
    } catch {
      setError(t('nutrition.recipes.errors.deleteFailed'));
    }
  };

  const saving = addRecipe.isPending || updateRecipe.isPending;

  return (
    <Screen scroll>
      <Text variant="title">{params.id ? t('nutrition.recipes.editTitle') : t('nutrition.recipes.newTitle')}</Text>

      <Input label={t('nutrition.recipes.nameLabel')} value={name} onChangeText={setName} />

      <View>
        <Text variant="label" color="textMuted" style={{ marginBottom: spacing[2] }}>{t('nutrition.recipes.visibility.label')}</Text>
        <SegmentedControl
          options={[
            { value: 'private', label: t('nutrition.recipes.visibility.private') },
            { value: 'public', label: t('nutrition.recipes.visibility.public') },
          ]}
          value={visibility}
          onChange={setVisibility}
        />
        <Text variant="caption" color="textMuted" style={{ marginTop: spacing[1] }}>
          {visibility === 'public' ? t('nutrition.recipes.visibility.publicHint') : t('nutrition.recipes.visibility.privateHint')}
        </Text>
      </View>

      <Text variant="heading">{t('nutrition.recipes.ingredientsTitle')}</Text>
      {ingredients.length === 0 ? (
        <Text variant="body" color="textMuted">{t('nutrition.recipes.emptyIngredients')}</Text>
      ) : (
        <View style={{ gap: spacing[2] }}>
          {ingredients.map((i) => (
            <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], padding: spacing[3], borderRadius: radii.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
              <View style={{ flex: 1 }}>
                <Text variant="body">{i.description}</Text>
                <Text variant="caption" color="textMuted">{t('nutrition.recipes.ingredientQuantity', { grams: i.quantityG })}</Text>
              </View>
              <Pressable onPress={() => removeIngredient(i.id)} accessibilityLabel={t('nutrition.recipes.removeIngredientA11y', { name: i.description })} hitSlop={8}>
                <Icon name="trash" size={16} color={colors.error} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <Button label={t('nutrition.recipes.addIngredientButton')} variant="secondary" onPress={() => setPickerVisible(true)} fullWidth />

      {pickerVisible ? (
        <Card>
          <FoodPickerSheet visible scanReturnPath={scanReturnPath} initialBarcode={params.barcode} onPick={onPickFood} />
          <Button label={t('common.cancel')} variant="secondary" onPress={() => setPickerVisible(false)} />
        </Card>
      ) : null}

      {pendingFood ? (
        <Card>
          <Text variant="heading">{pendingFood.name}</Text>
          <Input
            label={t('nutrition.recipes.quantityUsedLabel')}
            keyboardType="numeric"
            value={pendingGrams}
            onChangeText={setPendingGrams}
          />
          <View style={{ flexDirection: 'row', gap: spacing[2] }}>
            <View style={{ flex: 1 }}>
              <Button label={t('common.cancel')} variant="secondary" onPress={() => setPendingFood(null)} fullWidth />
            </View>
            <View style={{ flex: 1 }}>
              <Button label={t('nutrition.recipes.confirmIngredientButton')} onPress={confirmAddIngredient} fullWidth />
            </View>
          </View>
        </Card>
      ) : null}

      {ingredients.length > 0 ? (
        <Card>
          <Text variant="heading">{t('nutrition.recipes.previewTitle')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            <Badge label={t('nutrition.foodSearch.badges.kcal', { kcal: Math.round(preview.per100g.kcal) })} tone="info" />
            <Badge label={t('nutrition.foodSearch.badges.protein', { value: preview.per100g.proteinG.toFixed(1) })} tone="neutral" />
            <Badge label={t('nutrition.foodSearch.badges.carb', { value: preview.per100g.carbG.toFixed(1) })} tone="neutral" />
            <Badge label={t('nutrition.foodSearch.badges.fat', { value: preview.per100g.fatG.toFixed(1) })} tone="neutral" />
          </View>
        </Card>
      ) : null}

      {error ? <Badge label={error} tone="warning" /> : null}

      <Button label={saving ? '…' : t('nutrition.recipes.saveButton')} onPress={save} disabled={saving} fullWidth />
      {params.id ? (
        <Button label={t('nutrition.recipes.deleteButton')} variant="secondary" onPress={remove} disabled={deleteRecipe.isPending} fullWidth />
      ) : null}
    </Screen>
  );
}
