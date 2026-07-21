import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Card, KPICard, Screen, Text, useTheme } from '@supotsu/ui';
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

function ProgressRow({
  label,
  current,
  target,
  unit,
}: {
  label: string;
  current: number;
  target: number;
  unit: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  return (
    <View style={{ gap: spacing[1] }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="caption" color="textMuted">
          {label}
        </Text>
        <Text variant="caption" color="textMuted">
          {Math.round(current)} / {target} {unit}
        </Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border }}>
        <View
          style={{ width: `${pct}%`, height: 6, borderRadius: 3, backgroundColor: colors.primary }}
        />
      </View>
    </View>
  );
}

/** Nutrition pillar (Master Prompt P11): explainable score, targets, day log. */
export function NutritionScreen(): React.JSX.Element {
  const router = useRouter();
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

  return (
    <Screen scroll>
      <Text variant="title">Nutrition</Text>
      <Text variant="caption" color="textMuted">
        Ce que tu manges et bois, expliqué — pas de calcul opaque.
      </Text>

      <KPICard
        label="Score nutrition du jour"
        value={hasData ? String(score.value) : '—'}
        unit="/100"
        caption={
          hasData
            ? 'Basé sur calories, protéines et hydratation vs tes cibles.'
            : 'Ajoute un repas pour calculer ton score.'
        }
      />

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="heading">Cibles du jour</Text>
          <Badge label="À confirmer" tone="warning" />
        </View>
        <Text variant="caption" color="textMuted">
          {targets.explanation?.observation}
        </Text>
        <View style={{ gap: spacing[3], marginTop: spacing[2] }}>
          <ProgressRow label="Calories" current={totals.kcal} target={targets.value.kcal} unit="kcal" />
          <ProgressRow label="Protéines" current={totals.proteinG} target={targets.value.proteinG} unit="g" />
          <ProgressRow
            label="Hydratation"
            current={totals.hydrationMl}
            target={targets.value.hydrationMl}
            unit="ml"
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
        <View style={{ alignItems: 'flex-start', marginTop: spacing[2] }}>
          <Button label="Ajouter un repas" onPress={() => router.push('/meal/new')} />
        </View>
      </Card>
    </Screen>
  );
}
