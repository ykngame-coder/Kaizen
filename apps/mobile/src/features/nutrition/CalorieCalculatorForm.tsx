import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Input, SegmentedControl, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { estimateDeficitTarget, estimateTargets, rebalanceMacros, type ActivityLevel } from '@supotsu/engines';
import { useHealthMetrics } from '@/lib/data/queries';
import { usePreferences } from '@/lib/preferences';

/**
 * Deficit calculator (age/sexe/taille/poids/objectif/durée/activité → BMR,
 * TDEE, cible calorique) — complements Kaizen's own bodyweight-only
 * auto-estimate. Lives collapsed inside the Nutrition "Objectifs" card;
 * result can be applied straight to the Nutrition goals.
 */
export function CalorieCalculatorForm(): React.JSX.Element {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { data: health = [] } = useHealthMetrics();
  const { preferences, setPreference } = usePreferences();

  const SEX_OPTIONS = [
    { value: 'male', label: t('nutrition.calorieCalculator.sex.male') },
    { value: 'female', label: t('nutrition.calorieCalculator.sex.female') },
  ] as const;

  const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string }[] = [
    { value: 'sedentary', label: t('nutrition.calorieCalculator.activity.sedentary') },
    { value: 'light', label: t('nutrition.calorieCalculator.activity.light') },
    { value: 'moderate', label: t('nutrition.calorieCalculator.activity.moderate') },
    { value: 'active', label: t('nutrition.calorieCalculator.activity.active') },
    { value: 'very_active', label: t('nutrition.calorieCalculator.activity.veryActive') },
  ];

  const [open, setOpen] = useState(false);

  const latestWeight = useMemo(() => {
    const weights = health.filter((m) => m.type === 'weight').sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
    return weights.at(-1)?.value;
  }, [health]);

  const [age, setAge] = useState('');
  const [sex, setSex] = useState<'male' | 'female'>('male');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState(latestWeight != null ? String(latestWeight) : '');
  const [goalWeightKg, setGoalWeightKg] = useState('');
  const [durationMonths, setDurationMonths] = useState('3');
  const [activity, setActivity] = useState<ActivityLevel>('light');
  const [applied, setApplied] = useState(false);

  const inputs = {
    age: Number(age),
    heightCm: Number(heightCm),
    weightKg: Number(weightKg),
    goalWeightKg: Number(goalWeightKg),
    durationMonths: Number(durationMonths),
  };
  const valid = Object.values(inputs).every((v) => Number.isFinite(v) && v > 0);

  const result = useMemo(() => (valid ? estimateDeficitTarget({ ...inputs, sex, activity }) : null), [valid, inputs.age, inputs.heightCm, inputs.weightKg, inputs.goalWeightKg, inputs.durationMonths, sex, activity]);

  const applyResult = (): void => {
    if (!result) return;
    // Kaizen's own protein/hydration ratios still apply — only the calorie
    // target comes from this calculator's more detailed inputs. Carbs/fat
    // stay "linked": rescale the user's existing split if they'd already
    // customized one, else fall back to the same 55/45 auto split.
    const base = estimateTargets({ weightKg: inputs.weightKg, goal: 'body_composition' }, new Date().toISOString()).value;
    const proteinG = preferences.nutritionGoals?.proteinG ?? Math.round(base.proteinG);
    const hydrationMl = preferences.nutritionGoals?.hydrationMl ?? Math.round(base.hydrationMl);
    const prior = preferences.nutritionGoals;
    let carbG: number;
    let fatG: number;
    if (prior) {
      const rescaled = rebalanceMacros({ kcal: prior.kcal, proteinG: prior.proteinG, carbG: prior.carbG, fatG: prior.fatG }, 'kcal', result.targetKcal);
      carbG = rescaled.carbG;
      fatG = rescaled.fatG;
    } else {
      const remainingKcal = Math.max(0, result.targetKcal - proteinG * 4);
      carbG = Math.round((remainingKcal * 0.55) / 4);
      fatG = Math.round((remainingKcal * 0.45) / 9);
    }
    setPreference('nutritionGoals', { kcal: result.targetKcal, proteinG, carbG, fatG, hydrationMl });
    setApplied(true);
  };

  return (
    <View style={{ marginTop: spacing[3], paddingTop: spacing[3], borderTopWidth: 1, borderTopColor: colors.border }}>
      <Pressable onPress={() => setOpen((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <Text variant="body" style={{ fontWeight: '600' }}>{t('nutrition.calorieCalculator.toggleTitle')}</Text>
          <Text variant="caption" color="textSubtle">{t('nutrition.calorieCalculator.toggleSubtitle')}</Text>
        </View>
        <Text variant="subtitle" color="textSubtle">{open ? '−' : '+'}</Text>
      </Pressable>

      {open ? (
        <View style={{ marginTop: spacing[4], gap: spacing[3] }}>
          <Input label={t('nutrition.calorieCalculator.ageLabel')} placeholder={t('nutrition.calorieCalculator.agePlaceholder')} keyboardType="numeric" value={age} onChangeText={setAge} />

          <View style={{ gap: spacing[1] }}>
            <Text variant="label" color="textMuted">{t('nutrition.calorieCalculator.sexLabel')}</Text>
            <SegmentedControl options={SEX_OPTIONS} value={sex} onChange={setSex} />
          </View>

          <Input label={t('nutrition.calorieCalculator.heightLabel')} placeholder={t('nutrition.calorieCalculator.heightPlaceholder')} keyboardType="numeric" value={heightCm} onChangeText={setHeightCm} />
          <Input label={t('nutrition.calorieCalculator.weightLabel')} placeholder={t('nutrition.calorieCalculator.weightPlaceholder')} keyboardType="numeric" value={weightKg} onChangeText={setWeightKg} />
          <Input label={t('nutrition.calorieCalculator.goalWeightLabel')} placeholder={t('nutrition.calorieCalculator.goalWeightPlaceholder')} keyboardType="numeric" value={goalWeightKg} onChangeText={setGoalWeightKg} />
          <Input label={t('nutrition.calorieCalculator.durationLabel')} placeholder={t('nutrition.calorieCalculator.durationPlaceholder')} keyboardType="numeric" value={durationMonths} onChangeText={setDurationMonths} />

          <View style={{ gap: spacing[1] }}>
            <Text variant="label" color="textMuted">{t('nutrition.calorieCalculator.activityLabel')}</Text>
            <SegmentedControl options={ACTIVITY_OPTIONS} value={activity} onChange={setActivity} vertical />
          </View>

          {result ? (
            <View style={{ marginTop: spacing[2], paddingTop: spacing[3], borderTopWidth: 1, borderTopColor: colors.border }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                <View style={{ alignItems: 'center' }}>
                  <Text variant="subtitle">{result.bmr}</Text>
                  <Text variant="caption" color="textSubtle">{t('nutrition.calorieCalculator.bmrLabel')}</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text variant="subtitle">{result.tdee}</Text>
                  <Text variant="caption" color="textSubtle">{t('nutrition.calorieCalculator.tdeeLabel')}</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text variant="subtitle" style={{ color: colors.accentData }}>{result.targetKcal}</Text>
                  <Text variant="caption" color="textSubtle">{t('nutrition.calorieCalculator.targetLabel')}</Text>
                </View>
              </View>
              <Text variant="caption" color="textMuted" style={{ marginTop: spacing[3], lineHeight: 18 }}>
                {result.dailyDeficit > 0
                  ? t('nutrition.calorieCalculator.deficitMessage', { deficit: result.dailyDeficit, goalWeight: inputs.goalWeightKg, duration: inputs.durationMonths })
                  : result.dailyDeficit < 0
                    ? t('nutrition.calorieCalculator.surplusMessage', { deficit: Math.abs(result.dailyDeficit), goalWeight: inputs.goalWeightKg, duration: inputs.durationMonths })
                    : t('nutrition.calorieCalculator.atGoalMessage')}
              </Text>
              <View style={{ marginTop: spacing[4] }}>
                <Button label={applied ? t('nutrition.calorieCalculator.appliedButton') : t('nutrition.calorieCalculator.applyButton')} onPress={applyResult} disabled={applied} fullWidth />
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
