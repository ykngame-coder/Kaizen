import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { MealType } from '@supotsu/core';
import { dayKeyOf } from '@/features/navigation/day';
import { dayOffset, wheelDayKeys, type MealTarget } from './copyEntries';

const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/**
 * « Hier », « Aujourd'hui », « Demain » en toutes lettres — relatifs au vrai
 * jour, pas au jour consulté — sinon la date courte (« dim. 28 juin »).
 *
 * `inline` : la forme à glisser dans une phrase (« Copier vers demain »). Une
 * clé à part plutôt qu'un simple passage en minuscule, qui casserait les
 * abréviations allemandes (« So., 28. Juni »).
 */
export function dayLabelOf(key: string, t: TFunction, opts: { inline?: boolean; todayKey?: string } = {}): string {
  const off = dayOffset(opts.todayKey ?? dayKeyOf(new Date()), key);
  const form = opts.inline ? 'nutrition.copy.inline' : 'nutrition.copy';
  if (off === -1) return t(`${form}.yesterday`);
  if (off === 0) return t(`${form}.today`);
  if (off === 1) return t(`${form}.tomorrow`);
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, 12).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export interface SheetPreviewRow {
  key: string;
  name: string;
  detail?: string;
  kcal: number;
}

export interface SheetPreview {
  rows: SheetPreviewRow[];
  /** Affiché à la place des lignes quand il n'y en a aucune. */
  emptyMessage?: string;
  confirmLabel: string;
  disabled: boolean;
}

export interface DayMealSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** « Depuis » ou « Vers » : le sens se lit au-dessus des roues. */
  direction: 'from' | 'to';
  initialDayKey: string;
  initialMeal: MealTarget;
  /** Ajoute « Repas d'origine » en tête de la roue des repas. */
  allowOrigin?: boolean;
  /** Ce que produirait la position courante des roues. */
  preview: (dayKey: string, meal: MealTarget) => SheetPreview;
  onConfirm: (dayKey: string, meal: MealTarget) => void;
  busy?: boolean;
  error?: string | null;
}

/**
 * La feuille repas × jour, commune à toutes les copies et à tous les
 * déplacements : « Copier depuis » sur un repas du hub, « Copier vers » et
 * « Déplacer vers » depuis la sélection ou la fiche d'un aliment. Seul le sens
 * change — une feuille, un vocabulaire.
 *
 * Deux roues natives iOS (`UIPickerView` via @react-native-picker/picker) :
 * c'est le composant d'Apple, avec son inertie, son aimantation et son tic
 * haptique à chaque cran, pas une imitation. Sur Android, la même bibliothèque
 * rend une liste déroulante.
 *
 * L'aperçu sous les roues montre ce qui va se passer AVANT l'appui : on voit
 * qu'un repas source est vide ou qu'on vise le mauvais jour sans avoir à
 * défaire une copie.
 */
export function DayMealSheet({
  visible,
  onClose,
  title,
  direction,
  initialDayKey,
  initialMeal,
  allowOrigin = false,
  preview,
  onConfirm,
  busy = false,
  error = null,
}: DayMealSheetProps): React.JSX.Element {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [dayKey, setDayKey] = useState(initialDayKey);
  const [meal, setMeal] = useState<MealTarget>(initialMeal);

  // Chaque ouverture repart des valeurs proposées : rouvrir la feuille sur un
  // autre repas ne doit pas hériter des roues de la fois précédente.
  useEffect(() => {
    if (visible) {
      setDayKey(initialDayKey);
      setMeal(initialMeal);
    }
  }, [visible, initialDayKey, initialMeal]);

  const todayKey = dayKeyOf(new Date());
  const days = useMemo(() => wheelDayKeys(todayKey, initialDayKey), [todayKey, initialDayKey]);

  const dayLabel = (key: string): string => dayLabelOf(key, t, { todayKey });

  const meals: MealTarget[] = allowOrigin ? ['origin', ...MEALS] : MEALS;
  const result = preview(dayKey, meal);
  const total = result.rows.reduce((s, r) => s + r.kcal, 0);
  const disabled = result.disabled || busy;

  // Taille et couleur des libellés : le seul réglage que la roue native
  // accepte. La bande de sélection prend la surface surélevée du thème.
  const itemStyle = { color: colors.text, fontSize: 19, height: 180 };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel={t('common.close')} />
        <View
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radii.xl,
            borderTopRightRadius: radii.xl,
            paddingHorizontal: spacing[4],
            paddingTop: spacing[3],
            paddingBottom: spacing[4] + insets.bottom,
            gap: spacing[3],
          }}
        >
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center' }} />
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing[3] }}>
            <Text variant="heading" style={{ flex: 1 }} numberOfLines={1}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text variant="body" color="primary">{t('common.close')}</Text>
            </Pressable>
          </View>

          <Text variant="label" color="textSubtle">
            {direction === 'from' ? t('nutrition.copy.from') : t('nutrition.copy.to')}
          </Text>
          <View style={{ flexDirection: 'row', height: 180, overflow: 'hidden' }}>
            <Picker
              style={{ flex: 1 }}
              itemStyle={itemStyle}
              selectionColor={colors.surfaceElevated}
              selectedValue={meal}
              onValueChange={(v) => setMeal(v as MealTarget)}
              accessibilityLabel={t('nutrition.copy.mealWheel')}
            >
              {meals.map((m) => (
                <Picker.Item
                  key={m}
                  value={m}
                  label={m === 'origin' ? t('nutrition.copy.origin') : t(`nutrition.journal.meal.${m}`)}
                  color={m === 'origin' ? colors.primary : undefined}
                />
              ))}
            </Picker>
            <Picker
              style={{ flex: 1.2 }}
              itemStyle={itemStyle}
              selectionColor={colors.surfaceElevated}
              selectedValue={dayKey}
              onValueChange={(v) => setDayKey(String(v))}
              accessibilityLabel={t('nutrition.copy.dayWheel')}
            >
              {days.map((k) => (
                <Picker.Item key={k} value={k} label={dayLabel(k)} />
              ))}
            </Picker>
          </View>

          <View style={{ backgroundColor: colors.background, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing[3] }}>
            {result.rows.length === 0 ? (
              <Text variant="caption" color="textSubtle" style={{ textAlign: 'center', paddingVertical: spacing[5] }}>
                {result.emptyMessage}
              </Text>
            ) : (
              <ScrollView style={{ maxHeight: 176 }}>
                {result.rows.map((r) => (
                  <View key={r.key} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing[2], paddingVertical: spacing[2], borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="body" numberOfLines={1}>{r.name}</Text>
                      {r.detail ? <Text variant="caption" color="textSubtle" numberOfLines={1}>{r.detail}</Text> : null}
                    </View>
                    <Text variant="body" color="textMuted" style={{ fontVariant: ['tabular-nums'] }}>{Math.round(r.kcal)}</Text>
                  </View>
                ))}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing[2] }}>
                  <Text variant="body" color="textMuted" style={{ fontWeight: '600' }}>{t('nutrition.copy.total')}</Text>
                  <Text variant="body" style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>{Math.round(total)} kcal</Text>
                </View>
              </ScrollView>
            )}
          </View>

          {error ? <Text variant="caption" style={{ color: colors.error }}>{error}</Text> : null}

          <Pressable
            onPress={() => onConfirm(dayKey, meal)}
            disabled={disabled}
            style={({ pressed }) => ({
              height: 52,
              borderRadius: radii.xl,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.primary,
              opacity: disabled ? 0.35 : pressed ? 0.85 : 1,
            })}
          >
            {busy ? (
              <ActivityIndicator color={colors.onGradient} />
            ) : (
              <Text variant="subtitle" style={{ fontWeight: '700', color: colors.onGradient }}>{result.confirmLabel}</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
