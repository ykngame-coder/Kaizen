import React, { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Card, Fab, FilterChip, Icon, Input, ProgressRing, Screen, Sparkline, Text, useTheme, type IconName } from '@supotsu/ui';
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
import type { HealthMetricType } from '@supotsu/core';
import { useAddNutritionEntry, useDeleteNutritionEntry, useHealthMetrics, useLeaderboardPrefs, useNutritionEntries, useRecordDailyScore } from '@/lib/data/queries';
import { useManualHealthKitSync } from '@/features/connectors/useHealthKitAutoSync';
import { CalorieCalculatorForm } from './CalorieCalculatorForm';
import { usePreferences } from '@/lib/preferences';
import { DayNav, useSelectedDay } from '@/features/navigation/DayNav';
import { ComprendreCard } from '@/features/knowledge/ComprendreCard';
import { isTodayLocal } from '@/features/community/leaderboardHelpers';

const DAY_MS = 86_400_000;
const dayKey = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function latestMetric(m: { type: HealthMetricType; value: number; measuredAt: string }[], type: HealthMetricType): number | undefined {
  return m.filter((x) => x.type === type).sort((a, b) => a.measuredAt.localeCompare(b.measuredAt)).at(-1)?.value;
}

const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
const WATER_PRESETS = [250, 500, 750];
const MEAL_ICON: Record<string, IconName> = { breakfast: 'bowl', lunch: 'drumstick', dinner: 'noodles', snack: 'apple' };

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

/**
 * A label + value with − / + steppers for adjusting a goal. The value is
 * also tappable — it turns into a numeric text field so an exact number can
 * be typed instead of only nudging by the fixed +/- step.
 */
function StepperRow({
  label,
  rawValue,
  format,
  onMinus,
  onPlus,
  onSet,
}: {
  label: string;
  rawValue: number;
  format: (v: number) => string;
  onMinus: () => void;
  onPlus: () => void;
  onSet: (v: number) => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const btn = { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, alignItems: 'center' as const, justifyContent: 'center' as const };
  const commit = (): void => {
    const n = Number(draft.replace(',', '.'));
    if (Number.isFinite(n) && n > 0) onSet(n);
    setEditing(false);
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing[3] }}>
      <Text variant="body" style={{ flex: 1 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        <Pressable onPress={onMinus} style={({ pressed }) => [btn, { opacity: pressed ? 0.6 : 1 }]}><Text variant="subtitle">−</Text></Pressable>
        {editing ? (
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={commit}
            onBlur={commit}
            keyboardType="decimal-pad"
            autoFocus
            selectTextOnFocus
            style={{ minWidth: 84, textAlign: 'center', fontWeight: '700', fontSize: 16, color: colors.text, padding: 0 }}
          />
        ) : (
          <Pressable onPress={() => { setDraft(String(rawValue)); setEditing(true); }}>
            <Text variant="body" style={{ fontWeight: '700', minWidth: 84, textAlign: 'center' }}>{format(rawValue)}</Text>
          </Pressable>
        )}
        <Pressable onPress={onPlus} style={({ pressed }) => [btn, { opacity: pressed ? 0.6 : 1 }]}><Text variant="subtitle">+</Text></Pressable>
      </View>
    </View>
  );
}

/** Nutrition (mockup #11) — kcal ring, macros, hydration, meals, score, trends, goals. */
export function NutritionScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { data: entries = [] } = useNutritionEntries();
  const { data: health = [] } = useHealthMetrics();
  const addEntry = useAddNutritionEntry();
  const deleteEntry = useDeleteNutritionEntry();
  const [selectedDate, setSelectedDate] = useSelectedDay();
  const asOf = selectedDate;

  const qc = useQueryClient();
  const syncHealth = useManualHealthKitSync();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async (): Promise<void> => { setRefreshing(true); await syncHealth(); await qc.invalidateQueries(); setRefreshing(false); };

  const addWater = (ml: number): void => {
    addEntry.mutate({ mealType: 'snack', description: t('nutrition.screen.water.entryLabel'), kcal: 0, hydrationMl: ml, source: 'manual', loggedAt: new Date().toISOString() });
  };
  const [waterAmount, setWaterAmount] = useState(250);
  const [customWater, setCustomWater] = useState('');

  const asOfMetrics = useMemo(() => health.filter((m) => new Date(m.measuredAt).getTime() <= new Date(asOf).getTime()), [health, asOf]);
  const latestWeight = useMemo(() => latestMetric(asOfMetrics, 'weight'), [asOfMetrics]);
  const bodyFat = useMemo(() => latestMetric(asOfMetrics, 'body_fat'), [asOfMetrics]);
  const muscleMass = useMemo(() => latestMetric(asOfMetrics, 'muscle_mass'), [asOfMetrics]);
  const weightDelta = useMemo(() => {
    const cutoff = new Date(asOf).getTime() - 7 * DAY_MS;
    const weekAgo = latestMetric(asOfMetrics.filter((m) => new Date(m.measuredAt).getTime() <= cutoff), 'weight');
    return latestWeight != null && weekAgo != null ? latestWeight - weekAgo : null;
  }, [asOfMetrics, latestWeight, asOf]);
  const { preferences, setPreference } = usePreferences();
  const targets = useMemo(() => estimateTargets({ weightKg: latestWeight }, asOf), [latestWeight, asOf]);
  const goals = preferences.nutritionGoals ?? targets.value;
  const customized = preferences.nutritionGoals != null;
  const adjust = (patch: Partial<{ kcal: number; proteinG: number; hydrationMl: number }>): void => {
    const base = preferences.nutritionGoals ?? { kcal: Math.round(goals.kcal), proteinG: Math.round(goals.proteinG), hydrationMl: Math.round(goals.hydrationMl) };
    setPreference('nutritionGoals', {
      kcal: Math.max(800, base.kcal + (patch.kcal ?? 0)),
      proteinG: Math.max(0, base.proteinG + (patch.proteinG ?? 0)),
      hydrationMl: Math.max(0, base.hydrationMl + (patch.hydrationMl ?? 0)),
    });
  };
  const setExact = (patch: Partial<{ kcal: number; proteinG: number; hydrationMl: number }>): void => {
    const base = preferences.nutritionGoals ?? { kcal: Math.round(goals.kcal), proteinG: Math.round(goals.proteinG), hydrationMl: Math.round(goals.hydrationMl) };
    setPreference('nutritionGoals', {
      kcal: patch.kcal != null ? Math.max(800, Math.round(patch.kcal)) : base.kcal,
      proteinG: patch.proteinG != null ? Math.max(0, Math.round(patch.proteinG)) : base.proteinG,
      hydrationMl: patch.hydrationMl != null ? Math.max(0, Math.round(patch.hydrationMl)) : base.hydrationMl,
    });
  };
  const totals = useMemo(() => sumDay(entries, asOf), [entries, asOf]);
  const today = useMemo(() => entriesForDay(entries, asOf), [entries, asOf]);
  const score = useMemo(() => computeNutritionScore(entries, goals, asOf), [entries, goals, asOf]);
  const { data: leaderboardPrefs } = useLeaderboardPrefs();
  const recordDailyScore = useRecordDailyScore();
  useEffect(() => {
    if (!leaderboardPrefs?.leaderboardOptIn) return;
    if (!isTodayLocal(asOf)) return;
    // "to_confirm" means there's no real data yet — don't publish a placeholder 0.
    if (score.confidence === 'to_confirm') return;
    if (!Number.isFinite(score.value)) return;
    recordDailyScore.mutate({ column: 'nutrition', value: Math.round(score.value) });
  }, [leaderboardPrefs?.leaderboardOptIn, asOf, score.confidence, score.value]);
  const explanation = useMemo(() => nutritionExplanation(entries, goals, asOf), [entries, goals, asOf]);
  const hasData = today.length > 0;

  const kcalTarget = goals.kcal;
  const remainingKcal = Math.max(0, kcalTarget - goals.proteinG * 4);
  const carbTarget = Math.round((remainingKcal * 0.55) / 4);
  const fatTarget = Math.round((remainingKcal * 0.45) / 9);
  const kcalPct = hasData && kcalTarget > 0 ? Math.min(100, (totals.kcal / kcalTarget) * 100) : 0;
  const remaining = Math.max(0, Math.round(kcalTarget - totals.kcal));

  // Meals grouped by type (selected day) — each type keeps its own logged
  // entries so every one of them can be tapped for detail / deleted, not
  // just shown as a single summed row.
  const meals = useMemo(() => {
    return MEAL_ORDER.map((type) => {
      const es = today.filter((e) => e.mealType === type);
      const kcal = es.reduce((s, e) => s + e.kcal, 0);
      return { type, count: es.length, kcal, entries: es };
    });
  }, [today]);

  // 30-day calorie trend.
  const kcalSeries = useMemo(() => {
    const pts: TrendPoint[] = entries.map((e) => ({ date: e.loggedAt, value: e.kcal }));
    return dailySums(pts, asOf, 30).filter((v) => v > 0);
  }, [entries, asOf]);

  return (
    <View style={{ flex: 1 }}>
      <Screen scroll onRefresh={onRefresh} refreshing={refreshing}>
        <View style={{ position: 'relative' }}>
          <View style={{ alignItems: 'center' }}>
            <Text variant="title">{t('common.tab.nutrition')}</Text>
            <Text variant="caption" color="textSubtle">{t('nutrition.screen.subtitle')}</Text>
          </View>
          <View style={{ position: 'absolute', right: 0, top: 0, flexDirection: 'row', gap: spacing[2] }}>
            <Pressable onPress={() => router.push('/sport/calendar')} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}><Icon name="calendar" size={16} color={colors.text} /></View>
            </Pressable>
            <Pressable onPress={() => router.push('/search')} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}><Icon name="search" size={16} color={colors.text} /></View>
            </Pressable>
          </View>
        </View>
        <DayNav value={selectedDate} onChange={setSelectedDate} />

        {/* Main kcal ring + balance */}
        <Card style={{ alignItems: 'center' }}>
          <ProgressRing value={kcalPct} size={168} thickness={12} gradient centerLabel={hasData ? `${Math.round(totals.kcal)}` : '—'} caption={t('nutrition.screen.kcalRing.target', { kcal: Math.round(kcalTarget) })} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', width: '100%', marginTop: spacing[4], paddingTop: spacing[4], borderTopWidth: 1, borderTopColor: colors.border }}>
            <Balance label={t('nutrition.screen.balance.remaining')} value={t('nutrition.screen.balance.remainingValue', { value: remaining })} color={colors.accentData} />
            <Balance label={t('nutrition.screen.balance.target')} value={`${Math.round(kcalTarget)}`} />
            <Balance label={t('nutrition.screen.balance.consumed')} value={`${Math.round(totals.kcal)}`} />
          </View>
        </Card>

        {/* Macros */}
        <Card>
          <SectionTitle>{t('nutrition.screen.macros.title')}</SectionTitle>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
            <MacroRing label={t('nutrition.screen.macros.protein')} current={totals.proteinG} target={goals.proteinG} color={colors.accentData} />
            <MacroRing label={t('nutrition.screen.macros.carbs')} current={totals.carbG} target={carbTarget} color={colors.warning} />
            <MacroRing label={t('nutrition.screen.macros.fat')} current={totals.fatG} target={fatTarget} color={colors.accentMobility} />
          </View>
        </Card>

        {/* Hydration */}
        <Card>
          <SectionTitle right={<Text variant="subtitle" style={{ color: colors.accentEndurance }}>{(Math.max(0, totals.hydrationMl) / 1000).toFixed(2)} / {(goals.hydrationMl / 1000).toFixed(2)} L</Text>}>{t('nutrition.screen.hydration.title')}</SectionTitle>
          <View style={{ height: 10, borderRadius: 6, backgroundColor: colors.surfaceElevated, overflow: 'hidden' }}>
            <View style={{ width: `${Math.max(0, Math.min(100, (totals.hydrationMl / goals.hydrationMl) * 100))}%`, height: 10, backgroundColor: colors.accentEndurance }} />
          </View>
          <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[3] }}>
            {WATER_PRESETS.map((ml) => (
              <FilterChip key={ml} label={`${ml} ml`} active={waterAmount === ml} onPress={() => setWaterAmount(ml)} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[2] }}>
            <View style={{ flex: 1 }}>
              <Button label={`− ${waterAmount} ml`} variant="secondary" fullWidth onPress={() => addWater(-waterAmount)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label={`+ ${waterAmount} ml`} fullWidth onPress={() => addWater(waterAmount)} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[2], alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <Input
                label={t('nutrition.screen.hydration.quantityLabel')}
                placeholder={t('nutrition.screen.hydration.quantityPlaceholder')}
                keyboardType="numeric"
                value={customWater}
                onChangeText={setCustomWater}
              />
            </View>
            <Button
              label={t('nutrition.screen.hydration.addButton')}
              variant="secondary"
              disabled={!customWater.trim() || Number(customWater) <= 0}
              onPress={() => {
                addWater(Number(customWater));
                setCustomWater('');
              }}
            />
          </View>
        </Card>

        {/* Repas */}
        <Card>
          <SectionTitle>{t('nutrition.screen.meals.title')}</SectionTitle>
          {meals.map((m, i) => (
            <View key={m.type} style={{ paddingVertical: spacing[2], borderBottomWidth: i < meals.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                <Text variant="caption" color="textSubtle" style={{ flex: 1, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 }}>{t(`nutrition.screen.meal.${m.type}`)}</Text>
                {m.count > 0 ? <Text variant="caption" color="textSubtle">{Math.round(m.kcal)} kcal</Text> : null}
              </View>
              {m.count > 0 ? (
                <View style={{ gap: spacing[2], marginTop: spacing[1] }}>
                  {m.entries.map((e) => (
                    <Pressable
                      key={e.id}
                      onPress={() => router.push({ pathname: '/nutrition/meal/[id]', params: { id: e.id } })}
                      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], borderRadius: radii.md, backgroundColor: colors.surfaceElevated, opacity: pressed ? 0.6 : 1 })}
                    >
                      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}><Icon name={MEAL_ICON[m.type] ?? 'bowl'} size={19} color={colors.text} /></View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text variant="body" style={{ fontWeight: '600' }} numberOfLines={1}>{e.description || t(`nutrition.screen.meal.${m.type}`)}</Text>
                        <Text variant="caption" color="textSubtle" style={{ marginTop: 2 }} numberOfLines={1}>P {Math.round(e.proteinG ?? 0)} · G {Math.round(e.carbG ?? 0)} · L {Math.round(e.fatG ?? 0)}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text variant="body" style={{ fontWeight: '700' }}>{Math.round(e.kcal)}</Text>
                        <Text variant="caption" color="textSubtle">kcal</Text>
                      </View>
                      <Pressable
                        onPress={() => deleteEntry.mutate(e.id)}
                        disabled={deleteEntry.isPending && deleteEntry.variables === e.id}
                        hitSlop={8}
                        style={{ opacity: deleteEntry.isPending && deleteEntry.variables === e.id ? 0.4 : 1 }}
                      >
                        <Icon name="trash" size={18} color={colors.textSubtle} />
                      </Pressable>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[2] }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}><Icon name={MEAL_ICON[m.type] ?? 'bowl'} size={19} color={colors.text} /></View>
                  <Text variant="caption" color="textSubtle" style={{ flex: 1 }}>{t('nutrition.screen.meals.toPlan')}</Text>
                  <Text variant="caption" color="textSubtle">{t('nutrition.screen.meals.pending')}</Text>
                </View>
              )}
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[3] }}>
            <View style={{ flex: 1 }}>
              <Button label={t('nutrition.screen.meals.searchFood')} onPress={() => router.push('/nutrition/food/search')} fullWidth />
            </View>
            <View style={{ flex: 1 }}>
              <Button label={t('nutrition.screen.meals.manualEntry')} variant="secondary" onPress={() => router.push({ pathname: '/nutrition/meal/new', params: { date: dayKey(selectedDate) } })} fullWidth />
            </View>
          </View>
        </Card>

        {/* Nutrition Score */}
        <Card>
          <SectionTitle>{t('nutrition.screen.score.title')}</SectionTitle>
          <View style={{ flexDirection: 'row', gap: spacing[5], alignItems: 'center' }}>
            <ProgressRing value={hasData ? score.value : 0} size={96} thickness={9} color={colors.accentData} centerLabel={hasData ? `${score.value}` : '—'} caption="/ 100" />
            <View style={{ flex: 1 }}>
              <Text variant="body">{hasData ? (score.value >= 80 ? t('nutrition.screen.score.quality.excellent') : score.value >= 60 ? t('nutrition.screen.score.quality.good') : t('nutrition.screen.score.quality.needsImprovement')) : t('nutrition.screen.score.quality.noData')}</Text>
              <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[2], lineHeight: 18 }}>{t('nutrition.screen.score.basedOn')}</Text>
            </View>
          </View>
        </Card>

        {/* Poids & composition */}
        <Card>
          <SectionTitle right={<Pressable onPress={() => router.push('/nutrition/weight')}><Text variant="caption" color="primary">{t('nutrition.screen.weight.viewLink')}</Text></Pressable>}>{t('nutrition.screen.weight.title')}</SectionTitle>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
            <Balance label={t('nutrition.screen.weight.weight')} value={latestWeight != null ? `${latestWeight.toFixed(1)} kg` : '—'} />
            <Balance label={t('nutrition.screen.weight.bodyFat')} value={bodyFat != null ? `${bodyFat.toFixed(1)} %` : '—'} />
            <Balance label={t('nutrition.screen.weight.muscleMass')} value={muscleMass != null ? `${muscleMass.toFixed(1)} kg` : '—'} />
            <Balance
              label={t('nutrition.screen.weight.weeklyChange')}
              value={weightDelta != null ? `${weightDelta > 0 ? '+' : ''}${weightDelta.toFixed(1)} kg` : '—'}
              color={weightDelta != null && weightDelta <= 0 ? colors.accentData : undefined}
            />
          </View>
        </Card>

        {/* Impact */}
        {explanation ? (
          <Card>
            <SectionTitle>{t('nutrition.screen.impact.title')}</SectionTitle>
            <Text variant="body" color="textMuted">{t(explanation.observation.key, explanation.observation.params)}</Text>
            <Text variant="body" color="textMuted" style={{ marginTop: spacing[1] }}>{t(explanation.analysis.key, explanation.analysis.params)}</Text>
            <Text variant="body" style={{ marginTop: spacing[2] }}>{t(explanation.action.key, explanation.action.params)}</Text>
          </Card>
        ) : null}

        {/* Tendances */}
        {kcalSeries.length >= 2 ? (
          <Card>
            <SectionTitle right={<Text variant="caption" color="textSubtle">{t('nutrition.screen.trend.days30')}</Text>}>{t('nutrition.screen.trend.title')}</SectionTitle>
            <Sparkline values={kcalSeries} width={300} height={80} color={colors.primary} />
          </Card>
        ) : null}

        {/* Objectifs */}
        <Card>
          <SectionTitle right={
            <Pressable onPress={() => setPreference('nutritionGoals', undefined)} disabled={!customized}>
              <Text variant="caption" color={customized ? 'primary' : 'textSubtle'}>{customized ? t('nutrition.screen.goals.resetAuto') : t('nutrition.screen.goals.auto')}</Text>
            </Pressable>
          }>{t('nutrition.screen.goals.title')}</SectionTitle>
          <GoalBar label={t('nutrition.screen.goals.caloriesLabel')} current={totals.kcal} target={kcalTarget} unit="kcal" color={colors.info} />
          <GoalBar label={t('nutrition.screen.goals.proteinLabel')} current={totals.proteinG} target={goals.proteinG} unit="g" color={colors.accentData} />
          <GoalBar label={t('nutrition.screen.goals.hydrationLabel')} current={totals.hydrationMl / 1000} target={goals.hydrationMl / 1000} unit="L" color={colors.accentEndurance} />

          <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[4] }}>{customized ? t('nutrition.screen.goals.adjustHintPerso') : t('nutrition.screen.goals.adjustHintAuto')}</Text>
          <StepperRow
            label={t('nutrition.screen.goals.caloriesLabel')}
            rawValue={Math.round(goals.kcal)}
            format={(v) => `${Math.round(v)} kcal`}
            onMinus={() => adjust({ kcal: -50 })}
            onPlus={() => adjust({ kcal: 50 })}
            onSet={(v) => setExact({ kcal: v })}
          />
          <StepperRow
            label={t('nutrition.screen.goals.proteinLabel')}
            rawValue={Math.round(goals.proteinG)}
            format={(v) => `${Math.round(v)} g`}
            onMinus={() => adjust({ proteinG: -5 })}
            onPlus={() => adjust({ proteinG: 5 })}
            onSet={(v) => setExact({ proteinG: v })}
          />
          <StepperRow
            label={t('nutrition.screen.goals.hydrationLabel')}
            rawValue={Number((goals.hydrationMl / 1000).toFixed(2))}
            format={(v) => `${v.toFixed(2)} L`}
            onMinus={() => adjust({ hydrationMl: -250 })}
            onPlus={() => adjust({ hydrationMl: 250 })}
            onSet={(v) => setExact({ hydrationMl: v * 1000 })}
          />

          <CalorieCalculatorForm />
        </Card>

        {/* Micronutriments — honest */}
        <Card>
          <SectionTitle>{t('nutrition.screen.micronutrients.title')}</SectionTitle>
          <Text variant="body" color="textMuted" style={{ lineHeight: 21 }}>{t('nutrition.screen.micronutrients.description')}</Text>
        </Card>

        <ComprendreCard pillars={['nutrition']} />
      </Screen>
      <Fab icon="+" accessibilityLabel={t('nutrition.screen.fab.addFood')} onPress={() => router.push({ pathname: '/nutrition/meal/new', params: { date: dayKey(selectedDate) } })} />
    </View>
  );
}

function Balance({ label, value, color }: { label: string; value: string; color?: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center' }}>
      <Text variant="caption" color="textSubtle">{label}</Text>
      <Text variant="body" style={{ fontWeight: '700', color: color ?? colors.text, marginTop: 3 }}>{value}</Text>
    </View>
  );
}
