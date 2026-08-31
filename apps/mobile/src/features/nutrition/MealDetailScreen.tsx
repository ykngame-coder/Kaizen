import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Card, EmptyState, Icon, Screen, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { useDeleteNutritionEntry, useNutritionEntries } from '@/lib/data/queries';
import { formatDate } from '@/lib/format';
import { formatClockFromIso, usePreferences } from '@/lib/preferences';
import { BackButton } from '@/features/navigation/BackButton';

const MEAL_ICON: Record<string, string> = { breakfast: '🥣', lunch: '🍗', dinner: '🍝', snack: '🍎' };

/** Small stat block — omits itself when there's no value to show. */
function Stat({ label, value }: { label: string; value: string | null | undefined }): React.JSX.Element | null {
  const { colors } = useTheme();
  if (value == null) return null;
  return (
    <View style={{ flex: 1, minWidth: 100, backgroundColor: colors.surfaceElevated, borderRadius: radii.lg, padding: spacing[4] }}>
      <Text variant="caption" color="textSubtle">{label}</Text>
      <Text variant="subtitle" style={{ marginTop: spacing[1] }}>{value}</Text>
    </View>
  );
}

/** Detail for a single logged (or planned) meal — reached by tapping a meal on the Calendar's day timeline or Journal's meal list. */
export function MealDetailScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { preferences } = usePreferences();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: entries = [], isLoading } = useNutritionEntries();
  const deleteEntry = useDeleteNutritionEntry();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const entry = useMemo(() => entries.find((e) => e.id === id), [entries, id]);

  if (isLoading) {
    return (
      <Screen scroll>
        <Text variant="body" color="textMuted">{t('common.loading')}</Text>
      </Screen>
    );
  }

  if (!entry) {
    return (
      <Screen scroll>
        <EmptyState icon={<Icon name="silverware" size={44} color={colors.textSubtle} />} title={t('nutrition.mealDetail.notFound.title')} message={t('nutrition.mealDetail.notFound.message')} actionLabel={t('common.back')} onAction={() => router.back()} />
      </Screen>
    );
  }

  const onDelete = async (): Promise<void> => {
    await deleteEntry.mutateAsync(entry.id);
    router.back();
  };

  return (
    <Screen scroll>
      <BackButton />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 22 }}>{MEAL_ICON[entry.mealType] ?? '🍽'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="title">{entry.description || t(`nutrition.journal.meal.${entry.mealType}`)}</Text>
          <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
            {t(`nutrition.journal.meal.${entry.mealType}`)} · {formatDate(entry.loggedAt)} · {formatClockFromIso(entry.loggedAt, preferences.timeFormat)}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] }}>
        <Stat label={t('nutrition.mealDetail.kcal')} value={`${Math.round(entry.kcal)} kcal`} />
        <Stat label={t('nutrition.mealDetail.protein')} value={entry.proteinG != null ? `${Math.round(entry.proteinG)} g` : null} />
        <Stat label={t('nutrition.mealDetail.carbs')} value={entry.carbG != null ? `${Math.round(entry.carbG)} g` : null} />
        <Stat label={t('nutrition.mealDetail.fat')} value={entry.fatG != null ? `${Math.round(entry.fatG)} g` : null} />
        <Stat label={t('nutrition.mealDetail.hydration')} value={entry.hydrationMl ? `${entry.hydrationMl} ml` : null} />
        <Stat label={t('nutrition.mealDetail.source')} value={entry.source} />
      </View>

      {confirmingDelete ? (
        <Card>
          <Text variant="body">{t('nutrition.mealDetail.confirmDelete')}</Text>
          <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[3] }}>
            <Button label={t('common.cancel')} variant="secondary" onPress={() => setConfirmingDelete(false)} />
            <Button
              label={deleteEntry.isPending ? '…' : t('nutrition.mealDetail.delete')}
              variant="danger"
              onPress={onDelete}
              disabled={deleteEntry.isPending}
            />
          </View>
        </Card>
      ) : (
        <View style={{ flexDirection: 'row', gap: spacing[3] }}>
          <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
          <Button label={t('nutrition.mealDetail.delete')} variant="secondary" onPress={() => setConfirmingDelete(true)} />
        </View>
      )}
    </Screen>
  );
}
