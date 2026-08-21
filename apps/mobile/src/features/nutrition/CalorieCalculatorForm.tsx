import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Button, Input, SegmentedControl, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { estimateDeficitTarget, estimateTargets, type ActivityLevel } from '@supotsu/engines';
import { useHealthMetrics } from '@/lib/data/queries';
import { usePreferences } from '@/lib/preferences';

const SEX_OPTIONS = [
  { value: 'male', label: 'Homme' },
  { value: 'female', label: 'Femme' },
] as const;

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string }[] = [
  { value: 'sedentary', label: 'Sédentaire — peu ou pas d’activité' },
  { value: 'light', label: 'Peu actif — 1 à 3 j / semaine' },
  { value: 'moderate', label: 'Modérément actif — 3 à 5 j / semaine' },
  { value: 'active', label: 'Très actif — 6 à 7 j / semaine' },
  { value: 'very_active', label: 'Extrêmement actif — travail physique' },
];

/**
 * Deficit calculator (age/sexe/taille/poids/objectif/durée/activité → BMR,
 * TDEE, cible calorique) — complements Kaizen's own bodyweight-only
 * auto-estimate. Lives collapsed inside the Nutrition "Objectifs" card;
 * result can be applied straight to the Nutrition goals.
 */
export function CalorieCalculatorForm(): React.JSX.Element {
  const { colors } = useTheme();
  const { data: health = [] } = useHealthMetrics();
  const { preferences, setPreference } = usePreferences();

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
    // target comes from this calculator's more detailed inputs.
    const base = estimateTargets({ weightKg: inputs.weightKg, goal: 'body_composition' }, new Date().toISOString()).value;
    setPreference('nutritionGoals', {
      kcal: result.targetKcal,
      proteinG: preferences.nutritionGoals?.proteinG ?? Math.round(base.proteinG),
      hydrationMl: preferences.nutritionGoals?.hydrationMl ?? Math.round(base.hydrationMl),
    });
    setApplied(true);
  };

  return (
    <View style={{ marginTop: spacing[3], paddingTop: spacing[3], borderTopWidth: 1, borderTopColor: colors.border }}>
      <Pressable onPress={() => setOpen((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <Text variant="body" style={{ fontWeight: '600' }}>Calculateur de calories détaillé</Text>
          <Text variant="caption" color="textSubtle">Âge, taille, activité… une estimation plus poussée que le calcul auto</Text>
        </View>
        <Text variant="subtitle" color="textSubtle">{open ? '−' : '+'}</Text>
      </Pressable>

      {open ? (
        <View style={{ marginTop: spacing[4], gap: spacing[3] }}>
          <Input label="Âge" placeholder="Ex : 35" keyboardType="numeric" value={age} onChangeText={setAge} />

          <View style={{ gap: spacing[1] }}>
            <Text variant="label" color="textMuted">SEXE</Text>
            <SegmentedControl options={SEX_OPTIONS} value={sex} onChange={setSex} />
          </View>

          <Input label="Taille (cm)" placeholder="Ex : 175" keyboardType="numeric" value={heightCm} onChangeText={setHeightCm} />
          <Input label="Poids actuel (kg)" placeholder="Ex : 80" keyboardType="numeric" value={weightKg} onChangeText={setWeightKg} />
          <Input label="Objectif de poids (kg)" placeholder="Ex : 70" keyboardType="numeric" value={goalWeightKg} onChangeText={setGoalWeightKg} />
          <Input label="Durée (mois)" placeholder="Ex : 3" keyboardType="numeric" value={durationMonths} onChangeText={setDurationMonths} />

          <View style={{ gap: spacing[1] }}>
            <Text variant="label" color="textMuted">NIVEAU D'ACTIVITÉ PHYSIQUE</Text>
            <SegmentedControl options={ACTIVITY_OPTIONS} value={activity} onChange={setActivity} vertical />
          </View>

          {result ? (
            <View style={{ marginTop: spacing[2], paddingTop: spacing[3], borderTopWidth: 1, borderTopColor: colors.border }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                <View style={{ alignItems: 'center' }}>
                  <Text variant="subtitle">{result.bmr}</Text>
                  <Text variant="caption" color="textSubtle">BMR (kcal)</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text variant="subtitle">{result.tdee}</Text>
                  <Text variant="caption" color="textSubtle">Dépense totale</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text variant="subtitle" style={{ color: colors.accentData }}>{result.targetKcal}</Text>
                  <Text variant="caption" color="textSubtle">Cible / jour</Text>
                </View>
              </View>
              <Text variant="caption" color="textMuted" style={{ marginTop: spacing[3], lineHeight: 18 }}>
                {result.dailyDeficit > 0
                  ? `Déficit d'environ ${result.dailyDeficit} kcal/jour pour atteindre ${inputs.goalWeightKg} kg en ${inputs.durationMonths} mois.`
                  : result.dailyDeficit < 0
                    ? `Surplus d'environ ${Math.abs(result.dailyDeficit)} kcal/jour pour atteindre ${inputs.goalWeightKg} kg en ${inputs.durationMonths} mois.`
                    : 'Ton poids actuel correspond déjà à ton objectif.'}
              </Text>
              <View style={{ marginTop: spacing[4] }}>
                <Button label={applied ? 'Appliqué à mes objectifs ✓' : 'Appliquer à mes objectifs Nutrition'} onPress={applyResult} disabled={applied} fullWidth />
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
