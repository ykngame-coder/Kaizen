import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Card, Fab, ProgressRing, Screen, Sparkline, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { dailySums, entriesForDay, estimateTargets, sumDay, type TrendPoint } from '@supotsu/engines';
import { useAddNutritionEntry, useHealthMetrics, useNutritionEntries } from '@/lib/data/queries';

const DAY_MS = 86_400_000;
const MEAL_ICON: Record<string, string> = { breakfast: '🥣', lunch: '🍗', dinner: '🍝', snack: '🍎' };
const MEAL_LABEL: Record<string, string> = { breakfast: 'Petit-déjeuner', lunch: 'Déjeuner', dinner: 'Dîner', snack: 'Collation' };
const hhmm = (iso: string): string => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }): React.JSX.Element {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: spacing[3] }}>
      <Text variant="heading">{children}</Text>
      {right}
    </View>
  );
}
function Kpi({ icon, value, unit, label, color }: { icon: string; value: string; unit?: string; label: string; color?: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ flexGrow: 1, flexBasis: '45%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing[4] }}>
      <Text style={{ fontSize: 17 }}>{icon}</Text>
      <Text variant="subtitle" style={{ marginTop: spacing[2], color: color ?? colors.text }}>{value}{unit ? <Text variant="caption" color="textSubtle"> {unit}</Text> : null}</Text>
      <Text variant="caption" color="textSubtle" style={{ marginTop: 2 }}>{label}</Text>
    </View>
  );
}
function MacroBar({ label, current, target, color }: { label: string; current: number; target: number; color: string }): React.JSX.Element {
  const { colors } = useTheme();
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  return (
    <View style={{ marginBottom: spacing[3] }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="caption" style={{ color }}>{label}</Text>
        <Text variant="caption" color="textMuted">{Math.round(current)} / {Math.round(target)} g · {pct} %</Text>
      </View>
      <View style={{ height: 9, borderRadius: 6, backgroundColor: colors.surfaceElevated, overflow: 'hidden', marginTop: 6 }}><View style={{ width: `${pct}%`, height: 9, backgroundColor: color }} /></View>
    </View>
  );
}

/** Journal & déficit calorique (mockup #12) — real calorie balance, deficit trend, meals. */
export function JournalScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { data: entries = [] } = useNutritionEntries();
  const { data: health = [] } = useHealthMetrics();
  const addEntry = useAddNutritionEntry();
  const now = new Date();
  const asOf = now.toISOString();

  const weight = useMemo(() => health.filter((m) => m.type === 'weight').sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0]?.value, [health]);
  const targets = useMemo(() => estimateTargets({ weightKg: weight }, asOf).value, [weight, asOf]);
  const totals = useMemo(() => sumDay(entries, asOf), [entries, asOf]);
  const today = useMemo(() => entriesForDay(entries, asOf), [entries, asOf]);
  const hasData = today.length > 0;

  const kcalTarget = targets.kcal;
  const remainingKcal = Math.max(0, kcalTarget - targets.proteinG * 4);
  const carbTarget = Math.round((remainingKcal * 0.55) / 4);
  const fatTarget = Math.round((remainingKcal * 0.45) / 9);
  const kcalPct = hasData && kcalTarget > 0 ? Math.min(100, (totals.kcal / kcalTarget) * 100) : 0;
  const deficit = Math.round(kcalTarget - totals.kcal);

  // Calorie histogram + deficit series (14 days).
  const { kcalBars, deficitSeries, defStats } = useMemo(() => {
    const pts: TrendPoint[] = entries.map((e) => ({ date: e.loggedAt, value: e.kcal }));
    const bars = dailySums(pts, asOf, 14);
    const deficits: number[] = [];
    for (let i = 13; i >= 0; i -= 1) {
      const d = new Date(now.getTime() - i * DAY_MS).toISOString();
      const dayTotal = sumDay(entries, d).kcal;
      if (dayTotal > 0) deficits.push(kcalTarget - dayTotal);
    }
    const stat = deficits.length ? { avg: Math.round(deficits.reduce((s, v) => s + v, 0) / deficits.length), max: Math.round(Math.max(...deficits)), min: Math.round(Math.min(...deficits)) } : null;
    return { kcalBars: bars, deficitSeries: deficits, defStats: stat };
  }, [entries, asOf, now, kcalTarget]);
  const barMax = Math.max(1, kcalTarget, ...kcalBars);

  // Macro split of consumed calories.
  const macroKcal = { p: totals.proteinG * 4, c: totals.carbG * 4, f: totals.fatG * 9 };
  const macroTotal = macroKcal.p + macroKcal.c + macroKcal.f || 1;

  const addWater = (ml: number): void => addEntry.mutate({ mealType: 'snack', description: 'Eau', kcal: 0, hydrationMl: ml, source: 'manual', loggedAt: new Date().toISOString() });

  return (
    <View style={{ flex: 1 }}>
      <Screen scroll>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View>
            <Text variant="title">Journal & déficit</Text>
            <Text variant="caption" color="textSubtle">Calories • Macros • Déficit</Text>
          </View>
          {hasData ? <Badge label={`${deficit >= 0 ? 'Déficit' : 'Surplus'} ${Math.abs(deficit)} kcal`} tone={deficit >= 0 ? 'success' : 'warning'} /> : null}
        </View>

        {/* KPI */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] }}>
          <Kpi icon="🍽" value={`${Math.round(totals.kcal)}`} unit="kcal" label="Consommées" />
          <Kpi icon="🎯" value={`${Math.round(kcalTarget)}`} unit="kcal" label="Objectif" />
          <Kpi icon="📉" value={hasData ? `${deficit}` : '—'} unit="kcal" label="Déficit" color={colors.accentData} />
          <Kpi icon="🥩" value={`${Math.round(totals.proteinG)}`} unit="g" label="Protéines" />
        </View>

        {/* Ring + macros */}
        <Card>
          <SectionTitle>Calories du jour</SectionTitle>
          <View style={{ flexDirection: 'row', gap: spacing[4], alignItems: 'center' }}>
            <ProgressRing value={kcalPct} size={128} thickness={11} gradient centerLabel={hasData ? `${Math.round(totals.kcal)}` : '—'} caption={`/ ${Math.round(kcalTarget)}`} />
            <View style={{ flex: 1 }}>
              <MacroBar label="Protéines" current={totals.proteinG} target={targets.proteinG} color={colors.accentData} />
              <MacroBar label="Glucides" current={totals.carbG} target={carbTarget} color={colors.warning} />
              <MacroBar label="Lipides" current={totals.fatG} target={fatTarget} color={colors.accentStrength} />
            </View>
          </View>
        </Card>

        {/* Histogram 14j */}
        {kcalBars.some((v) => v > 0) ? (
          <Card>
            <SectionTitle right={<Text variant="caption" color="textSubtle">14 jours</Text>}>Calories</SectionTitle>
            <View style={{ height: 110, position: 'relative', justifyContent: 'flex-end' }}>
              <View style={{ position: 'absolute', left: 0, right: 0, bottom: (kcalTarget / barMax) * 110, borderTopWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.3)' }} />
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: 110 }}>
                {kcalBars.map((v, i) => (<View key={i} style={{ flex: 1, height: Math.max(3, (v / barMax) * 110), borderRadius: 4, backgroundColor: v > 0 ? colors.warning : colors.surfaceElevated }} />))}
              </View>
            </View>
            <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[2], textAlign: 'right' }}>Ligne = objectif {Math.round(kcalTarget)} kcal</Text>
          </Card>
        ) : null}

        {/* Deficit curve */}
        {deficitSeries.length >= 2 && defStats ? (
          <Card>
            <SectionTitle>Déficit calorique</SectionTitle>
            <Sparkline values={deficitSeries} width={300} height={70} color={colors.accentData} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: spacing[3], paddingTop: spacing[3], borderTopWidth: 1, borderTopColor: colors.border }}>
              <DefStat label="Moyen" value={`${defStats.avg} kcal`} />
              <DefStat label="Maximal" value={`${defStats.max} kcal`} />
              <DefStat label="Minimal" value={`${defStats.min} kcal`} />
            </View>
          </Card>
        ) : null}

        {/* Répartition */}
        {hasData ? (
          <Card>
            <SectionTitle>Répartition calorique</SectionTitle>
            <View style={{ flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden' }}>
              <View style={{ flex: macroKcal.p, backgroundColor: colors.accentData }} />
              <View style={{ flex: macroKcal.c, backgroundColor: colors.warning }} />
              <View style={{ flex: macroKcal.f, backgroundColor: colors.accentStrength }} />
            </View>
            <View style={{ marginTop: spacing[3], gap: spacing[2] }}>
              <Legend color={colors.accentData} label="Protéines" pct={Math.round((macroKcal.p / macroTotal) * 100)} />
              <Legend color={colors.warning} label="Glucides" pct={Math.round((macroKcal.c / macroTotal) * 100)} />
              <Legend color={colors.accentStrength} label="Lipides" pct={Math.round((macroKcal.f / macroTotal) * 100)} />
            </View>
          </Card>
        ) : null}

        {/* Derniers repas */}
        {hasData ? (
          <Card>
            <SectionTitle>Derniers repas</SectionTitle>
            {[...today].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt)).slice(0, 6).map((e) => (
              <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3], borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 19 }}>{MEAL_ICON[e.mealType] ?? '🍽'}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text variant="body" style={{ fontWeight: '600' }}>{e.description || MEAL_LABEL[e.mealType]}</Text>
                  <Text variant="caption" color="textSubtle">P {Math.round(e.proteinG ?? 0)} · G {Math.round(e.carbG ?? 0)} · L {Math.round(e.fatG ?? 0)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="body" style={{ fontWeight: '700' }}>{Math.round(e.kcal)}</Text>
                  <Text variant="caption" color="textSubtle">{hhmm(e.loggedAt)}</Text>
                </View>
              </View>
            ))}
          </Card>
        ) : (
          <Card><Text variant="body" color="textMuted">Aucun repas enregistré aujourd'hui. Ajoute un aliment pour suivre ton déficit.</Text></Card>
        )}

        {/* Analyse */}
        {hasData ? (
          <View style={{ borderRadius: radii.xl, borderWidth: 1, borderColor: 'rgba(43,227,139,0.25)', backgroundColor: 'rgba(43,227,139,0.08)', padding: spacing[5] }}>
            <View style={{ flexDirection: 'row', gap: spacing[2], alignItems: 'center' }}><Text style={{ fontSize: 20 }}>💡</Text><Text variant="heading">Analyse & conseils</Text></View>
            <Text variant="body" color="textMuted" style={{ marginTop: spacing[2], lineHeight: 22 }}>
              {deficit > 200 ? `Déficit de ${deficit} kcal — cohérent avec un objectif de perte de graisse. ` : deficit >= 0 ? 'Léger déficit — proche de l’équilibre. ' : `Surplus de ${Math.abs(deficit)} kcal aujourd’hui. `}
              {totals.proteinG >= targets.proteinG * 0.9 ? 'Tes protéines sont au bon niveau.' : `Il te manque ${Math.round(targets.proteinG - totals.proteinG)} g de protéines.`}
            </Text>
          </View>
        ) : null}

        {/* Hydratation */}
        <Card>
          <SectionTitle right={<Text variant="subtitle" style={{ color: colors.accentEndurance }}>{(totals.hydrationMl / 1000).toFixed(1)} / {(targets.hydrationMl / 1000).toFixed(1)} L</Text>}>Hydratation</SectionTitle>
          <View style={{ height: 12, borderRadius: 8, backgroundColor: colors.surfaceElevated, overflow: 'hidden' }}><View style={{ width: `${Math.min(100, (totals.hydrationMl / targets.hydrationMl) * 100)}%`, height: 12, backgroundColor: colors.accentEndurance }} /></View>
          <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[3] }}>
            {[250, 500, 1000].map((ml) => (<Button key={ml} label={`+${ml >= 1000 ? '1 L' : `${ml} ml`}`} variant="secondary" onPress={() => addWater(ml)} />))}
          </View>
        </Card>
      </Screen>
      <Fab icon="+" accessibilityLabel="Ajouter un aliment" onPress={() => router.push('/food/search')} />
    </View>
  );
}

function DefStat({ label, value }: { label: string; value: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center' }}>
      <Text variant="caption" color="textSubtle">{label}</Text>
      <Text variant="body" style={{ fontWeight: '700', color: colors.accentData, marginTop: 2 }}>{value}</Text>
    </View>
  );
}
function Legend({ color, label, pct }: { color: string; label: string; pct: number }): React.JSX.Element {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }} />
      <Text variant="body" style={{ flex: 1 }}>{label}</Text>
      <Text variant="caption" color="textMuted">{pct} %</Text>
    </View>
  );
}
