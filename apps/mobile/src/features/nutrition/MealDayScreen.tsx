import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Card, EmptyState, Icon, Screen, Text, useTheme, type IconName } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { MealType } from '@supotsu/core';
import { isHydrationOnlyEntry } from '@supotsu/engines';
import { useDeleteNutritionEntry, useNutritionEntries } from '@/lib/data/queries';
import { formatDate } from '@/lib/format';
import { BackButton } from '@/features/navigation/BackButton';

const MEAL_ICON: Record<string, IconName> = { breakfast: 'bowl', lunch: 'drumstick', dinner: 'noodles', snack: 'apple' };

/**
 * Every item logged under one meal type on one day — reached by tapping a
 * meal-type summary row on the Nutrition hub (which only shows a condensed
 * "first item et N de plus" line, not the full list).
 */
export function MealDayScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { type, date } = useLocalSearchParams<{ type: MealType; date: string }>();
  const { data: entries = [], isLoading } = useNutritionEntries();
  const deleteEntry = useDeleteNutritionEntry();

  const dayEntries = useMemo(
    () =>
      entries
        .filter((e) => e.mealType === type && e.loggedAt.slice(0, 10) === date && !isHydrationOnlyEntry(e))
        .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt)),
    [entries, type, date],
  );
  const totalKcal = dayEntries.reduce((s, e) => s + e.kcal, 0);

  const addMore = (): void => {
    router.push({ pathname: '/nutrition/meal/new', params: { date, mealType: type } });
  };

  return (
    <Screen scroll>
      <BackButton />
      <Text variant="title" style={{ marginTop: spacing[2] }}>{t(`nutrition.screen.meal.${type}`)}</Text>
      <Text variant="caption" color="textMuted">
        {formatDate(`${date}T12:00:00`)}{dayEntries.length > 0 ? ` · ${Math.round(totalKcal)} kcal` : ''}
      </Text>

      {isLoading ? (
        <Text variant="body" color="textMuted">{t('common.loading')}</Text>
      ) : dayEntries.length === 0 ? (
        <EmptyState
          icon={<Icon name={MEAL_ICON[type as string] ?? 'bowl'} size={44} color={colors.textSubtle} />}
          title={t('nutrition.mealDay.empty.title')}
          message={t('nutrition.mealDay.empty.message')}
          actionLabel={t('nutrition.mealDay.addButton')}
          onAction={addMore}
        />
      ) : (
        <>
          <Card>
            <View style={{ gap: spacing[2] }}>
              {dayEntries.map((e) => (
                <Pressable
                  key={e.id}
                  onPress={() => router.push({ pathname: '/nutrition/meal/[id]', params: { id: e.id } })}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], borderRadius: radii.md, backgroundColor: colors.surfaceElevated, opacity: pressed ? 0.6 : 1 })}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}><Icon name={MEAL_ICON[type as string] ?? 'bowl'} size={19} color={colors.text} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="body" style={{ fontWeight: '600' }} numberOfLines={1}>{e.description || t(`nutrition.screen.meal.${type}`)}</Text>
                    <Text variant="caption" color="textSubtle" style={{ marginTop: 2 }} numberOfLines={1}>P {Math.round(e.proteinG ?? 0)} · G {Math.round(e.carbG ?? 0)} · L {Math.round(e.fatG ?? 0)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text variant="body" style={{ fontWeight: '700' }}>{Math.round(e.kcal)}</Text>
                    <Text variant="caption" color="textSubtle">kcal</Text>
                  </View>
                  <Pressable
                    onPress={() => deleteEntry.mutate(e.id)}
                    disabled={deleteEntry.isPending && deleteEntry.variables === e.id}
                    hitSlop={8}
                    style={{ opacity: deleteEntry.isPending && deleteEntry.variables === e.id ? 0.4 : 1 }}
                  >
                    <Icon name="trash" size={18} color={colors.textSubtle} />
                  </Pressable>
                </Pressable>
              ))}
            </View>
          </Card>
          <View style={{ alignItems: 'flex-start' }}>
            <Button label={t('nutrition.mealDay.addButton')} onPress={addMore} />
          </View>
        </>
      )}
    </Screen>
  );
}
