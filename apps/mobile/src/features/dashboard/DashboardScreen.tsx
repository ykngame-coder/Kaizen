import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Card, Carousel, Gradient, Icon, ProgressRing, Screen, Sparkline, Text, useTheme, type IconName } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { HealthMetricType } from '@supotsu/core';
import {
  badgeDefinition,
  buildDailySnapshot,
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
import { useActivities, useHabitLogs, useHabits, useHealthMetrics, useLeaderboardPrefs, useNutritionEntries, usePlannedWorkouts, useRecordDailyScore, useSleepSessions } from '@/lib/data/queries';
import { useAuth } from '@/features/auth/AuthProvider';
import { MuscleBody } from '@/features/muscles/MuscleBody';
import { getCloudAvatarUrl, loadAvatarUri } from '@/lib/profileAvatar';
import { usePreferences } from '@/lib/preferences';
import { secureStorage } from '@/lib/secure-storage';
import { useManualHealthKitSync } from '@/features/connectors/useHealthKitAutoSync';
import { resolveDashboardCardOrder } from './dashboardCards';

const DAY_MS = 86_400_000;

/** "Aujourd'hui" / "Demain" / "Lun. 12 août" from a planned_for date. */
function planLabel(plannedFor: string | undefined, t: TFunction): string {
  if (!plannedFor) return t('dashboard.screen.planLabel.tbd');
  const key = plannedFor.slice(0, 10);
  const todayKey = new Date().toISOString().slice(0, 10);
  if (key === todayKey) return t('dashboard.screen.planLabel.today');
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (key === tomorrow.toISOString().slice(0, 10)) return t('dashboard.screen.planLabel.tomorrow');
  return date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

const BAND_INFO_KEYS: Record<string, { label: string; advice: string }> = {
  excellent: { label: 'dashboard.screen.recoveryBand.excellent.label', advice: 'dashboard.screen.recoveryBand.excellent.advice' },
  correct: { label: 'dashboard.screen.recoveryBand.good.label', advice: 'dashboard.screen.recoveryBand.good.advice' },
  moyen: { label: 'dashboard.screen.recoveryBand.moderate.label', advice: 'dashboard.screen.recoveryBand.moderate.advice' },
  faible: { label: 'dashboard.screen.recoveryBand.low.label', advice: 'dashboard.screen.recoveryBand.low.advice' },
};

const FR_DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const FR_DAYS_SHORT = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const FR_MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const longDate = (d: Date): string => `${FR_DAYS[d.getDay()]!.charAt(0).toUpperCase()}${FR_DAYS[d.getDay()]!.slice(1)} ${d.getDate()} ${FR_MONTHS[d.getMonth()]}`;
const dayKey = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function fmtSleep(hours: number, t: TFunction): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return t('dashboard.screen.sleepDuration.hoursMinutes', { h, m: String(m).padStart(2, '0') });
}
/** A raw minute count ("+353 min") reads as noise past an hour — switch to "h" once it crosses 60. */
function fmtSleepDelta(deltaMin: number, t: TFunction): string {
  const abs = Math.abs(deltaMin);
  if (abs < 60) return t('dashboard.screen.sleepDelta.minutes', { m: abs });
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return t('dashboard.screen.sleepDuration.hoursMinutes', { h, m: String(m).padStart(2, '0') });
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

function KpiTile({ icon, value, delta, deltaTone, label, onPress }: { icon: React.ReactNode; value: string; delta?: string; deltaTone?: 'up' | 'down' | 'muted'; label: string; onPress?: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const dColor = deltaTone === 'up' ? colors.accentData : deltaTone === 'down' ? colors.error : colors.textSubtle;
  const content = (
    <View style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing[3] }}>
      {typeof icon === 'string' ? <Text style={{ fontSize: 15 }}>{icon}</Text> : icon}
      <Text variant="subtitle" style={{ marginTop: spacing[1], letterSpacing: -0.4 }}>{value}</Text>
      {delta ? <Text variant="caption" style={{ color: dColor, marginTop: 2, fontWeight: '600' }}>{delta}</Text> : null}
      <Text variant="caption" color="textSubtle" style={{ marginTop: 2 }}>{label}</Text>
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.7 : 1 })}>
      {content}
    </Pressable>
  );
}

/** One pillar of the Score Kaizen breakdown (Sport / Récup / Sommeil / Nutrition). */
function PillarCell({ label, value }: { label: string; value: number | null }): React.JSX.Element {
  return (
    <View style={{ flex: 1, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.10)', borderRadius: radii.md, paddingVertical: spacing[2] }}>
      <Text variant="subtitle" color="onGradient">{value ?? '—'}</Text>
      <Text variant="caption" color="onGradient" style={{ opacity: 0.75, marginTop: 1 }}>{label}</Text>
    </View>
  );
}

/** Checkbox is its own tap target (manual override); the rest of the row navigates to the relevant screen. */
function CheckRow({ done, label, last, onToggle, onPress }: { done: boolean; label: string; last?: boolean; onToggle: () => void; onPress: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[1], borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border }}>
      <Pressable onPress={onToggle} hitSlop={10} style={{ paddingVertical: spacing[2] }}>
        <View style={{ width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? colors.accentData : 'transparent', borderWidth: done ? 0 : 2, borderColor: colors.textSubtle }}>
          {done ? <Text style={{ color: '#04140b', fontSize: 12, fontWeight: '800' }}>✓</Text> : null}
        </View>
      </Pressable>
      <Pressable onPress={onPress} style={({ pressed }) => ({ flex: 1, paddingVertical: spacing[2], opacity: pressed ? 0.6 : 1 })}>
        <Text variant="body" style={{ color: done ? colors.textSubtle : colors.text }}>{label}</Text>
      </Pressable>
    </View>
  );
}

/** Makes an entire card tappable toward its hub — not just the small "Voir ›" link in its header. */
function TapCard({ onPress, children }: { onPress: () => void; children: React.ReactNode }): React.JSX.Element {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
      {children}
    </Pressable>
  );
}

/** Fills whatever width its container gives it (Carousel page or a fixed chip) — measures itself so the sparkline scales to fit instead of guessing a width. */
function TrendCard({ label, value, up, series, color }: { label: string; value: string; up: boolean; series: number[]; color: string }): React.JSX.Element {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing[3] }}
    >
      <Text variant="caption" color="textSubtle">{label}</Text>
      <Text variant="subtitle" style={{ color: up ? colors.accentData : colors.error, marginTop: 2 }}>{value}</Text>
      {series.length >= 2 && width > 0 ? <View style={{ marginTop: spacing[2] }}><Sparkline values={series} width={width - spacing[3] * 2} height={56} color={color} /></View> : null}
    </View>
  );
}

/* ---------- screen ---------- */

export function DashboardScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { user, mode } = useAuth();
  const { preferences } = usePreferences();
  const cardOrder = useMemo(() => resolveDashboardCardOrder(preferences.dashboardCards), [preferences.dashboardCards]);
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

  const { data: sleepSessions = [] } = useSleepSessions();
  const snapshot = useMemo(
    () =>
      buildDailySnapshot(activities, [], asOf, health, {
        nutritionEntries: nutrition,
        nutritionTargets: targets,
        sleepSessions,
      }),
    [activities, health, asOf, nutrition, targets, sleepSessions],
  );
  const { data: leaderboardPrefs } = useLeaderboardPrefs();
  const recordDailyScore = useRecordDailyScore();
  useEffect(() => {
    if (!leaderboardPrefs?.leaderboardOptIn) return;
    const value = snapshot.value.overall;
    if (!Number.isFinite(value)) return;
    recordDailyScore.mutate({ column: 'kaizen', value: Math.round(value) });
  }, [leaderboardPrefs?.leaderboardOptIn, snapshot.value.overall]);
  const hasScoreData = snapshot.confidence !== 'to_confirm';
  const kaizenBand = recoveryBand(snapshot.value.overall);

  // Day-state
  const energie = recovery ? (recovery.value >= 70 ? { t: t('dashboard.screen.energyLevel.high'), c: colors.accentData } : recovery.value >= 50 ? { t: t('dashboard.screen.energyLevel.medium'), c: colors.warning } : { t: t('dashboard.screen.energyLevel.low'), c: colors.error }) : null;
  const fatigue = recovery ? (recovery.value >= 70 ? { t: t('dashboard.screen.fatigueLevel.low'), c: colors.accentData } : recovery.value >= 50 ? { t: t('dashboard.screen.fatigueLevel.moderate'), c: colors.warning } : { t: t('dashboard.screen.fatigueLevel.high'), c: colors.error }) : null;
  const LOAD: Record<string, { t: string; c: string }> = {
    'sous-charge': { t: t('dashboard.screen.loadState.underload'), c: colors.info }, optimal: { t: t('dashboard.screen.loadState.optimal'), c: colors.accentData }, 'élevé': { t: t('dashboard.screen.loadState.high'), c: colors.warning }, risque: { t: t('dashboard.screen.loadState.risk'), c: colors.error },
  };
  const chargeState = acwr.zone ? LOAD[acwr.zone] : null;

  // Habits (today + streak + week)
  const todayK = dayKey(now);
  // Each sync stores today's steps as its own already-cumulative reading
  // (HealthKit's own dedup-aware total, not a raw sample to add up) — take
  // the most recent one, not a sum, or a later sync in the same day would
  // double-count on top of an earlier one.
  const stepsToday = useMemo(() => {
    const todays = health.filter((m) => m.type === 'steps' && dayKey(new Date(m.measuredAt)) === todayK);
    return [...todays].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt)).at(-1)?.value ?? 0;
  }, [health, todayK]);
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
  const syncHealth = useManualHealthKitSync();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async (): Promise<void> => { setRefreshing(true); await syncHealth(); await qc.invalidateQueries(); setRefreshing(false); };

  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  useEffect(() => {
    if (mode !== 'demo' && user) void getCloudAvatarUrl(user.id).then(setAvatarUri);
    else void loadAvatarUri().then(setAvatarUri);
  }, [mode, user?.id]);

  const firstName = greetingName(user?.email);
  const initial = (firstName || user?.email || 'K').charAt(0).toUpperCase();
  const focusMsg = recovery
    ? BAND_INFO_KEYS[recovery.band]
      ? t(BAND_INFO_KEYS[recovery.band]!.advice)
      : ''
    : t('dashboard.screen.focus.noData');

  // Manual override on top of the auto-computed `done` above — lets the user
  // tick a priority by hand even before the underlying data catches up.
  // Scoped to today's date key so it naturally resets tomorrow.
  const [manualDone, setManualDone] = useState<Set<number>>(new Set());
  useEffect(() => {
    let active = true;
    void secureStorage.getItem(`supotsu.dashboard.priorities.${todayK}`).then((raw) => {
      if (!active || !raw) return;
      try {
        setManualDone(new Set(JSON.parse(raw) as number[]));
      } catch {
        // ignore corrupt state
      }
    });
    return () => {
      active = false;
    };
  }, [todayK]);
  const togglePriority = (i: number): void => {
    setManualDone((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      void secureStorage.setItem(`supotsu.dashboard.priorities.${todayK}`, JSON.stringify([...next]));
      return next;
    });
  };

  const priorityBase: { done: boolean; label: string; path: Href }[] = [
    { done: waterLeftMl <= 0, label: waterLeftMl > 0 ? t('dashboard.screen.priorities.water.pending', { liters: (waterLeftMl / 1000).toFixed(1) }) : t('dashboard.screen.priorities.water.done'), path: '/nutrition' },
    { done: proteinLeft <= 0, label: proteinLeft > 0 ? t('dashboard.screen.priorities.protein.pending', { target: Math.round(targets.proteinG), remaining: proteinLeft }) : t('dashboard.screen.priorities.protein.done'), path: '/nutrition' },
    { done: pendingHabits.length === 0 && activeHabits.length > 0, label: activeHabits.length === 0 ? t('dashboard.screen.priorities.habits.none') : pendingHabits.length === 0 ? t('dashboard.screen.priorities.habits.allDone') : t('dashboard.screen.priorities.habits.pending', { count: pendingHabits.length }), path: '/profile/habits' },
    { done: !!lastNight && lastNight.hours >= 7.75, label: lastNight ? t('dashboard.screen.priorities.sleep.value', { duration: fmtSleep(lastNight.hours, t) }) : t('dashboard.screen.priorities.sleep.record'), path: '/sommeil' },
  ];
  const priorities = priorityBase.map((p, i) => ({ ...p, done: p.done || manualDone.has(i) }));

  // One node per customizable card (see dashboardCards.ts) — order/visibility
  // applied where they're rendered, below.
  const cardNodes: Record<string, React.ReactNode> = {
    'etat-du-jour': (
      <TapCard onPress={() => router.push('/sport/load')}>
        <Card>
          <Text variant="heading">{t('dashboard.screen.stateCard.title')}</Text>
          <View style={{ flexDirection: 'row', gap: spacing[5], alignItems: 'center', marginTop: spacing[3] }}>
            <ProgressRing value={recovery?.value ?? 0} size={104} thickness={10} gradient centerLabel={recovery ? `${recovery.value}` : '—'} caption={t('dashboard.screen.stateCard.recoveryCaption')} />
            <View style={{ flex: 1, gap: spacing[3] }}>
              <StateRow label={t('dashboard.screen.stateCard.energyLabel')} value={energie?.t ?? '—'} color={energie?.c} />
              <StateRow label={t('dashboard.screen.stateCard.loadLabel')} value={chargeState?.t ?? t('dashboard.screen.loadState.uncalibrated')} color={chargeState?.c} />
              <StateRow label={t('dashboard.screen.stateCard.fatigueLabel')} value={fatigue?.t ?? '—'} color={fatigue?.c} />
            </View>
          </View>
          <View style={{ marginTop: spacing[4], paddingTop: spacing[3], borderTopWidth: 1, borderTopColor: colors.border }}>
            <Text variant="caption" color="textMuted" style={{ lineHeight: 20 }}>{recovery ? (BAND_INFO_KEYS[recovery.band] ? t(BAND_INFO_KEYS[recovery.band]!.advice) : '') : t('dashboard.screen.stateCard.noData')}</Text>
          </View>
        </Card>
      </TapCard>
    ),
    kpis: (
      <Carousel
        data={[
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <KpiTile icon={<Icon name="sleep" size={16} color={colors.info} />} value={lastNight ? fmtSleep(lastNight.hours, t) : '—'} delta={sleepDelta != null ? `${sleepDelta >= 0 ? '▲ +' : '▼ '}${fmtSleepDelta(sleepDelta, t)}` : undefined} deltaTone={sleepDelta != null && sleepDelta >= 0 ? 'up' : 'down'} label={t('dashboard.screen.kpis.sleep')} onPress={() => router.push('/sommeil')} />
            <KpiTile icon={<Icon name="trendingUp" size={16} color={colors.accentData} />} value={hrv != null ? `${Math.round(hrv)} ms` : '—'} label={t('dashboard.screen.kpis.hrv')} onPress={() => router.push('/sommeil')} />
            <KpiTile icon={<Icon name="heartPulse" size={16} color={colors.error} />} value={rhr != null ? `${Math.round(rhr)}` : '—'} label={t('dashboard.screen.kpis.restingHr')} onPress={() => router.push('/sommeil')} />
          </View>,
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <KpiTile icon={<Icon name="scale" size={16} color={colors.accentMobility} />} value={weight != null ? weight.toFixed(1) : '—'} delta={weightDelta != null ? `${weightDelta <= 0 ? '▼ ' : '▲ +'}${Math.abs(weightDelta).toFixed(1)}` : undefined} deltaTone={weightDelta != null && weightDelta <= 0 ? 'up' : 'down'} label={t('dashboard.screen.kpis.weightKg')} onPress={() => router.push('/nutrition/weight')} />
            <KpiTile icon={<Icon name="trendingDown" size={16} color={colors.warning} />} value={nutrition.length > 0 ? `${deficit}` : '—'} label={t('dashboard.screen.kpis.kcalDeficit')} onPress={() => router.push('/nutrition')} />
            <KpiTile icon={<Icon name="water" size={16} color={colors.info} />} value={`${(totals.hydrationMl / 1000).toFixed(1)}`} label={`/ ${(targets.hydrationMl / 1000).toFixed(1)} L`} onPress={() => router.push('/nutrition')} />
          </View>,
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <KpiTile icon={<Icon name="footsteps" size={16} color={colors.accentData} />} value={stepsToday > 0 ? stepsToday.toLocaleString('fr-FR') : '—'} label={t('dashboard.screen.kpis.stepsGoal', { goal: preferences.dailyStepsGoal.toLocaleString('fr-FR') })} />
          </View>,
        ]}
        keyExtractor={(_, i) => `kpi-page-${i}`}
        renderItem={(page) => page}
      />
    ),
    priorites: (
      <Card>
        <SectionTitle>{t('dashboard.screen.priorities.title')}</SectionTitle>
        {priorities.map((p, i) => (
          <CheckRow
            key={i}
            done={p.done}
            label={p.label}
            last={i === priorities.length - 1}
            onToggle={() => togglePriority(i)}
            onPress={() => router.push(p.path)}
          />
        ))}
      </Card>
    ),
    'prochaine-seance': (
      <TapCard onPress={() => router.push(nextPlanned ? '/sport/planning' : '/sport/workout/new')}>
        <Card>
          <SectionTitle right={<Pressable onPress={() => router.push('/sport/planning')}><Text variant="caption" color="primary">{t('dashboard.screen.nextSession.planningLink')}</Text></Pressable>}>{t('dashboard.screen.nextSession.title')}</SectionTitle>
          <View style={{ flexDirection: 'row', gap: spacing[4], alignItems: 'center' }}>
            <View style={{ width: 64, height: 64, borderRadius: radii.lg, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}><Icon name="dumbbell" size={28} color={colors.primary} /></View>
            <View style={{ flex: 1 }}>
              {nextPlanned ? (
                <>
                  <Text variant="body" style={{ fontWeight: '700' }}>{nextPlanned.name}</Text>
                  <Text variant="caption" color="textSubtle" style={{ marginTop: 2 }}>{planLabel(nextPlanned.plannedFor, t)}{nextPlanned.notes ? ` · ${nextPlanned.notes}` : ''}</Text>
                </>
              ) : (
                <>
                  <Text variant="body" style={{ fontWeight: '700' }}>{t('dashboard.screen.nextSession.planTitle')}</Text>
                  <Text variant="caption" color="textSubtle" style={{ marginTop: 2 }}>{chargeState ? t('dashboard.screen.nextSession.loadHint', { load: chargeState.t.toLowerCase() }) : t('dashboard.screen.nextSession.chooseFocus')}</Text>
                </>
              )}
            </View>
          </View>
          <View style={{ marginTop: spacing[3], height: 46, borderRadius: radii.xl, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
            <Text variant="body" style={{ fontWeight: '600' }}>{nextPlanned ? t('dashboard.screen.nextSession.viewPlanning') : t('dashboard.screen.nextSession.createSession')}</Text>
          </View>
        </Card>
      </TapCard>
    ),
    'corps-recuperation': (
      <TapCard onPress={() => router.push('/sport/muscles')}>
        <Card>
          <SectionTitle right={<Pressable onPress={() => router.push('/sport/muscles')}><Text variant="caption" color="primary">{t('dashboard.screen.body.seeMore')}</Text></Pressable>}>{t('dashboard.screen.body.title')}</SectionTitle>
          <View style={{ flexDirection: 'row', gap: spacing[4] }}>
            <View style={{ alignItems: 'center' }}><MuscleBody colorFor={() => 'transparent'} width={132} /></View>
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <BodyStat label={t('dashboard.screen.body.weight')} value={weight != null ? `${weight.toFixed(1)} kg` : '—'} />
              <BodyStat label={t('dashboard.screen.body.bodyFat')} value={bodyFat != null ? `${bodyFat.toFixed(1)} %` : '—'} />
              <BodyStat label={t('dashboard.screen.body.muscleMass')} value={muscleMass != null ? `${muscleMass.toFixed(1)} kg` : '—'} />
              <BodyStat label={t('dashboard.screen.body.weeklyChange')} value={weightDelta != null ? `${weightDelta > 0 ? '+' : ''}${weightDelta.toFixed(1)} kg` : '—'} color={weightDelta != null && weightDelta <= 0 ? colors.accentData : undefined} last />
            </View>
          </View>
        </Card>
      </TapCard>
    ),
    nutrition: (
      <TapCard onPress={() => router.push('/nutrition')}>
        <Card>
          <SectionTitle right={<Pressable onPress={() => router.push('/nutrition')}><Text variant="caption" color="primary">{t('dashboard.screen.nutritionCard.open')}</Text></Pressable>}>{t('dashboard.screen.nutritionCard.title')}</SectionTitle>
          <View style={{ flexDirection: 'row', gap: spacing[5], alignItems: 'center' }}>
            <ProgressRing value={kcalPct} size={96} thickness={9} gradient centerLabel={nutrition.length > 0 ? `${Math.round(totals.kcal)}` : '—'} caption={`/ ${Math.round(targets.kcal)}`} />
            <View style={{ flex: 1, gap: spacing[2] }}>
              <StateRow label={t('dashboard.screen.nutritionCard.deficit')} value={nutrition.length > 0 ? `${deficit} kcal` : '—'} color={deficit >= 0 ? colors.accentData : colors.error} />
              <StateRow label={t('dashboard.screen.nutritionCard.protein')} value={`${Math.round(totals.proteinG)} / ${Math.round(targets.proteinG)} g`} />
              <StateRow label={t('dashboard.screen.nutritionCard.hydration')} value={`${(totals.hydrationMl / 1000).toFixed(1)} / ${(targets.hydrationMl / 1000).toFixed(1)} L`} />
            </View>
          </View>
        </Card>
      </TapCard>
    ),
    habitudes: (
      <TapCard onPress={() => router.push('/profile/habits')}>
        <Card>
          <SectionTitle right={<Pressable onPress={() => router.push('/profile/habits')}><Text variant="caption" color="primary">{t('dashboard.screen.habitsCard.seeMore')}</Text></Pressable>}>{t('dashboard.screen.habitsCard.title')}</SectionTitle>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: spacing[4] }}>
            <MiniStat value={`${activeHabits.length - pendingHabits.length}/${activeHabits.length || 0}`} label={t('dashboard.screen.habitsCard.today')} />
            <MiniStat value={`${streak} j`} label={t('dashboard.screen.habitsCard.streak')} color={colors.accentData} />
            <MiniStat value={`${weekDays.filter((d) => d.done).length}/7`} label={t('dashboard.screen.habitsCard.thisWeek')} />
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
      </TapCard>
    ),
    tendances: (
      <View>
        <SectionTitle right={<Text variant="caption" color="textSubtle">{t('dashboard.screen.trends.last30Days')}</Text>}>{t('dashboard.screen.trends.title')}</SectionTitle>
        <Carousel
          data={[
            { key: 'poids', label: t('dashboard.screen.trends.weight'), value: weightSeries.length >= 2 ? `${(weightSeries.at(-1)! - weightSeries[0]!).toFixed(1)}` : '—', up: weightSeries.length >= 2 ? weightSeries.at(-1)! <= weightSeries[0]! : true, series: weightSeries, color: '#ff7a8a' },
            { key: 'recovery', label: t('dashboard.screen.trends.recovery'), value: recoverySeries.length >= 2 ? `${recoverySeries.at(-1)! - recoverySeries[0]! >= 0 ? '+' : ''}${recoverySeries.at(-1)! - recoverySeries[0]!}` : '—', up: recoverySeries.length >= 2 ? recoverySeries.at(-1)! >= recoverySeries[0]! : true, series: recoverySeries, color: colors.accentData },
            { key: 'hrv', label: t('dashboard.screen.trends.hrv'), value: hrvSeries.length >= 2 ? `${Math.round(hrvSeries.at(-1)! - hrvSeries[0]!)}` : '—', up: hrvSeries.length >= 2 ? hrvSeries.at(-1)! >= hrvSeries[0]! : true, series: hrvSeries, color: colors.accentEndurance },
          ]}
          keyExtractor={(item) => item.key}
          peek={36}
          renderItem={(item) => <TrendCard label={item.label} value={item.value} up={item.up} series={item.series} color={item.color} />}
        />
      </View>
    ),
    analyse: (
      <View style={{ borderRadius: radii.xl, borderWidth: 1, borderColor: 'rgba(45,127,249,0.25)', backgroundColor: 'rgba(45,127,249,0.08)', padding: spacing[5] }}>
        <View style={{ flexDirection: 'row', gap: spacing[2], alignItems: 'center' }}><Icon name="brain" size={20} color={colors.info} /><Text variant="heading">{t('dashboard.screen.analysis.title')}</Text></View>
        <Text variant="body" color="textMuted" style={{ marginTop: spacing[2], lineHeight: 22 }}>
          {recovery ? `${BAND_INFO_KEYS[recovery.band] ? t(BAND_INFO_KEYS[recovery.band]!.advice) : ''} ${hrvSeries.length >= 2 && hrvSeries.at(-1)! >= hrvSeries[0]! ? t('dashboard.screen.analysis.hrvImproving') : ''}` : t('dashboard.screen.analysis.noData')}
        </Text>
      </View>
    ),
    badges: badges.length > 0 ? (
      <TapCard onPress={() => router.push('/profile/progression')}>
        <View>
          <SectionTitle right={<Pressable onPress={() => router.push('/profile/progression')}><Text variant="caption" color="primary">{t('dashboard.screen.badges.seeAll')}</Text></Pressable>}>{t('dashboard.screen.badges.title')}</SectionTitle>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing[3] }}>
            {badges.map((b) => {
              const def = badgeDefinition(b.id);
              return (
                <View key={b.id} style={{ width: 92, alignItems: 'center' }}>
                  <View style={{ width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border }}><Icon name="medal" size={24} color={colors.warning} /></View>
                  <Text variant="caption" color="textMuted" style={{ marginTop: 6, textAlign: 'center' }}>{def?.label ?? b.id}</Text>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </TapCard>
    ) : null,
    'acces-rapides': (
      <Card>
        <SectionTitle>{t('dashboard.screen.quickLinks.title')}</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {QUICK_LINKS.map((l) => (
            <Pressable key={l.key} onPress={() => router.push(l.path)} style={({ pressed }) => ({ width: '25%', alignItems: 'center', gap: 6, paddingVertical: spacing[2], opacity: pressed ? 0.6 : 1 })}>
              <View style={{ width: 52, height: 52, borderRadius: radii.lg, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}><Icon name={l.icon} size={22} color={colors.text} /></View>
              <Text variant="caption" color="textMuted" style={{ textAlign: 'center' }}>{t(l.labelKey)}</Text>
            </Pressable>
          ))}
        </View>
      </Card>
    ),
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen scroll onRefresh={onRefresh} refreshing={refreshing}>
        {/* Header */}
        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing[2] }}>
            <IconBtn icon={<Icon name="search" size={16} />} onPress={() => router.push('/search')} />
            <IconBtn icon={<Icon name="tune" size={16} />} onPress={() => router.push('/dashboard-customize')} />
            <IconBtn icon={<Icon name="notifications" size={16} />} onPress={() => router.push('/profile/notifications')} />
            <Pressable onPress={() => router.push('/profile')}>
              <View style={{ width: 38, height: 38, borderRadius: 19, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={{ width: 38, height: 38 }} resizeMode="cover" />
                ) : (
                  <>
                    <Gradient fill />
                    <Text variant="body" color="onGradient" style={{ fontWeight: '700' }}>{initial}</Text>
                  </>
                )}
              </View>
            </Pressable>
          </View>
          <View style={{ alignItems: 'center', marginTop: spacing[2] }}>
            <Text variant="title">{firstName ? t('dashboard.screen.header.greetingWithName', { name: firstName }) : t('dashboard.screen.header.greeting')}</Text>
            <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>{t('dashboard.screen.header.tagline')}</Text>
            <Text variant="caption" color="textSubtle" style={{ marginTop: 8 }}>{longDate(now)}</Text>
          </View>
        </View>

        {/* Focus du jour */}
        <Gradient style={{ borderRadius: radii.xl, padding: 1.5 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: radii.xl - 1.5, padding: spacing[5], flexDirection: 'row', gap: spacing[4], alignItems: 'center' }}>
            <Icon name="dumbbell" size={34} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text variant="caption" color="primary" style={{ letterSpacing: 1.4, fontWeight: '700', textTransform: 'uppercase' }}>{t('dashboard.screen.focus.label')}</Text>
              <Text variant="body" style={{ fontWeight: '600', marginTop: 4, lineHeight: 21 }}>{focusMsg}</Text>
            </View>
          </View>
        </Gradient>

        {/* Score Kaizen */}
        <View style={{ borderRadius: radii.lg, overflow: 'hidden' }}>
          <Gradient style={{ padding: spacing[5] }}>
            <Text variant="caption" color="onGradient" style={{ opacity: 0.85 }}>
              {t('dashboard.screen.score.title')}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing[3], marginTop: spacing[1] }}>
              <Text variant="display" color="onGradient">
                {hasScoreData ? snapshot.value.overall : '—'}
              </Text>
              <Text variant="subtitle" color="onGradient" style={{ opacity: 0.85, marginBottom: spacing[2] }}>
                / 100
              </Text>
            </View>
            <Text variant="caption" color="onGradient" style={{ opacity: 0.9, marginTop: spacing[1] }}>
              {hasScoreData
                ? t('dashboard.screen.score.summary', { band: BAND_INFO_KEYS[kaizenBand] ? t(BAND_INFO_KEYS[kaizenBand]!.label) : '' })
                : t('dashboard.screen.score.noData')}
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[4] }}>
              <PillarCell label={t('dashboard.screen.score.pillars.sport')} value={snapshot.value.sport} />
              <PillarCell label={t('dashboard.screen.score.pillars.recovery')} value={snapshot.value.recovery} />
              <PillarCell label={t('dashboard.screen.score.pillars.sleep')} value={snapshot.value.sleep} />
              <PillarCell label={t('dashboard.screen.score.pillars.nutrition')} value={snapshot.value.nutrition} />
            </View>
          </Gradient>
        </View>

        {/* Customizable cards — order/visibility from Réglages → Personnaliser le dashboard */}
        {cardOrder
          .filter((c) => c.visible)
          .map((c) => <React.Fragment key={c.id}>{cardNodes[c.id]}</React.Fragment>)}
      </Screen>
    </View>
  );
}

const QUICK_LINKS: { key: string; labelKey: string; icon: IconName; path: Href }[] = [
  { key: 'meals', labelKey: 'dashboard.screen.quickLinks.meals', icon: 'silverware', path: '/nutrition/meal/new' },
  { key: 'workout', labelKey: 'dashboard.screen.quickLinks.workout', icon: 'play', path: '/sport/workout/new' },
  { key: 'weighIn', labelKey: 'dashboard.screen.quickLinks.weighIn', icon: 'scale', path: '/nutrition/weight' },
  { key: 'habit', labelKey: 'dashboard.screen.quickLinks.habit', icon: 'calendarCheck', path: '/profile/habits' },
  { key: 'goal', labelKey: 'dashboard.screen.quickLinks.goal', icon: 'target', path: '/profile/goals' },
  { key: 'sleep', labelKey: 'dashboard.screen.quickLinks.sleep', icon: 'bedtime', path: '/sommeil' },
  { key: 'coach', labelKey: 'dashboard.screen.quickLinks.coach', icon: 'sparkle', path: '/coach' },
  { key: 'stats', labelKey: 'dashboard.screen.quickLinks.stats', icon: 'chartBar', path: '/profile/analytics' },
];

function IconBtn({ icon, onPress }: { icon: React.ReactNode; onPress: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.94 : 1 }] })}>
      <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>{typeof icon === 'string' ? <Text style={{ fontSize: 16 }}>{icon}</Text> : icon}</View>
    </Pressable>
  );
}
function StateRow({ label, value, color }: { label: string; value: string; color?: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text variant="body" color="textMuted">{label}</Text>
      <Text variant="body" style={{ fontWeight: '700', color: color ?? colors.text }}>{value}</Text>
    </View>
  );
}
function BodyStat({ label, value, color, last }: { label: string; value: string; color?: string; last?: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing[2], borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border }}>
      <Text variant="caption" color="textMuted">{label}</Text>
      <Text variant="body" style={{ fontWeight: '700', color: color ?? colors.text }}>{value}</Text>
    </View>
  );
}
function MiniStat({ value, label, color }: { value: string; label: string; color?: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center' }}>
      <Text variant="subtitle" style={{ color: color ?? colors.text }}>{value}</Text>
      <Text variant="caption" color="textSubtle" style={{ marginTop: 2 }}>{label}</Text>
    </View>
  );
}
