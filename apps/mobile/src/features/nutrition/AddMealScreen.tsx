import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, Input, Screen, SegmentedControl, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { NutritionEntry } from '@supotsu/core';
import { nutritionEntryInputSchema, type NutritionEntryInput } from '@supotsu/shared';
import { useAddNutritionEntry, useNutritionEntries } from '@/lib/data/queries';

const numOrUndef = (s: string): number | undefined => (s ? Number(s) : undefined);

/** Manual meal logging form (Master Prompt P11 nutrition). */
export function AddMealScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const addMeal = useAddNutritionEntry();
  const { data: entries = [] } = useNutritionEntries();

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
  const [carbG, setCarbG] = useState('');
  const [fatG, setFatG] = useState('');
  const [hydrationMl, setHydrationMl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showRecent, setShowRecent] = useState(false);

  // Distinct recent meals (most recent occurrence of each description), so
  // "copier un repas" doesn't just repeat the same entry N times.
  const recentMeals = useMemo(() => {
    const sorted = [...entries].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
    const seen = new Set<string>();
    const out: NutritionEntry[] = [];
    for (const e of sorted) {
      const key = e.description.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(e);
      if (out.length >= 8) break;
    }
    return out;
  }, [entries]);

  const copyMeal = (entry: NutritionEntry): void => {
    setDescription(entry.description);
    setKcal(String(entry.kcal));
    setProteinG(entry.proteinG != null ? String(entry.proteinG) : '');
    setCarbG(entry.carbG != null ? String(entry.carbG) : '');
    setFatG(entry.fatG != null ? String(entry.fatG) : '');
    setHydrationMl(entry.hydrationMl != null ? String(entry.hydrationMl) : '');
    setShowRecent(false);
  };

  const submit = async (): Promise<void> => {
    setError(null);
    const candidate = {
      mealType,
      description,
      kcal: Number(kcal),
      proteinG: numOrUndef(proteinG),
      carbG: numOrUndef(carbG),
      fatG: numOrUndef(fatG),
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

      {recentMeals.length > 0 && (
        <Card>
          <Pressable onPress={() => setShowRecent((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text variant="heading">{t('nutrition.addMeal.recent.heading')}</Text>
            <Text variant="heading" style={{ color: colors.textSubtle, transform: [{ rotate: showRecent ? '180deg' : '0deg' }] }}>⌄</Text>
          </Pressable>
          {showRecent && (
            <View style={{ gap: spacing[2], marginTop: spacing[3] }}>
              {recentMeals.map((entry) => (
                <Pressable
                  key={entry.id}
                  onPress={() => copyMeal(entry)}
                  style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing[2], paddingHorizontal: spacing[3], borderRadius: radii.md, backgroundColor: colors.surfaceElevated }}
                >
                  <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>{entry.description}</Text>
                  <Text variant="caption" color="textMuted">{t('nutrition.addMeal.recent.kcal', { kcal: Math.round(entry.kcal) })}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </Card>
      )}

      <View style={{ gap: spacing[2] }}>
        <Text variant="label" color="textMuted">
          {t('nutrition.addMeal.momentLabel')}
        </Text>
        <SegmentedControl options={MEALS} value={mealType} onChange={setMealType} />
      </View>

      <Input label={t('nutrition.addMeal.descriptionLabel')} value={description} onChangeText={setDescription} />

      <Input label={t('nutrition.addMeal.kcalLabel')} keyboardType="numeric" value={kcal} onChangeText={setKcal} />

      <View style={{ flexDirection: 'row', gap: spacing[3] }}>
        <View style={{ flex: 1 }}>
          <Input
            label={t('nutrition.addMeal.proteinLabel')}
            keyboardType="numeric"
            value={proteinG}
            onChangeText={setProteinG}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Input
            label={t('nutrition.addMeal.carbLabel')}
            keyboardType="numeric"
            value={carbG}
            onChangeText={setCarbG}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Input
            label={t('nutrition.addMeal.fatLabel')}
            keyboardType="numeric"
            value={fatG}
            onChangeText={setFatG}
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
