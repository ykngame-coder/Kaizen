import React, { useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, Fab, ProgressRing, Screen, Sparkline, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import {
  computeNutritionScore,
  dailySums,
  entriesForDay,
  estimateTargets,
  nutritionExplanation,
  sumDay,
} from '@supotsu/engines';
import type { TrendPoint } from '@supotsu/engines';
import { useAddNutritionEntry, useHealthMetrics, useNutritionEntries } from '@/lib/data/queries';

const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
const MEAL_LABEL: Record<string, string> = { breakfast: 'Petit-déjeuner', lunch: 'Déjeuner', dinner: 'Dîner', snack: 'Collation' };
const MEAL_ICON: Record<string, string> = { breakfast: '🥣', lunch: '🍗', dinner: '🍝', snack: '🍎' };

function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }): React.JSX.Element {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: spacing[3] }}>
      <Text variant="heading">{children}</Text>
      {right}
    </View>
  );
}

/** One macro ring (protein / carbs / fat). */
function MacroRing({ label, current, target, color }: { label: string; current: number; target: number; color: string }): React.JSX.Element {
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  return (
    <View style={{ alignItems: 'center' }}>
      <ProgressRing value={pct} size={78} thickness={8} color={color} centerLabel={`${pct}%`} />
      <Text variant="caption" style={{ color, fontWeight: '700', marginTop: spacing[1] }}>{label}</Text>
      <Text variant="caption" color="textSubtle">{Math.round(current)} / {Math.round(target)} g</Text>
    </View>
  );
}

function GoalBar({ label, current, target, unit, color }: { label: string; current: number; target: number; unit: string; color: string }): React.JSX.Element {
  const { colors } = useTheme();
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  return (
    <View style={{ marginTop: spacing[3] }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="body">{label}</Text>
        <Text variant="caption" color="textMuted">{Math.round(current)} / {Math.round(target)} {unit}</Text>
      </View>
      <View style={{ height: 8, borderRadius: 6, backgroundColor: colors.surfaceElevated, overflow: 'hidden', marginTop: 6 }}>
        <View style={{ width: `${pct}%`, height: 8, borderRadius: 6, backgroundColor: color }} />
      </View>
    </View>
  );
}

/** Nutrition (mockup #11) — kcal ring, macros, hydration, meals, score, trends, goals. */
export function NutritionScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { data: entries = [] } = useNutritionEntries();
  const { data: health = [] } = useHealthMetrics();
  const addEntry = useAddNutritionEntry();
  const asOf = new Date().toISOString();

  const addWater = (ml: number): void => {
    addEntry.mutate({ mealType: 'snack', description: 'Eau', kcal: 0, hydrationMl: ml, source: 'manual', loggedAt: new Date().toISOString() });
  };

  const latestWeight = useMemo(() => health.filter((m) => m.type === 'weight').sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0]?.value, [health]);
  const targets = useMemo(() => estimateTargets({ weightKg: latestWeight }, asOf), [latestWeight, asOf]);
  const totals = useMemo(() => sumDay(entries, asOf), [entries, asOf]);
  const today = useMemo(() => entriesForDay(entries, asOf), [entries, asOf]);
  const score = useMemo(() => computeNutritionScore(entries, targets.value, asOf), [entries, targets, asOf]);
  const explanation = useMemo(() => nutritionExplanation(entries, targets.value, asOf), [entries, targets, asOf]);
  const hasData = today.length > 0;

  const kcalTarget = targets.value.kcal;
  const remainingKcal = Math.max(0, kcalTarget - targets.value.proteinG * 4);
  const carbTarget = Math.round((remainingKcal * 0.55) / 4);
  const fatTarget = Math.round((remainingKcal * 0.45) / 9);
  const kcalPct = hasData && kcalTarget > 0 ? Math.min(100, (totals.kcal / kcalTarget) * 100) : 0;
  const remaining = Math.max(0, Math.round(kcalTarget - totals.kcal));

  // Meals grouped by type (today).
  const meals = useMemo(() => {
    return MEAL_ORDER.map((type) => {
      const es = today.filter((e) => e.mealType === type);
      const kcal = es.reduce((s, e) => s + e.kcal, 0);
      const p = es.reduce((s, e) => s + (e.proteinG ?? 0), 0);
      const c = es.reduce((s, e) => s + (e.carbG ?? 0), 0);
      const f = es.reduce((s, e) => s + (e.fatG ?? 0), 0);
      return { type, count: es.length, kcal, p, c, f };
    });
  }, [today]);

  // 30-day calorie trend.
  const kcalSeries = useMemo(() => {
    const pts: TrendPoint[] = entries.map((e) => ({ date: e.loggedAt, value: e.kcal }));
    return dailySums(pts, asOf, 30).filter((v) => v > 0);
  }, [entries, asOf]);

  return (
    <View style={{ flex: 1 }}>
      <Screen scroll>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View>
            <Text variant="title">Nutrition</Text>
            <Text variant="caption" color="textSubtle">Ton carburant du jour</Text>
          </View>
          <Pressable onPress={() => router.push('/search')} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 16 }}>🔍</Text></View>
          </Pressable>
        </View>

        {/* Main kcal ring + balance */}
        <Card style={{ alignItems: 'center' }}>
          <ProgressRing value={kcalPct} size={168} thickness={12} gradient centerLabel={hasData ? `${Math.round(totals.kcal)}` : '—'} caption={`/ ${Math.round(kcalTarget)} kcal`} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', width: '100%', marginTop: spacing[4], paddingTop: spacing[4], borderTopWidth: 1, borderTopColor: colors.border }}>
            <Balance label="Restantes" value={`${remaining} kcal`} color={colors.accentData} />
            <Balance label="Cible" value={`${Math.round(kcalTarget)}`} />
            <Balance label="Consommé" value={`${Math.round(totals.kcal)}`} />
          </View>
        </Card>

        {/* Macros */}
        <Card>
          <SectionTitle>Macronutriments</SectionTitle>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
            <MacroRing label="Protéines" current={totals.proteinG} target={targets.value.proteinG} color={colors.accentData} />
            <MacroRing label="Glucides" current={totals.carbG} target={carbTarget} color={colors.warning} />
            <MacroRing label="Lipides" current={totals.fatG} target={fatTarget} color={colors.accentMobility} />
          </View>
        </Card>

        {/* Hydration */}
        <Card>
          <SectionTitle right={<Text variant="subtitle" style={{ color: colors.accentEndurance }}>{(totals.hydrationMl / 1000).toFixed(1)} / {(targets.value.hydrationMl / 1000).toFixed(1)} L</Text>}>Hydratation</SectionTitle>
          <View style={{ height: 10, borderRadius: 6, backgroundColor: colors.surfaceElevated, overflow: 'hidden' }}>
            <View style={{ width: `${Math.min(100, (totals.hydrationMl / targets.value.hydrationMl) * 100)}%`, height: 10, backgroundColor: colors.accentEndurance }} />
          </View>
          <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[3] }}>
            {[250, 500, 750].map((ml) => (<Button key={ml} label={`+${ml} ml`} variant="secondary" onPress={() => addWater(ml)} />))}
          </View>
        </Card>

        {/* Repas */}
        <Card>
          <SectionTitle>Repas</SectionTitle>
          {meals.map((m, i) => (
            <View key={m.type} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3], borderBottomWidth: i < meals.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 19 }}>{MEAL_ICON[m.type]}</Text></View>
              <View style={{ flex: 1 }}>
                <Text variant="body" style={{ fontWeight: '600' }}>{MEAL_LABEL[m.type]}</Text>
                <Text variant="caption" color="textSubtle" style={{ marginTop: 2 }}>{m.count > 0 ? `P ${Math.round(m.p)} · G ${Math.round(m.c)} · L ${Math.round(m.f)}` : 'à planifier'}</Text>
              </View>
              {m.count > 0 ? <Text variant="body" style={{ fontWeight: '700' }}>{Math.round(m.kcal)}</Text> : <Text variant="caption" color="textSubtle">En attente</Text>}
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[3] }}>
            <Button label="Chercher un aliment" onPress={() => router.push('/food/search')} />
            <Button label="Saisie manuelle" variant="secondary" onPress={() => router.push('/meal/new')} />
          </View>
        </Card>

        {/* Nutrition Score */}
        <Card>
          <SectionTitle>Nutrition Score</SectionTitle>
          <View style={{ flexDirection: 'row', gap: spacing[5], alignItems: 'center' }}>
            <ProgressRing value={hasData ? score.value : 0} size={96} thickness={9} color={colors.accentData} centerLabel={hasData ? `${score.value}` : '—'} caption="/ 100" />
            <View style={{ flex: 1 }}>
              <Text variant="body">{hasData ? (score.value >= 80 ? 'Très bonne qualité nutritionnelle.' : score.value >= 60 ? 'Qualité correcte, à affiner.' : 'Qualité à améliorer.') : 'Ajoute un repas pour calculer ton score.'}</Text>
              <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[2], lineHeight: 18 }}>Basé sur : calories, protéines, équilibre des macros et hydratation.</Text>
            </View>
          </View>
        </Card>

        {/* Impact */}
        {explanation ? (
          <Card>
            <SectionTitle>Impact aujourd'hui</SectionTitle>
            <Text variant="body" color="textMuted">{explanation.observation}</Text>
            <Text variant="body" color="textMuted" style={{ marginTop: spacing[1] }}>{explanation.analysis}</Text>
            <Text variant="body" style={{ marginTop: spacing[2] }}>{explanation.action}</Text>
          </Card>
        ) : null}

        {/* Tendances */}
        {kcalSeries.length >= 2 ? (
          <Card>
            <SectionTitle right={<Text variant="caption" color="textSubtle">30 jours</Text>}>Tendance calorique</SectionTitle>
            <Sparkline values={kcalSeries} width={300} height={80} color={colors.primary} />
          </Card>
        ) : null}

        {/* Objectifs */}
        <Card>
          <SectionTitle>Objectifs</SectionTitle>
          <GoalBar label="Calories" current={totals.kcal} target={kcalTarget} unit="kcal" color={colors.info} />
          <GoalBar label="Protéines" current={totals.proteinG} target={targets.value.proteinG} unit="g" color={colors.accentData} />
          <GoalBar label="Hydratation" current={totals.hydrationMl / 1000} target={targets.value.hydrationMl / 1000} unit="L" color={colors.accentEndurance} />
        </Card>

        {/* Micronutriments — honest */}
        <Card>
          <SectionTitle>Micronutriments</SectionTitle>
          <Text variant="body" color="textMuted" style={{ lineHeight: 21 }}>Le suivi détaillé (vitamines, fer, magnésium, oméga-3…) arrive bientôt. Il nécessite une base alimentaire enrichie (Open Food Facts) que nous intégrons.</Text>
        </Card>
      </Screen>
      <Fab icon="+" accessibilityLabel="Ajouter un aliment" onPress={() => router.push('/food/search')} />
    </View>
  );
}

function Balance({ label, value, color }: { label: string; value: string; color?: string }): React.JSX.Element {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text variant="caption" color="textSubtle">{label}</Text>
      <Text variant="body" style={{ fontWeight: '700', color, marginTop: 3 }}>{value}</Text>
    </View>
  );
}
