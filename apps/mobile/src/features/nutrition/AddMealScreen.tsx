import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, Input, Screen, SegmentedControl, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { NutritionEntry } from '@supotsu/core';
import { isHydrationOnlyEntry } from '@supotsu/engines';
import { nutritionEntryInputSchema, type NutritionEntryInput } from '@supotsu/shared';
import { useAddNutritionEntry, useNutritionEntries } from '@/lib/data/queries';
import { formatDate } from '@/lib/format';
import { DatePickerModal } from '@/features/navigation/DatePickerModal';
import { numOrUndef, parseDecimal, scalePer100 } from './mealMacros';

const dayKey = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayKey = (): string => dayKey(new Date());

/** Manual meal logging form (Master Prompt P11 nutrition). */
export function AddMealScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string; mealType?: string }>();
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
  const [dateKey, setDateKey] = useState(todayKey());
  const [showDatePicker, setShowDatePicker] = useState(false);
  // Deux modes de saisie exclusifs, jamais les deux à l'écran : un testeur
  // s'est plaint de « deux options » là où le calculateur ne faisait que
  // remplir les champs du dessous. Par 100 g par défaut, comme sur une
  // étiquette ; Total pour un plat dont on ne connaît que le total.
  const [entryMode, setEntryMode] = useState<'per100' | 'total'>('per100');
  const [calcKcal, setCalcKcal] = useState('');
  const [calcProtein, setCalcProtein] = useState('');
  const [calcCarb, setCalcCarb] = useState('');
  const [calcFat, setCalcFat] = useState('');
  const [calcQty, setCalcQty] = useState('');

  // Arriving from the Calendar's "Planifier un repas" button — pre-fill the picked day.
  useEffect(() => {
    const d = params.date;
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) setDateKey(d);
  }, [params.date]);

  // Arriving from a meal-type's own "+" on the Nutrition hub — pre-select that meal type.
  useEffect(() => {
    const mt = params.mealType;
    if (typeof mt === 'string' && MEALS.some((m) => m.value === mt)) setMealType(mt as (typeof MEALS)[number]['value']);
  }, [params.mealType]);

  // Distinct recent meals (most recent occurrence of each description), so
  // "copier un repas" doesn't just repeat the same entry N times.
  const recentMeals = useMemo(() => {
    const sorted = [...entries].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
    const seen = new Set<string>();
    const out: NutritionEntry[] = [];
    for (const e of sorted) {
      if (isHydrationOnlyEntry(e)) continue;
      const key = e.description.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(e);
      if (out.length >= 30) break;
    }
    return out;
  }, [entries]);

  // Un repas recopié n'apporte que des totaux — on bascule donc sur ce mode,
  // sinon les valeurs remplies seraient invisibles derrière la saisie /100 g.
  const copyMeal = (entry: NutritionEntry): void => {
    setDescription(entry.description);
    setKcal(String(entry.kcal));
    setProteinG(entry.proteinG != null ? String(entry.proteinG) : '');
    setCarbG(entry.carbG != null ? String(entry.carbG) : '');
    setFatG(entry.fatG != null ? String(entry.fatG) : '');
    setHydrationMl(entry.hydrationMl != null ? String(entry.hydrationMl) : '');
    setEntryMode('total');
    setShowRecent(false);
  };

  // Recalculé à chaque frappe : le total s'affiche en direct sous les champs,
  // ce qui remplace l'ancien bouton « Appliquer » et son étape manuelle.
  const per100Totals = useMemo(
    () => scalePer100({ kcal: calcKcal, proteinG: calcProtein, carbG: calcCarb, fatG: calcFat, quantityG: calcQty }),
    [calcKcal, calcProtein, calcCarb, calcFat, calcQty],
  );

  const isToday = dateKey === todayKey();

  const submit = async (): Promise<void> => {
    setError(null);
    // En mode /100 g, les valeurs enregistrées sont les totaux calculés ;
    // `scalePer100` rend null tant que quantité et calories ne tiennent pas
    // debout, ce qui déclenche le message d'erreur existant.
    const macros =
      entryMode === 'per100'
        ? per100Totals
        : {
            kcal: parseDecimal(kcal),
            proteinG: numOrUndef(proteinG),
            carbG: numOrUndef(carbG),
            fatG: numOrUndef(fatG),
          };
    if (!macros) {
      setError(t('nutrition.addMeal.errors.invalid'));
      return;
    }
    const candidate = {
      mealType,
      description,
      kcal: macros.kcal,
      proteinG: macros.proteinG,
      carbG: macros.carbG,
      fatG: macros.fatG,
      hydrationMl: numOrUndef(hydrationMl),
      source: 'manual' as const,
      // A same-day log keeps the real time of day; a meal planned ahead has
      // no meaningful time yet, so it's parked at noon on the chosen day.
      loggedAt: isToday ? new Date().toISOString() : new Date(`${dateKey}T12:00:00`).toISOString(),
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

      <Pressable
        onPress={() => setShowDatePicker(true)}
        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing[2] }}
      >
        <Text variant="label" color="textMuted">{t('nutrition.addMeal.dateLabel')}</Text>
        <Badge label={isToday ? t('nutrition.addMeal.dateToday') : formatDate(`${dateKey}T12:00:00`)} tone={isToday ? 'neutral' : 'info'} />
      </Pressable>

      {recentMeals.length > 0 && (
        <Card>
          <Pressable onPress={() => setShowRecent((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text variant="heading">{t('nutrition.addMeal.recent.heading')}</Text>
            <Text variant="heading" style={{ color: colors.textSubtle, transform: [{ rotate: showRecent ? '180deg' : '0deg' }] }}>⌄</Text>
          </Pressable>
          {showRecent && (
            <ScrollView style={{ maxHeight: 320, marginTop: spacing[3] }} nestedScrollEnabled>
              <View style={{ gap: spacing[2] }}>
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
            </ScrollView>
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

      <View style={{ gap: spacing[2] }}>
        <Text variant="label" color="textMuted">{t('nutrition.addMeal.modeLabel')}</Text>
        <SegmentedControl
          options={[
            { value: 'per100', label: t('nutrition.addMeal.mode.per100') },
            { value: 'total', label: t('nutrition.addMeal.mode.total') },
          ]}
          value={entryMode}
          onChange={setEntryMode}
        />
      </View>

      {entryMode === 'per100' ? (
        <>
          <Text variant="caption" color="textSubtle">{t('nutrition.addMeal.calc.hint')}</Text>
          <Input label={t('nutrition.addMeal.calc.kcalPer100')} keyboardType="decimal-pad" value={calcKcal} onChangeText={setCalcKcal} />
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <View style={{ flex: 1 }}>
              <Input label={t('nutrition.addMeal.calc.proteinPer100')} keyboardType="decimal-pad" value={calcProtein} onChangeText={setCalcProtein} />
            </View>
            <View style={{ flex: 1 }}>
              <Input label={t('nutrition.addMeal.calc.carbPer100')} keyboardType="decimal-pad" value={calcCarb} onChangeText={setCalcCarb} />
            </View>
            <View style={{ flex: 1 }}>
              <Input label={t('nutrition.addMeal.calc.fatPer100')} keyboardType="decimal-pad" value={calcFat} onChangeText={setCalcFat} />
            </View>
          </View>
          <Input label={t('nutrition.addMeal.calc.quantityLabel')} keyboardType="decimal-pad" value={calcQty} onChangeText={setCalcQty} />
          {per100Totals ? (
            <View style={{ padding: spacing[3], borderRadius: radii.md, backgroundColor: colors.surfaceElevated }}>
              <Text variant="caption" color="textSubtle">{t('nutrition.addMeal.calc.totalLabel')}</Text>
              <Text variant="body" style={{ marginTop: 2 }}>
                {t('nutrition.addMeal.calc.totalValue', {
                  kcal: per100Totals.kcal,
                  protein: per100Totals.proteinG ?? 0,
                  carb: per100Totals.carbG ?? 0,
                  fat: per100Totals.fatG ?? 0,
                })}
              </Text>
            </View>
          ) : null}
        </>
      ) : (
        <>
          <Input label={t('nutrition.addMeal.kcalLabel')} keyboardType="decimal-pad" value={kcal} onChangeText={setKcal} />
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <View style={{ flex: 1 }}>
              <Input
                label={t('nutrition.addMeal.proteinLabel')}
                keyboardType="decimal-pad"
                value={proteinG}
                onChangeText={setProteinG}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                label={t('nutrition.addMeal.carbLabel')}
                keyboardType="decimal-pad"
                value={carbG}
                onChangeText={setCarbG}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                label={t('nutrition.addMeal.fatLabel')}
                keyboardType="decimal-pad"
                value={fatG}
                onChangeText={setFatG}
              />
            </View>
          </View>
        </>
      )}

      <Input
        label={t('nutrition.addMeal.hydrationLabel')}
        keyboardType="decimal-pad"
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

      <DatePickerModal
        visible={showDatePicker}
        value={`${dateKey}T12:00:00`}
        onSelect={(iso) => setDateKey(dayKey(new Date(iso)))}
        onClose={() => setShowDatePicker(false)}
        maxDaysFuture={90}
      />
    </Screen>
  );
}
