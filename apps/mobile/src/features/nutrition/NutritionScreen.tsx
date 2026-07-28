import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Card, ProgressRing, Screen, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import {
  computeNutritionScore,
  entriesForDay,
  estimateTargets,
  nutritionExplanation,
  sumDay,
} from '@supotsu/engines';
import { useHealthMetrics, useNutritionEntries } from '@/lib/data/queries';

const MEAL_LABEL: Record<string, string> = {
  breakfast: 'Petit-déj',
  lunch: 'Déjeuner',
  dinner: 'Dîner',
  snack: 'Collation',
};

function MacroBar({
  label,
  current,
  target,
  unit,
  color,
}: {
  label: string;
  current: number;
  target: number;
  unit: string;
  color: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  const remaining = Math.max(0, Math.round(target - current));
  return (
    <View style={{ gap: spacing[1] }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text variant="body">{label}</Text>
        <Text variant="caption" color="textMuted">
          {Math.round(current)} / {target} {unit}
        </Text>
      </View>
      <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.surfaceElevated, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: 10, borderRadius: 5, backgroundColor: color }} />
      </View>
      <Text variant="caption" color="textSubtle">
        {remaining} {unit} restant{remaining > 1 ? 's' : ''}
      </Text>
    </View>
  );
}

/** Nutrition pillar (Master Prompt P11): explainable score, targets, day log. */
export function NutritionScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { data: entries = [] } = useNutritionEntries();
  const { data: health = [] } = useHealthMetrics();
  const asOf = new Date().toISOString();

  const latestWeight = useMemo(
    () =>
      health
        .filter((m) => m.type === 'weight')
        .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0]?.value,
    [health],
  );

  const targets = useMemo(
    () => estimateTargets({ weightKg: latestWeight }, asOf),
    [latestWeight, asOf],
  );
  const score = useMemo(
    () => computeNutritionScore(entries, targets.value, asOf),
    [entries, targets, asOf],
  );
  const totals = useMemo(() => sumDay(entries, asOf), [entries, asOf]);
  const explanation = useMemo(
    () => nutritionExplanation(entries, targets.value, asOf),
    [entries, targets, asOf],
  );
  const today = useMemo(() => entriesForDay(entries, asOf), [entries, asOf]);
  const hasData = today.length > 0;

  // Carb/fat targets aren't stored — derive them from the remaining calories
  // after protein (transparent 55/45 split), same as the dashboard widget.
  const kcalTarget = targets.value.kcal;
  const remainingKcal = Math.max(0, kcalTarget - targets.value.proteinG * 4);
  const carbTarget = Math.round((remainingKcal * 0.55) / 4);
  const fatTarget = Math.round((remainingKcal * 0.45) / 9);
  const kcalPct = hasData && kcalTarget > 0 ? Math.min(100, (totals.kcal / kcalTarget) * 100) : 0;

  return (
    <Screen scroll>
      <Text variant="title">Nutrition</Text>
      <Text variant="caption" color="textMuted">
        Ce que tu manges et bois, expliqué — pas de calcul opaque.
      </Text>

      <Card>
        <View style={{ alignItems: 'center', gap: spacing[2] }}>
          <ProgressRing
            value={kcalPct}
            color={colors.primary}
            centerLabel={hasData ? String(Math.round(totals.kcal)) : '—'}
            caption={`/ ${Math.round(kcalTarget)} kcal`}
            size={148}
          />
          <View style={{ flexDirection: 'row', gap: spacing[2], alignItems: 'center' }}>
            <Badge label={hasData ? `Score ${score.value}/100` : 'À calibrer'} tone="info" />
            <Text variant="caption" color="textMuted">
              {hasData
                ? `${Math.max(0, Math.round(kcalTarget - totals.kcal))} kcal restantes`
                : 'Ajoute un repas pour calculer ton score.'}
            </Text>
          </View>
        </View>
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="heading">Macros du jour</Text>
          <Badge label="À confirmer" tone="warning" />
        </View>
        <Text variant="caption" color="textMuted">
          {targets.explanation?.observation}
        </Text>
        <View style={{ gap: spacing[3], marginTop: spacing[2] }}>
          <MacroBar
            label="Protéines"
            current={totals.proteinG}
            target={targets.value.proteinG}
            unit="g"
            color={colors.accentData}
          />
          <MacroBar label="Glucides" current={totals.carbG} target={carbTarget} unit="g" color={colors.info} />
          <MacroBar label="Lipides" current={totals.fatG} target={fatTarget} unit="g" color={colors.warning} />
          <MacroBar
            label="Hydratation"
            current={totals.hydrationMl}
            target={targets.value.hydrationMl}
            unit="ml"
            color={colors.accentEndurance}
          />
        </View>
      </Card>

      {explanation ? (
        <Card>
          <Text variant="heading">Analyse</Text>
          <Text variant="caption" color="textMuted">
            {explanation.observation}
          </Text>
          <Text variant="caption" color="textMuted">
            {explanation.analysis}
          </Text>
          <Text variant="body">{explanation.action}</Text>
        </Card>
      ) : null}

      <Card>
        <Text variant="heading">Aujourd'hui</Text>
        {hasData ? (
          today.map((e) => (
            <View
              key={e.id}
              style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing[1] }}
            >
              <Text variant="body">
                {MEAL_LABEL[e.mealType] ?? e.mealType} · {e.description}
              </Text>
              <Text variant="caption" color="textMuted">
                {Math.round(e.kcal)} kcal
              </Text>
            </View>
          ))
        ) : (
          <Text variant="body" color="textMuted">
            Aucun repas enregistré aujourd'hui.
          </Text>
        )}
        <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[2] }}>
          <Button label="Chercher un aliment" onPress={() => router.push('/food/search')} />
          <Button label="Saisie manuelle" variant="secondary" onPress={() => router.push('/meal/new')} />
        </View>
      </Card>
    </Screen>
  );
}
