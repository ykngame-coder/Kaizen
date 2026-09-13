import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, EmptyState, Icon, Input, Screen, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { useCopyNutritionEntries, useDeleteNutritionEntry, useNutritionEntries, useUpdateNutritionEntry } from '@/lib/data/queries';
import { formatDate } from '@/lib/format';
import { formatClockFromIso, usePreferences } from '@/lib/preferences';
import { BackButton } from '@/features/navigation/BackButton';
import { dayKeyOf, selectedDayFrom, shiftDay } from '@/features/navigation/day';
import { copyInputOf, movePatchOf, resolveMeal, type MealTarget } from './copyEntries';
import { DayMealSheet, dayLabelOf } from './DayMealSheet';

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
  const updateEntry = useUpdateNutritionEntry();
  const copyEntries = useCopyNutritionEntries();
  const [sheet, setSheet] = useState<'copy' | 'move' | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  // La copie part vers un autre jour : rien ne change à l'écran, il faut le dire.
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [kcalInput, setKcalInput] = useState('');
  const [proteinInput, setProteinInput] = useState('');
  const [carbInput, setCarbInput] = useState('');
  const [fatInput, setFatInput] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  const entry = useMemo(() => entries.find((e) => e.id === id), [entries, id]);

  const startEditing = (): void => {
    if (!entry) return;
    setKcalInput(String(entry.kcal));
    setProteinInput(entry.proteinG != null ? String(entry.proteinG) : '');
    setCarbInput(entry.carbG != null ? String(entry.carbG) : '');
    setFatInput(entry.fatG != null ? String(entry.fatG) : '');
    setEditError(null);
    setEditing(true);
  };

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

  const closeSheet = (): void => {
    setSheet(null);
    setSheetError(null);
  };

  const confirmSheet = async (dayKey: string, meal: MealTarget): Promise<void> => {
    setSheetError(null);
    try {
      if (sheet === 'copy') {
        await copyEntries.mutateAsync([copyInputOf(entry, dayKey, meal)]);
        setCopied(t('nutrition.copy.done.copied', { count: 1, day: dayLabelOf(dayKey, t, { inline: true }) }));
      } else {
        const patch = movePatchOf(entry, dayKey, meal);
        if (patch) await updateEntry.mutateAsync(patch);
      }
      closeSheet();
    } catch {
      setSheetError(t(sheet === 'copy' ? 'nutrition.copy.failed' : 'nutrition.copy.moveFailed'));
    }
  };

  const onDelete = async (): Promise<void> => {
    await deleteEntry.mutateAsync(entry.id);
    router.back();
  };

  const saveEdits = async (): Promise<void> => {
    setEditError(null);
    const kcal = Number(kcalInput.trim().replace(',', '.'));
    if (!Number.isFinite(kcal) || kcal < 0) {
      setEditError(t('nutrition.mealDetail.editErrorInvalid'));
      return;
    }
    const toNum = (s: string): number | undefined => (s.trim() ? Number(s.trim().replace(',', '.')) : undefined);
    try {
      await updateEntry.mutateAsync({ entryId: entry.id, kcal, proteinG: toNum(proteinInput), carbG: toNum(carbInput), fatG: toNum(fatInput) });
      setEditing(false);
    } catch {
      setEditError(t('nutrition.mealDetail.editErrorSaveFailed'));
    }
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

      {editing ? (
        <Card>
          <Input label={t('nutrition.mealDetail.kcal')} keyboardType="decimal-pad" value={kcalInput} onChangeText={setKcalInput} />
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <View style={{ flex: 1 }}>
              <Input label={t('nutrition.mealDetail.protein')} keyboardType="decimal-pad" value={proteinInput} onChangeText={setProteinInput} />
            </View>
            <View style={{ flex: 1 }}>
              <Input label={t('nutrition.mealDetail.carbs')} keyboardType="decimal-pad" value={carbInput} onChangeText={setCarbInput} />
            </View>
            <View style={{ flex: 1 }}>
              <Input label={t('nutrition.mealDetail.fat')} keyboardType="decimal-pad" value={fatInput} onChangeText={setFatInput} />
            </View>
          </View>
          {editError ? <Badge label={editError} tone="error" /> : null}
          <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[3] }}>
            <Button label={t('common.cancel')} variant="secondary" onPress={() => setEditing(false)} />
            <Button
              label={updateEntry.isPending ? '…' : t('common.save')}
              onPress={saveEdits}
              disabled={updateEntry.isPending}
            />
          </View>
        </Card>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] }}>
          <Stat label={t('nutrition.mealDetail.kcal')} value={`${Math.round(entry.kcal)} kcal`} />
          <Stat label={t('nutrition.mealDetail.protein')} value={entry.proteinG != null ? `${Math.round(entry.proteinG)} g` : null} />
          <Stat label={t('nutrition.mealDetail.carbs')} value={entry.carbG != null ? `${Math.round(entry.carbG)} g` : null} />
          <Stat label={t('nutrition.mealDetail.fat')} value={entry.fatG != null ? `${Math.round(entry.fatG)} g` : null} />
          <Stat label={t('nutrition.mealDetail.hydration')} value={entry.hydrationMl ? `${entry.hydrationMl} ml` : null} />
          <Stat label={t('nutrition.mealDetail.source')} value={entry.source} />
        </View>
      )}

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
      ) : !editing ? (
        <>
        {/* Copier et déplacer passent par la même feuille repas × jour que
            la sélection de la journée. Remplace les pastilles de repas, les
            boutons ±1 jour et la copie qui ne sortait pas du jour. */}
        {copied ? <Badge label={copied} tone="success" /> : null}
        <View style={{ flexDirection: 'row', gap: spacing[2] }}>
          <View style={{ flex: 1 }}>
            <Button label={t('nutrition.copy.copyAction')} variant="secondary" onPress={() => { setCopied(null); setSheet('copy'); }} fullWidth />
          </View>
          <View style={{ flex: 1 }}>
            <Button label={t('nutrition.copy.moveAction')} variant="secondary" onPress={() => setSheet('move')} fullWidth />
          </View>
        </View>
        <DayMealSheet
          visible={sheet !== null}
          onClose={closeSheet}
          title={sheet === 'move' ? t('nutrition.copy.moveTitle', { count: 1 }) : t('nutrition.copy.copyTitle', { count: 1 })}
          direction="to"
          initialDayKey={sheet === 'copy' ? shiftDay(selectedDayFrom(dayKeyOf(entry.loggedAt)), 1).key : dayKeyOf(entry.loggedAt)}
          initialMeal={entry.mealType}
          preview={(dayKey, meal) => {
            const patch = movePatchOf(entry, dayKey, meal);
            const name = entry.description || t(`nutrition.journal.meal.${entry.mealType}`);
            const to = t(`nutrition.journal.meal.${resolveMeal(entry, meal)}`);
            if (sheet === 'move') {
              return {
                rows: [{ key: entry.id, name, detail: patch ? `${t(`nutrition.journal.meal.${entry.mealType}`)} → ${to}` : t('nutrition.copy.stays'), kcal: entry.kcal }],
                confirmLabel: patch ? t('nutrition.copy.moveTo', { day: dayLabelOf(dayKey, t, { inline: true }) }) : t('nutrition.copy.alreadyThere'),
                disabled: !patch,
              };
            }
            return {
              rows: [{ key: entry.id, name, detail: `→ ${to}`, kcal: entry.kcal }],
              confirmLabel: t('nutrition.copy.copyTo', { day: dayLabelOf(dayKey, t, { inline: true }) }),
              disabled: false,
            };
          }}
          onConfirm={(dayKey, meal) => void confirmSheet(dayKey, meal)}
          busy={copyEntries.isPending || updateEntry.isPending}
          error={sheetError}
        />

        <View style={{ flexDirection: 'row', gap: spacing[3] }}>
          <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
          <Button label={t('nutrition.mealDetail.edit')} variant="secondary" onPress={startEditing} />
          <Button label={t('nutrition.mealDetail.delete')} variant="secondary" onPress={() => setConfirmingDelete(true)} />
        </View>
        </>
      ) : null}
    </Screen>
  );
}
