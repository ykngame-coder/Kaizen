import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MealType, NutritionEntry } from '@supotsu/core';
import { entriesForDay, isHydrationOnlyEntry } from '@supotsu/engines';
import { useCopyNutritionEntries } from '@/lib/data/queries';
import { selectedDayFrom, shiftDay } from '@/features/navigation/day';
import { copyInputOf, type MealTarget } from './copyEntries';
import { DayMealSheet, type SheetPreview } from './DayMealSheet';

/** Les aliments d'un repas un jour donné, dans l'ordre où ils ont été mangés. */
export function mealEntriesOn(entries: NutritionEntry[], dayKey: string, meal: MealType): NutritionEntry[] {
  return entriesForDay(entries, selectedDayFrom(dayKey).noon)
    .filter((e) => e.mealType === meal && !isHydrationOnlyEntry(e))
    .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
}

export interface CopyFromSheetProps {
  /** Le repas dans lequel on copie — celui dont on a touché l'icône. */
  targetMeal: MealType | null;
  targetDayKey: string;
  entries: NutritionEntry[];
  onClose: () => void;
}

/**
 * « Copier depuis » : ramène un repas d'un autre jour dans le repas touché.
 *
 * Préréglée sur le même repas la veille — « je remange la même chose
 * qu'hier » est le cas courant. Mais le repas source reste libre : les restes
 * du dîner d'hier atterrissent au déjeuner d'aujourd'hui.
 */
export function CopyFromSheet({ targetMeal, targetDayKey, entries, onClose }: CopyFromSheetProps): React.JSX.Element {
  const { t } = useTranslation();
  const copy = useCopyNutritionEntries();
  const [error, setError] = useState<string | null>(null);
  const meal = targetMeal ?? 'lunch';

  const close = (): void => {
    setError(null);
    onClose();
  };

  const preview = (dayKey: string, source: MealTarget): SheetPreview => {
    const items = source === 'origin' ? [] : mealEntriesOn(entries, dayKey, source);
    return {
      rows: items.map((e) => ({
        key: e.id,
        name: e.description || t(`nutrition.journal.meal.${e.mealType}`),
        detail: e.quantityG != null ? `${e.quantityG} g` : undefined,
        kcal: e.kcal,
      })),
      emptyMessage: t('nutrition.copy.emptySource'),
      confirmLabel: items.length > 0 ? t('nutrition.copy.copyCount', { count: items.length }) : t('nutrition.copy.nothing'),
      disabled: items.length === 0,
    };
  };

  const confirm = async (dayKey: string, source: MealTarget): Promise<void> => {
    if (source === 'origin') return;
    setError(null);
    const items = mealEntriesOn(entries, dayKey, source);
    try {
      await copy.mutateAsync(items.map((e) => copyInputOf(e, targetDayKey, meal)));
      close();
    } catch {
      setError(t('nutrition.copy.failed'));
    }
  };

  return (
    <DayMealSheet
      visible={targetMeal != null}
      onClose={close}
      title={t(`nutrition.copy.intoMeal.${meal}`)}
      direction="from"
      initialDayKey={shiftDay(selectedDayFrom(targetDayKey), -1).key}
      initialMeal={meal}
      preview={preview}
      onConfirm={(d, m) => void confirm(d, m)}
      busy={copy.isPending}
      error={error}
    />
  );
}
