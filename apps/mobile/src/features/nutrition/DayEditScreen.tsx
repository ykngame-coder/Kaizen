import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, EmptyState, Icon, Screen, Text, useTheme, type BadgeTone } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { MealType, NutritionEntry } from '@supotsu/core';
import { useCopyNutritionEntries, useDeleteNutritionEntries, useMoveNutritionEntries, useNutritionEntries } from '@/lib/data/queries';
import { dayKeyOf, selectedDayFrom, shiftDay } from '@/features/navigation/day';
import { BackButton } from '@/features/navigation/BackButton';
import {
  copyInputOf,
  mealSelectionState,
  movePatchOf,
  resolveMeal,
  toggleMealSelection,
  type MealTarget,
  type MovePatch,
} from './copyEntries';
import { mealEntriesOn } from './CopyFromSheet';
import { DayMealSheet, dayLabelOf, type SheetPreview } from './DayMealSheet';
import { sumMealMacros } from './mealMacroTotals';

const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

function Check({ state }: { state: 'none' | 'some' | 'all' }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: state === 'none' ? colors.border : colors.primary,
        backgroundColor: state === 'all' ? colors.primary : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {state === 'all' ? <Icon name="check" size={15} color={colors.onGradient} /> : null}
      {/* Le tiret : un repas coché en partie, comme la case d'un dossier sur iOS. */}
      {state === 'some' ? <View style={{ width: 10, height: 2, borderRadius: 1, backgroundColor: colors.primary }} /> : null}
    </View>
  );
}

/**
 * « Modifier la journée » : tous les repas du jour et leurs aliments, à
 * cocher, puis Copier vers / Déplacer vers / Supprimer.
 *
 * Un écran à part plutôt qu'un mode du hub : le hub ne montre qu'une ligne
 * résumée par repas (« Pâtes et 1 de plus »), il n'y a pas d'aliment à y
 * cocher. Jusqu'ici tout se faisait aliment par aliment depuis sa fiche, et la
 * copie ne sortait même pas du jour.
 */
export function DayEditScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { date } = useLocalSearchParams<{ date?: string }>();
  const dayKey = date ?? dayKeyOf(new Date());
  const { data: entries = [], isLoading } = useNutritionEntries();
  const copy = useCopyNutritionEntries();
  const move = useMoveNutritionEntries();
  const remove = useDeleteNutritionEntries();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<'copy' | 'move' | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: BadgeTone; text: string } | null>(null);

  const groups = useMemo(() => MEALS.map((meal) => ({ meal, items: mealEntriesOn(entries, dayKey, meal) })), [entries, dayKey]);
  // Dérivée des aliments du jour : un aliment déplacé ou supprimé sort de la
  // sélection de lui-même, sans état à nettoyer.
  const chosen = useMemo(() => groups.flatMap((g) => g.items).filter((e) => selected.has(e.id)), [groups, selected]);
  const chosenKcal = chosen.reduce((s, e) => s + e.kcal, 0);
  const mealName = (m: MealType): string => t(`nutrition.journal.meal.${m}`);
  const nameOf = (e: NutritionEntry): string => e.description || mealName(e.mealType);

  const toggle = (id: string): void => {
    setNotice(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const closeSheet = (): void => {
    setSheet(null);
    setSheetError(null);
  };

  const copyPreview = (targetDay: string, target: MealTarget): SheetPreview => ({
    rows: chosen.map((e) => ({ key: e.id, name: nameOf(e), detail: `→ ${mealName(resolveMeal(e, target))}`, kcal: e.kcal })),
    confirmLabel: t('nutrition.copy.copyTo', { day: dayLabelOf(targetDay, t, { inline: true }) }),
    disabled: chosen.length === 0,
  });

  const movePreview = (targetDay: string, target: MealTarget): SheetPreview => {
    const patches = chosen.map((e) => movePatchOf(e, targetDay, target));
    return {
      rows: chosen.map((e, i) => ({
        key: e.id,
        name: nameOf(e),
        detail: patches[i] ? `${mealName(e.mealType)} → ${mealName(resolveMeal(e, target))}` : t('nutrition.copy.stays'),
        kcal: e.kcal,
      })),
      confirmLabel: patches.some(Boolean) ? t('nutrition.copy.moveTo', { day: dayLabelOf(targetDay, t, { inline: true }) }) : t('nutrition.copy.alreadyThere'),
      disabled: !patches.some(Boolean),
    };
  };

  const confirm = async (targetDay: string, target: MealTarget): Promise<void> => {
    setSheetError(null);
    const day = dayLabelOf(targetDay, t, { inline: true });
    if (sheet === 'copy') {
      try {
        await copy.mutateAsync(chosen.map((e) => copyInputOf(e, targetDay, target)));
        setNotice({ tone: 'success', text: t('nutrition.copy.done.copied', { count: chosen.length, day }) });
        setSelected(new Set());
        closeSheet();
      } catch {
        setSheetError(t('nutrition.copy.failed'));
      }
      return;
    }
    const patches = chosen.map((e) => movePatchOf(e, targetDay, target)).filter((p): p is MovePatch => p !== null);
    const { moved, total } = await move.mutateAsync(patches);
    setNotice(
      moved === total
        ? { tone: 'success', text: t('nutrition.copy.done.moved', { count: moved, day }) }
        : { tone: 'warning', text: t('nutrition.copy.done.movedPartial', { moved, total }) },
    );
    setSelected(new Set());
    closeSheet();
  };

  const askDelete = (): void => {
    const ids = chosen.map((e) => e.id);
    Alert.alert(t('nutrition.copy.deleteConfirm.title', { count: ids.length }), t('nutrition.copy.deleteConfirm.message'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('nutrition.copy.deleteAction'),
        style: 'destructive',
        onPress: () => {
          remove.mutate(ids, {
            onSuccess: () => {
              setNotice({ tone: 'success', text: t('nutrition.copy.done.deleted', { count: ids.length }) });
              setSelected(new Set());
            },
            onError: () => setNotice({ tone: 'error', text: t('nutrition.copy.deleteFailed') }),
          });
        },
      },
    ]);
  };

  const hasAny = groups.some((g) => g.items.length > 0);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <BackButton />
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text variant="body" color="primary" style={{ fontWeight: '700' }}>{t('nutrition.dayEdit.done')}</Text>
        </Pressable>
      </View>
      <Text variant="title" style={{ marginTop: spacing[2] }}>{t('nutrition.dayEdit.title')}</Text>
      <Text variant="caption" color="textMuted">{dayLabelOf(dayKey, t)}</Text>

      {notice ? <View style={{ marginTop: spacing[3] }}><Badge label={notice.text} tone={notice.tone} /></View> : null}

      {isLoading ? (
        <Text variant="body" color="textMuted" style={{ marginTop: spacing[4] }}>{t('common.loading')}</Text>
      ) : !hasAny ? (
        <EmptyState
          icon={<Icon name="silverware" size={44} color={colors.textSubtle} />}
          title={t('nutrition.dayEdit.empty.title')}
          message={t('nutrition.dayEdit.empty.message')}
        />
      ) : (
        <ScrollView style={{ flex: 1, marginTop: spacing[3] }} contentContainerStyle={{ gap: spacing[3], paddingBottom: spacing[4] }}>
          {groups.map(({ meal, items }) => {
            const ids = items.map((e) => e.id);
            const state = mealSelectionState(ids, selected);
            const macros = sumMealMacros(items);
            const kcal = items.reduce((s, e) => s + e.kcal, 0);
            return (
              <View key={meal} style={{ backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing[3] }}>
                <Pressable
                  disabled={items.length === 0}
                  onPress={() => {
                    setNotice(null);
                    setSelected((prev) => toggleMealSelection(ids, prev));
                  }}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: state === 'all' ? true : state === 'some' ? 'mixed' : false, disabled: items.length === 0 }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3], borderBottomWidth: items.length > 0 ? 1 : 0, borderBottomColor: colors.border, opacity: items.length === 0 ? 0.5 : 1 }}
                >
                  <Check state={state} />
                  <View style={{ flex: 1 }}>
                    <Text variant="subtitle" style={{ fontWeight: '600' }}>{mealName(meal)}</Text>
                    {macros.hasAny ? (
                      <Text variant="caption" color="textSubtle">
                        {t('nutrition.screen.meals.macros', { protein: macros.proteinG, carb: macros.carbG, fat: macros.fatG })}
                      </Text>
                    ) : null}
                  </View>
                  <Text variant="body" color={items.length ? 'text' : 'textSubtle'} style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                    {items.length ? `${Math.round(kcal)} kcal` : t('nutrition.dayEdit.emptyMeal')}
                  </Text>
                </Pressable>
                {items.map((e) => (
                  <Pressable
                    key={e.id}
                    onPress={() => toggle(e.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected.has(e.id) }}
                    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[2], paddingLeft: spacing[5], opacity: pressed ? 0.6 : 1 })}
                  >
                    <Check state={selected.has(e.id) ? 'all' : 'none'} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="body" numberOfLines={1}>{nameOf(e)}</Text>
                      {e.quantityG != null ? <Text variant="caption" color="textSubtle">{e.quantityG} g</Text> : null}
                    </View>
                    <Text variant="body" color="textMuted" style={{ fontVariant: ['tabular-nums'] }}>{Math.round(e.kcal)}</Text>
                  </Pressable>
                ))}
              </View>
            );
          })}
        </ScrollView>
      )}

      {chosen.length > 0 ? (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing[3], gap: spacing[2] }}>
          <Text variant="caption" color="textMuted" style={{ textAlign: 'center' }}>
            {t('nutrition.dayEdit.selection', { count: chosen.length, kcal: Math.round(chosenKcal) })}
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing[2] }}>
            {([
              ['copy', t('nutrition.copy.copyAction'), colors.primary, colors.onGradient],
              ['move', t('nutrition.copy.moveAction'), colors.surfaceElevated, colors.text],
              ['delete', t('nutrition.copy.deleteAction'), colors.surfaceElevated, colors.error],
            ] as const).map(([id, label, bg, fg]) => (
              <Pressable
                key={id}
                onPress={() => (id === 'delete' ? askDelete() : setSheet(id))}
                disabled={remove.isPending}
                style={({ pressed }) => ({ flex: 1, height: 46, borderRadius: radii.lg, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
              >
                <Text variant="body" style={{ fontWeight: '700', color: fg }} numberOfLines={1}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <DayMealSheet
        visible={sheet !== null}
        onClose={closeSheet}
        title={sheet === 'move' ? t('nutrition.copy.moveTitle', { count: chosen.length }) : t('nutrition.copy.copyTitle', { count: chosen.length })}
        direction="to"
        // Copier : vers le lendemain, le cas « même chose demain ». Déplacer :
        // on part d'ici, et le bouton reste grisé tant que rien ne change.
        initialDayKey={sheet === 'copy' ? shiftDay(selectedDayFrom(dayKey), 1).key : dayKey}
        initialMeal="origin"
        allowOrigin
        preview={sheet === 'move' ? movePreview : copyPreview}
        onConfirm={(d, m) => void confirm(d, m)}
        busy={copy.isPending || move.isPending}
        error={sheetError}
      />
    </Screen>
  );
}
