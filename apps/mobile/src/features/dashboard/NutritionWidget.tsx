import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Card, Meter, ProgressRing, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { estimateTargets, sumDay } from '@supotsu/engines';
import type { HealthMetric } from '@supotsu/core';
import { useHealthMetrics, useNutritionEntries } from '@/lib/data/queries';
import { usePreferences } from '@/lib/preferences';

function latestWeight(metrics: HealthMetric[]): number | undefined {
  return metrics
    .filter((m) => m.type === 'weight')
    .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0]?.value;
}

interface MacroRowProps {
  label: string;
  value: number;
  target: number;
  color: string;
}
function MacroRow({ label, value, target, color }: MacroRowProps): React.JSX.Element {
  const { t } = useTranslation();
  const pct = target > 0 ? (value / target) * 100 : 0;
  return (
    <View style={{ gap: spacing[1] }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text variant="label" color="textMuted">
          {label.toUpperCase()}
        </Text>
        <Text variant="caption">
          {t('dashboard.nutritionWidget.macroValue', { value: Math.round(value), target })}
        </Text>
      </View>
      <Meter value={pct} color={color} height={6} />
    </View>
  );
}

/** Nutrition widget: calorie ring + macro bars vs estimated targets. */
export function NutritionWidget(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { data: entries = [] } = useNutritionEntries();
  const { data: health = [] } = useHealthMetrics();
  const { preferences } = usePreferences();
  const asOf = new Date().toISOString();

  const totals = useMemo(() => sumDay(entries, asOf), [entries, asOf]);
  const targets = useMemo(
    () => estimateTargets({ weightKg: latestWeight(health) }, asOf),
    [health, asOf],
  );

  const kcalTarget = preferences.nutritionGoals?.kcal ?? targets.value.kcal;
  const proteinTarget = preferences.nutritionGoals?.proteinG ?? targets.value.proteinG;
  // Same 55/45 auto split NutritionScreen seeds its "linked" macros with —
  // read the real customized carbG/fatG once the user has set them there.
  const remainingKcal = Math.max(0, kcalTarget - proteinTarget * 4);
  const carbTarget = preferences.nutritionGoals?.carbG ?? Math.round((remainingKcal * 0.55) / 4);
  const fatTarget = preferences.nutritionGoals?.fatG ?? Math.round((remainingKcal * 0.45) / 9);
  const remainingKcalToday = kcalTarget - totals.kcal;

  return (
    <Pressable onPress={() => router.push('/nutrition')}>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text variant="heading">{t('dashboard.nutritionWidget.title')}</Text>
          <Text variant="caption" color={remainingKcalToday >= 0 ? 'textMuted' : 'warning'}>
            {remainingKcalToday >= 0
              ? t('dashboard.nutritionWidget.remaining', { kcal: remainingKcalToday })
              : t('dashboard.nutritionWidget.exceeded', { kcal: -remainingKcalToday })}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[4], marginTop: spacing[3] }}>
          <ProgressRing
            value={kcalTarget > 0 ? (totals.kcal / kcalTarget) * 100 : 0}
            centerLabel={String(totals.kcal)}
            caption={t('dashboard.nutritionWidget.kcalCaption')}
            color={colors.accentLime}
            size={104}
          />
          <View style={{ flex: 1, gap: spacing[3] }}>
            <MacroRow label={t('dashboard.nutritionWidget.protein')} value={totals.proteinG} target={proteinTarget} color={colors.primary} />
            <MacroRow label={t('dashboard.nutritionWidget.carbs')} value={totals.carbG} target={carbTarget} color={colors.primary} />
            <MacroRow label={t('dashboard.nutritionWidget.fat')} value={totals.fatG} target={fatTarget} color={colors.primary} />
          </View>
        </View>

        {targets.confidence === 'to_confirm' && (
          <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[2] }}>
            {t('dashboard.nutritionWidget.targetsEstimated')}
          </Text>
        )}
      </Card>
    </Pressable>
  );
}
