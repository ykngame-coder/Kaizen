import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Card, Fab, Gradient, ProgressRing, Screen, Sparkline, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { HealthMetricType } from '@supotsu/core';
import {
  badgeDefinition,
  computeAcwr,
  computeRecoveryScore,
  computeStreak,
  estimateTargets,
  evaluateBadges,
  recoveryBand,
  sleepTrend,
  sumDay,
  weightTrend,
} from '@supotsu/engines';
import { useActivities, useHabitLogs, useHabits, useHealthMetrics, useNutritionEntries, usePlannedWorkouts } from '@/lib/data/queries';
import { useAuth } from '@/features/auth/AuthProvider';
import { MuscleBody } from '@/features/muscles/MuscleBody';

const DAY_MS = 86_400_000;

/** "Aujourd'hui" / "Demain" / "Lun. 12 août" from a planned_for date. */
function planLabel(plannedFor?: string): string {
  if (!plannedFor) return 'Date à définir';
  const key = plannedFor.slice(0, 10);
  const todayKey = new Date().toISOString().slice(0, 10);
  if (key === todayKey) return "Aujourd'hui";
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (key === tomorrow.toISOString().slice(0, 10)) return 'Demain';
  return date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

const BAND_INFO: Record<string, { label: string; advice: string }> = {
  excellent: { label: 'Excellent', advice: 'Ta récupération est excellente. Journée idéale pour une séance intensive.' },
  correct: { label: 'Bon', advice: 'Bonne récupération. Une séance de qualité est à ta portée aujourd’hui.' },
  moyen: { label: 'Moyen', advice: 'Récupération partielle — modère l’intensité et soigne ton sommeil ce soir.' },
  faible: { label: 'Faible', advice: 'Récupération faible — privilégie le repos, la mobilité ou une marche.' },
};

const FR_DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const FR_DAYS_SHORT = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const FR_MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const longDate = (d: Date): string => `${FR_DAYS[d.getDay()]!.charAt(0).toUpperCase()}${FR_DAYS[d.getDay()]!.slice(1)} ${d.getDate()} ${FR_MONTHS[d.getMonth()]}`;
const dayKey = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function fmtSleep(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h} h ${String(m).padStart(2, '0')}`;
}
function greetingName(email: string | undefined): string {
  const handle = (email ?? '').split('@')[0] ?? '';
  const cleaned = handle.replace(/[._-]+/g, ' ').trim().split(' ')[0] ?? '';
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : '';
}
function latestMetric(m: { type: HealthMetricType; value: number; measuredAt: string }[], type: HealthMetricType): number | undefined {
  return m.filter((x) => x.type === type).sort((a, b) => a.measuredAt.localeCompare(b.measuredAt)).at(-1)?.value;
}

/* ---------- small presentational pieces ---------- */

function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }): React.JSX.Element {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: spacing[3] }}>
      <Text variant="heading">{children}</Text>
      {right}
    </View>
  );
}

function KpiTile({ icon, value, delta, deltaTone, label }: { icon: string; value: string; delta?: string; deltaTone?: 'up' | 'down' | 'muted'; label: string }): React.JSX.Element {
  const { colors } = useTheme();
  const dColor = deltaTone === 'up' ? colors.accentData : deltaTone === 'down' ? colors.error : colors.textSubtle;
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing[3] }}>
      <Text style={{ fontSize: 15 }}>{icon}</Text>
      <Text variant="subtitle" style={{ marginTop: spacing[1], letterSpacing: -0.4 }}>{value}</Text>
      {delta ? <Text variant="caption" style={{ color: dColor, marginTop: 2, fontWeight: '600' }}>{delta}</Text> : null}
      <Text variant="caption" color="textSubtle" style={{ marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function CheckRow({ done, label, last }: { done: boolean; label: string; last?: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3], borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border }}>
      <View style={{ width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? colors.accentData : 'transparent', borderWidth: done ? 0 : 2, borderColor: colors.textSubtle }}>
        {done ? <Text style={{ color: '#04140b', fontSize: 12, fontWeight: '800' }}>✓</Text> : null}
      </View>
      <Text variant="body" style={{ flex: 1, color: done ? colors.textSubtle : colors.text }}>{label}</Text>
    </View>
  );
}

function TrendCard({ label, value, up, series, color }: { label: string; value: string; up: boolean; series: number[]; color: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ width: 118, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing[3] }}>
      <Text variant="caption" color="textSubtle">{label}</Text>
      <Text variant="subtitle" style={{ color: up ? colors.accentData : colors.error, marginTop: 2 }}>{value}</Text>
      {series.length >= 2 ? <View style={{ marginTop: spacing[2] }}><Sparkline values={series} width={92} height={30} color={color} /></View> : null}
    </View>
  );
}

/* ---------- screen ---------- */

export function DashboardScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { data: activities = [] } = useActivities();
  const { data: health = [] } = useHealthMetrics();
  const { data: nutrition = [] } = useNutritionEntries();
  const { data: habits = [] } = useHabits();
  const { data: habitLogs = [] } = useHabitLogs();
  const { data: planned = [] } = usePlannedWorkouts();
  const asOf = useMemo(() => new Date().toISOString(), []);
  const now = useMemo(() => new Date(asOf), [asOf]);

  const nextPlanned = useMemo(() => {
    const todayKey = new Date().toISOString().slice(0, 10);
    return [...planned]
      .filter((w) => (w.plannedFor ?? '').slice(0, 10) >= todayKey)
      .sort((a, b) => (a.plannedFor ?? '').localeCompare(b.plannedFor ?? ''))[0];
  }, [planned]);

  const recovery = useMemo(() => {
    const today = computeRecoveryScore(health, asOf);
    if (today.confidence === 'to_confirm') return null;
    return { value: today.value, band: recoveryBand(today.value) };
  }, [health, asOf]);

  const nights = useMemo(() => [...sleepTrend(health, asOf, 7)].sort((a, b) => a.date.localeCompare(b.date)), [health, asOf]);
  const lastNight = nights.at(-1);
  const prevNight = nights.at(-2);
  const sleepDelta = lastNight && prevNight ? Math.round((lastNight.hours - prevNight.hours) * 60) : null;

  const acwr = useMemo(() => computeAcwr(activities, asOf), [activities, asOf]);
  const hrv = latestMetric(health, 'hrv');
  const rhr = latestMetric(health, 'resting_heart_rate');
  const weight = latestMetric(health, 'weight');
  const bodyFat = latestMetric(health, 'body_fat');
  const muscleMass = latestMetric(health, 'muscle_mass');
  const weekAgoWeight = useMemo(() => {
    const cutoff = now.getTime() - 7 * DAY_MS;
    return health.filter((m) => m.type === 'weight' && new Date(m.measuredAt).getTime() <= cutoff).sort((a, b) => a.measuredAt.localeCompare(b.measuredAt)).at(-1)?.value;
  }, [health, now]);
  const weightDelta = weight != null && weekAgoWeight != null ? weight - weekAgoWeight : null;

  const targets = useMemo(() => estimateTargets({ weightKg: weight }, asOf).value, [weight, asOf]);
  const totals = useMemo(() => sumDay(nutrition, asOf), [nutrition, asOf]);
  const kcalPct = targets.kcal > 0 ? Math.min(100, (totals.kcal / targets.kcal) * 100) : 0;
  const deficit = Math.round(targets.kcal - totals.kcal);
  const proteinLeft = Math.max(0, Math.round(targets.proteinG - totals.proteinG));
  const waterLeftMl = Math.max(0, Math.round(targets.hydrationMl - totals.hydrationMl));

  // Day-state
  const energie = recovery ? (recovery.value >= 70 ? { t: 'Élevée', c: colors.accentData } : recovery.value >= 50 ? { t: 'Moyenne', c: colors.warning } : { t: 'Basse', c: colors.error }) : null;
  const fatigue = recovery ? (recovery.value >= 70 ? { t: 'Faible', c: colors.accentData } : recovery.value >= 50 ? { t: 'Modérée', c: colors.warning } : { t: 'Élevée', c: colors.error }) : null;
  const LOAD: Record<string, { t: string; c: string }> = {
    'sous-charge': { t: 'Sous-charge', c: colors.info }, optimal: { t: 'Optimale', c: colors.accentData }, 'élevé': { t: 'Élevée', c: colors.warning }, risque: { t: 'Risque', c: colors.error },
  };
  const chargeState = acwr.zone ? LOAD[acwr.zone] : null;

  // Habits (today + streak + week)
  const todayK = dayKey(now);
  const doneToday = useMemo(() => new Set(habitLogs.filter((l) => dayKey(new Date(l.completedAt)) === todayK).map((l) => l.habitId)), [habitLogs, todayK]);
  const activeHabits = habits.filter((h) => !h.archivedAt);
  const pendingHabits = activeHabits.filter((h) => !doneToday.has(h.id));
  const streak = useMemo(() => computeStreak(activities, asOf).value, [activities, asOf]);
  const weekDays = useMemo(() => {
    const logDays = new Set(habitLogs.map((l) => dayKey(new Date(l.completedAt))));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now.getTime() - (6 - i) * DAY_MS);
      return { label: FR_DAYS_SHORT[d.getDay()]!, done: logDays.has(dayKey(d)), today: dayKey(d) === todayK };
    });
  }, [habitLogs, now, todayK]);

  // Trends
  const weightSeries = useMemo(() => weightTrend(health, asOf, 30).map((p) => p.value), [health, asOf]);
  const hrvSeries = useMemo(() => health.filter((m) => m.type === 'hrv').sort((a, b) => a.measuredAt.localeCompare(b.measuredAt)).slice(-14).map((m) => m.value), [health]);
  const recoverySeries = useMemo(() => {
    const out: number[] = [];
    for (let i = 6; i >= 0; i -= 1) {
      const r = computeRecoveryScore(health, new Date(now.getTime() - i * DAY_MS).toISOString());
      if (r.confidence !== 'to_confirm') out.push(r.value);
    }
    return out;
  }, [health, now]);

  // Badges
  const badges = useMemo(() => evaluateBadges({ activities, nutritionEntries: nutrition, targets, asOf }).slice(-6).reverse(), [activities, nutrition, targets, asOf]);

  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async (): Promise<void> => { setRefreshing(true); await qc.invalidateQueries(); setRefreshing(false); };

  const firstName = greetingName(user?.email);
  const initial = (firstName || user?.email || 'K').charAt(0).toUpperCase();
  const focusMsg = recovery ? BAND_INFO[recovery.band]?.advice ?? '' : 'Importe tes données de santé pour débloquer ton focus du jour.';

  const priorities = [
    { done: waterLeftMl <= 0, label: waterLeftMl > 0 ? `Boire encore ${(waterLeftMl / 1000).toFixed(1)} L d'eau` : 'Hydratation atteinte' },
    { done: proteinLeft <= 0, label: proteinLeft > 0 ? `Atteindre ${Math.round(targets.proteinG)} g de protéines (${proteinLeft} g restants)` : 'Protéines atteintes' },
    { done: pendingHabits.length === 0 && activeHabits.length > 0, label: activeHabits.length === 0 ? 'Ajouter une habitude à suivre' : pendingHabits.length === 0 ? 'Toutes les habitudes validées' : `Valider ${pendingHabits.length} habitude${pendingHabits.length > 1 ? 's' : ''}` },
    { done: !!lastNight && lastNight.hours >= 7.75, label: lastNight ? `Sommeil ${fmtSleep(lastNight.hours)} (cible 7 h 45)` : 'Enregistrer ta nuit' },
  ];

  return (
    <View style={{ flex: 1 }}>
      <Screen scroll onRefresh={onRefresh} refreshing={refreshing}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text variant="title">Bonjour{firstName ? ` ${firstName}` : ''}</Text>
            <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>L&apos;excellence se construit aujourd&apos;hui.</Text>
            <Text variant="caption" color="textSubtle" style={{ marginTop: 8 }}>{longDate(now)}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing[2] }}>
            <IconBtn icon="🔍" onPress={() => router.push('/search')} />
            <IconBtn icon="🔔" onPress={() => router.push('/profile/notifications')} />
            <Pressable onPress={() => router.push('/profile')}>
              <View style={{ width: 38, height: 38, borderRadius: 19, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                <Gradient fill />
                <Text variant="body" color="onPrimary" style={{ fontWeight: '700' }}>{initial}</Text>
              </View>
            </Pressable>
          </View>
        </View>

        {/* Focus du jour */}
        <Gradient style={{ borderRadius: radii.xl, padding: 1.5 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: radii.xl - 1.5, padding: spacing[5], flexDirection: 'row', gap: spacing[4], alignItems: 'center' }}>
            <Text style={{ fontSize: 34 }}>🏋️</Text>
            <View style={{ flex: 1 }}>
              <Text variant="caption" color="primary" style={{ letterSpacing: 1.4, fontWeight: '700', textTransform: 'uppercase' }}>Focus du jour</Text>
              <Text variant="body" style={{ fontWeight: '600', marginTop: 4, lineHeight: 21 }}>{focusMsg}</Text>
            </View>
          </View>
        </Gradient>

        {/* État du jour */}
        <Card>
          <Text variant="heading">État du jour</Text>
          <View style={{ flexDirection: 'row', gap: spacing[5], alignItems: 'center', marginTop: spacing[3] }}>
            <ProgressRing value={recovery?.value ?? 0} size={104} thickness={10} gradient centerLabel={recovery ? `${recovery.value}` : '—'} caption="Recovery" />
            <View style={{ flex: 1, gap: spacing[3] }}>
              <StateRow label="Énergie" value={energie?.t ?? '—'} color={energie?.c} />
              <StateRow label="Charge" value={chargeState?.t ?? 'À calibrer'} color={chargeState?.c} />
              <StateRow label="Fatigue" value={fatigue?.t ?? '—'} color={fatigue?.c} />
            </View>
          </View>
          <View style={{ marginTop: spacing[4], paddingTop: spacing[3], borderTopWidth: 1, borderTopColor: colors.border }}>
            <Text variant="caption" color="textMuted" style={{ lineHeight: 20 }}>{recovery ? BAND_INFO[recovery.band]?.advice : 'Aucune donnée de récupération pour aujourd’hui.'}</Text>
          </View>
        </Card>

        {/* KPI 3×2 */}
        <View style={{ gap: spacing[3] }}>
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <KpiTile icon="💤" value={lastNight ? fmtSleep(lastNight.hours) : '—'} delta={sleepDelta != null ? `${sleepDelta >= 0 ? '▲ +' : '▼ '}${Math.abs(sleepDelta)} min` : undefined} deltaTone={sleepDelta != null && sleepDelta >= 0 ? 'up' : 'down'} label="Sommeil" />
            <KpiTile icon="📈" value={hrv != null ? `${Math.round(hrv)} ms` : '—'} label="HRV" />
            <KpiTile icon="❤️" value={rhr != null ? `${Math.round(rhr)}` : '—'} label="FC repos" />
          </View>
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <KpiTile icon="⚖" value={weight != null ? weight.toFixed(1) : '—'} delta={weightDelta != null ? `${weightDelta <= 0 ? '▼ ' : '▲ +'}${Math.abs(weightDelta).toFixed(1)}` : undefined} deltaTone={weightDelta != null && weightDelta <= 0 ? 'up' : 'down'} label="Poids (kg)" />
            <KpiTile icon="📉" value={nutrition.length > 0 ? `${deficit}` : '—'} label="Déficit kcal" />
            <KpiTile icon="💧" value={`${(totals.hydrationMl / 1000).toFixed(1)}`} label={`/ ${(targets.hydrationMl / 1000).toFixed(1)} L`} />
          </View>
        </View>

        {/* Priorités du jour */}
        <Card>
          <SectionTitle>Priorités du jour</SectionTitle>
          {priorities.map((p, i) => (<CheckRow key={i} done={p.done} label={p.label} last={i === priorities.length - 1} />))}
        </Card>

        {/* Prochaine séance */}
        <Card>
          <SectionTitle right={<Pressable onPress={() => router.push('/sport/planning')}><Text variant="caption" color="primary">Planning ›</Text></Pressable>}>Prochaine séance</SectionTitle>
          <View style={{ flexDirection: 'row', gap: spacing[4], alignItems: 'center' }}>
            <View style={{ width: 64, height: 64, borderRadius: radii.lg, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 28 }}>🏋️</Text></View>
            <View style={{ flex: 1 }}>
              {nextPlanned ? (
                <>
                  <Text variant="body" style={{ fontWeight: '700' }}>{nextPlanned.name}</Text>
                  <Text variant="caption" color="textSubtle" style={{ marginTop: 2 }}>{planLabel(nextPlanned.plannedFor)}{nextPlanned.notes ? ` · ${nextPlanned.notes}` : ''}</Text>
                </>
              ) : (
                <>
                  <Text variant="body" style={{ fontWeight: '700' }}>Planifie ta prochaine séance</Text>
                  <Text variant="caption" color="textSubtle" style={{ marginTop: 2 }}>{chargeState ? `Charge ${chargeState.t.toLowerCase()} · adapte l'intensité` : 'Choisis un focus selon ta récupération'}</Text>
                </>
              )}
            </View>
          </View>
          <Pressable onPress={() => router.push(nextPlanned ? '/sport/planning' : '/sport/workout/new')} style={({ pressed }) => ({ marginTop: spacing[3], height: 46, borderRadius: radii.xl, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.98 : 1 }] })}>
            <Text variant="body" style={{ fontWeight: '600' }}>{nextPlanned ? 'Voir le planning ›' : 'Créer une séance ›'}</Text>
          </Pressable>
        </Card>

        {/* Corps & récupération */}
        <Card>
          <SectionTitle right={<Pressable onPress={() => router.push('/sport/muscles')}><Text variant="caption" color="primary">Voir ›</Text></Pressable>}>Corps & récupération</SectionTitle>
          <View style={{ flexDirection: 'row', gap: spacing[4] }}>
            <View style={{ alignItems: 'center' }}><MuscleBody colorFor={() => 'transparent'} width={132} /></View>
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <BodyStat label="Poids" value={weight != null ? `${weight.toFixed(1)} kg` : '—'} />
              <BodyStat label="Masse grasse" value={bodyFat != null ? `${bodyFat.toFixed(1)} %` : '—'} />
              <BodyStat label="Masse musculaire" value={muscleMass != null ? `${muscleMass.toFixed(1)} kg` : '—'} />
              <BodyStat label="Variation 7 j" value={weightDelta != null ? `${weightDelta > 0 ? '+' : ''}${weightDelta.toFixed(1)} kg` : '—'} color={weightDelta != null && weightDelta <= 0 ? colors.accentData : undefined} last />
            </View>
          </View>
        </Card>

        {/* Nutrition */}
        <Card>
          <SectionTitle right={<Pressable onPress={() => router.push('/nutrition')}><Text variant="caption" color="primary">Ouvrir ›</Text></Pressable>}>Nutrition</SectionTitle>
          <View style={{ flexDirection: 'row', gap: spacing[5], alignItems: 'center' }}>
            <ProgressRing value={kcalPct} size={96} thickness={9} gradient centerLabel={nutrition.length > 0 ? `${Math.round(totals.kcal)}` : '—'} caption={`/ ${Math.round(targets.kcal)}`} />
            <View style={{ flex: 1, gap: spacing[2] }}>
              <StateRow label="Déficit" value={nutrition.length > 0 ? `${deficit} kcal` : '—'} color={deficit >= 0 ? colors.accentData : colors.error} />
              <StateRow label="Protéines" value={`${Math.round(totals.proteinG)} / ${Math.round(targets.proteinG)} g`} />
              <StateRow label="Hydratation" value={`${(totals.hydrationMl / 1000).toFixed(1)} / ${(targets.hydrationMl / 1000).toFixed(1)} L`} />
            </View>
          </View>
        </Card>

        {/* Habitudes */}
        <Card>
          <SectionTitle right={<Pressable onPress={() => router.push('/profile/habits')}><Text variant="caption" color="primary">Voir ›</Text></Pressable>}>Habitudes</SectionTitle>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: spacing[4] }}>
            <MiniStat value={`${activeHabits.length - pendingHabits.length}/${activeHabits.length || 0}`} label="Aujourd'hui" />
            <MiniStat value={`${streak} j`} label="Série active" color={colors.accentData} />
            <MiniStat value={`${weekDays.filter((d) => d.done).length}/7`} label="Cette semaine" />
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {weekDays.map((d, i) => (
              <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                <Text variant="caption" color="textSubtle">{d.label}</Text>
                <View style={{ height: 30, width: '100%', borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: d.done ? 'rgba(43,227,139,0.18)' : colors.surfaceElevated, borderWidth: d.today ? 1.5 : 0, borderColor: colors.primary }}>
                  {d.done ? <Text style={{ color: colors.accentData, fontSize: 12 }}>✓</Text> : null}
                </View>
              </View>
            ))}
          </View>
        </Card>

        {/* Tendances */}
        <View>
          <SectionTitle right={<Text variant="caption" color="textSubtle">30 jours</Text>}>Tendances</SectionTitle>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing[3] }}>
            <TrendCard label="Poids" value={weightSeries.length >= 2 ? `${(weightSeries.at(-1)! - weightSeries[0]!).toFixed(1)}` : '—'} up={weightSeries.length >= 2 ? weightSeries.at(-1)! <= weightSeries[0]! : true} series={weightSeries} color="#ff7a8a" />
            <TrendCard label="Recovery" value={recoverySeries.length >= 2 ? `${recoverySeries.at(-1)! - recoverySeries[0]! >= 0 ? '+' : ''}${recoverySeries.at(-1)! - recoverySeries[0]!}` : '—'} up={recoverySeries.length >= 2 ? recoverySeries.at(-1)! >= recoverySeries[0]! : true} series={recoverySeries} color={colors.accentData} />
            <TrendCard label="HRV" value={hrvSeries.length >= 2 ? `${Math.round(hrvSeries.at(-1)! - hrvSeries[0]!)}` : '—'} up={hrvSeries.length >= 2 ? hrvSeries.at(-1)! >= hrvSeries[0]! : true} series={hrvSeries} color={colors.accentEndurance} />
          </ScrollView>
        </View>

        {/* Analyse du jour */}
        <View style={{ borderRadius: radii.xl, borderWidth: 1, borderColor: 'rgba(45,127,249,0.25)', backgroundColor: 'rgba(45,127,249,0.08)', padding: spacing[5] }}>
          <View style={{ flexDirection: 'row', gap: spacing[2], alignItems: 'center' }}><Text style={{ fontSize: 20 }}>🧠</Text><Text variant="heading">Analyse du jour</Text></View>
          <Text variant="body" color="textMuted" style={{ marginTop: spacing[2], lineHeight: 22 }}>
            {recovery ? `${BAND_INFO[recovery.band]?.advice} ${hrvSeries.length >= 2 && hrvSeries.at(-1)! >= hrvSeries[0]! ? 'Ta HRV progresse — bon signe de récupération.' : ''}` : 'Ajoute des données (sommeil, HRV, activités) pour une analyse personnalisée.'}
          </Text>
        </View>

        {/* Badges récents */}
        {badges.length > 0 ? (
          <View>
            <SectionTitle right={<Pressable onPress={() => router.push('/profile/progression')}><Text variant="caption" color="primary">Tout voir ›</Text></Pressable>}>Badges récents</SectionTitle>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing[3] }}>
              {badges.map((b) => {
                const def = badgeDefinition(b.id);
                return (
                  <View key={b.id} style={{ width: 92, alignItems: 'center' }}>
                    <View style={{ width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border }}><Text style={{ fontSize: 24 }}>🏅</Text></View>
                    <Text variant="caption" color="textMuted" style={{ marginTop: 6, textAlign: 'center' }}>{def?.label ?? b.id}</Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {/* Accès rapides */}
        <Card>
          <SectionTitle>Accès rapides</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {QUICK_LINKS.map((l) => (
              <Pressable key={l.label} onPress={() => router.push(l.path)} style={({ pressed }) => ({ width: '25%', alignItems: 'center', gap: 6, paddingVertical: spacing[2], opacity: pressed ? 0.6 : 1 })}>
                <View style={{ width: 52, height: 52, borderRadius: radii.lg, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 22 }}>{l.icon}</Text></View>
                <Text variant="caption" color="textMuted" style={{ textAlign: 'center' }}>{l.label}</Text>
              </Pressable>
            ))}
          </View>
        </Card>
      </Screen>
      <Fab icon="+" accessibilityLabel="Ajouter" onPress={() => router.push('/nutrition')} />
    </View>
  );
}

const QUICK_LINKS: { label: string; icon: string; path: Href }[] = [
  { label: 'Repas', icon: '🍽', path: '/nutrition' },
  { label: 'Séance', icon: '▶️', path: '/sport/workout/new' },
  { label: 'Pesée', icon: '⚖', path: '/nutrition/weight' },
  { label: 'Habitude', icon: '✓', path: '/profile/habits' },
  { label: 'Objectif', icon: '🎯', path: '/profile/goals' },
  { label: 'Sommeil', icon: '😴', path: '/sommeil' },
  { label: 'Coach IA', icon: '✦', path: '/coach' },
  { label: 'Stats', icon: '📊', path: '/profile/analytics' },
];

function IconBtn({ icon, onPress }: { icon: string; onPress: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.94 : 1 }] })}>
      <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 16 }}>{icon}</Text></View>
    </Pressable>
  );
}
function StateRow({ label, value, color }: { label: string; value: string; color?: string }): React.JSX.Element {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text variant="body" color="textMuted">{label}</Text>
      <Text variant="body" style={{ fontWeight: '700', color }}>{value}</Text>
    </View>
  );
}
function BodyStat({ label, value, color, last }: { label: string; value: string; color?: string; last?: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing[2], borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border }}>
      <Text variant="caption" color="textMuted">{label}</Text>
      <Text variant="body" style={{ fontWeight: '700', color }}>{value}</Text>
    </View>
  );
}
function MiniStat({ value, label, color }: { value: string; label: string; color?: string }): React.JSX.Element {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text variant="subtitle" style={{ color }}>{value}</Text>
      <Text variant="caption" color="textSubtle" style={{ marginTop: 2 }}>{label}</Text>
    </View>
  );
}
