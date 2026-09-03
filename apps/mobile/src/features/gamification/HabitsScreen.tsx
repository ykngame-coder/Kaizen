import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Card, Icon, Screen, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { Habit, HealthMetricType } from '@supotsu/core';
import { estimateTargets, sumDay } from '@supotsu/engines';
import { BackButton } from '@/features/navigation/BackButton';
import { DayNav, useSelectedDay } from '@/features/navigation/DayNav';
import { useActivities, useHabitLogs, useHabits, useHealthMetrics, useLogHabit, useNutritionEntries, useUnlogHabit, useWorkouts } from '@/lib/data/queries';
import { usePreferences } from '@/lib/preferences';
import { GoalsSection } from '@/features/goals/GoalsSection';
import { linkedKindFor, type LinkedKind } from './linkedHabits';

const DAY_MS = 86_400_000;
const dayKey = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// 'habits' (the default pillar) and 'performance' have no thematic icon of
// their own, so both fell back to the same '✅' checkmark — which reads as
// "done" regardless of the habit's actual state, and was confusing right
// next to a habit still marked "À faire". Neutral star instead.
const PILLAR_ICON: Record<string, string> = {
  sleep: '😴', nutrition: '🥗', training: '🏋️', mind: '🧘', recovery: '💧', habits: '⭐', movement: '🚶', mobility: '🧘', hydration: '💧', performance: '📈',
};
const iconFor = (pillar: string, name: string): string => {
  const n = name.toLowerCase();
  if (n.includes('eau') || n.includes('hydrat')) return '💧';
  if (n.includes('lecture') || n.includes('lire')) return '📖';
  if (n.includes('sommeil') || n.includes('couch')) return '😴';
  if (n.includes('mobil') || n.includes('étir') || n.includes('stretch')) return '🧘';
  if (n.includes('marche') || n.includes('pas')) return '🚶';
  if (n.includes('muscu') || n.includes('entra') || n.includes('sport')) return '🏋️';
  return PILLAR_ICON[pillar] ?? '⭐';
};

function latestMetric(m: { type: HealthMetricType; value: number; measuredAt: string }[], type: HealthMetricType): number | undefined {
  return m.filter((x) => x.type === type).sort((a, b) => a.measuredAt.localeCompare(b.measuredAt)).at(-1)?.value;
}

/** Consecutive days ending today (or yesterday) present in the set. */
function streakOf(days: Set<string>, now: Date): number {
  let streak = 0;
  const cursor = new Date(now);
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function Kpi({ icon, value, sub, label, color }: { icon: React.ReactNode; value: string; sub?: string; label: string; color?: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ flexGrow: 1, flexBasis: '45%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing[4] }}>
      {typeof icon === 'string' ? <Text style={{ fontSize: 18 }}>{icon}</Text> : icon}
      <Text variant="data" style={{ marginTop: spacing[2], color: color ?? colors.text }}>{value}{sub ? <Text variant="caption" color="textSubtle">{sub}</Text> : null}</Text>
      <Text variant="caption" color="textSubtle" style={{ marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function MiniBar({ pct, color }: { pct: number; color: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceElevated, overflow: 'hidden', marginTop: 4 }}>
      <View style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: 6, borderRadius: 3, backgroundColor: color }} />
    </View>
  );
}

/**
 * Objectifs & Habitudes (mockup #9 + #17) — daily checklist, streaks, 30-day
 * calendar (unchanged habits logic), plus the Objectifs content below it
 * (see GoalsSection) since the two screens were merged into one.
 */
export function HabitsScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { preferences } = usePreferences();
  const { data: habits = [], isLoading: habitsLoading } = useHabits();
  const { data: logs = [], isLoading: logsLoading } = useHabitLogs();
  const { data: health = [] } = useHealthMetrics();
  const { data: nutrition = [] } = useNutritionEntries();
  const { data: workouts = [] } = useWorkouts();
  const { data: activities = [] } = useActivities();
  const logHabit = useLogHabit();
  const unlogHabit = useUnlogHabit();
  const [selectedDate, setSelectedDate] = useSelectedDay();
  const [showGoalForm, setShowGoalForm] = useState(false);
  // Which habit's checkbox is mid-tap — per-row instead of the mutations'
  // own shared isPending (which would freeze every other row's checkbox for
  // the duration of one tap), plus an explicit error surface: a failed
  // log/unlog used to fail silently, which reads as "le clic ne fait rien".
  const [pendingHabitId, setPendingHabitId] = useState<string | null>(null);
  const now = new Date();
  const todayK = dayKey(now);
  const viewedK = dayKey(new Date(selectedDate));
  const isToday = viewedK === todayK;

  const active = habits.filter((h) => !h.archivedAt);

  // Logs indexed by day, per-habit day-sets (for streaks), per-habit
  // completion counts on the viewed day (for multi-per-day targets), and the
  // most recent log id per habit on the viewed day (so unchecking removes
  // exactly the last completion instead of every log for that habit).
  const { byDay, perHabitDays, countsOnViewedDay, latestLogIdOnViewedDay } = useMemo(() => {
    const day = new Map<string, Set<string>>();
    const perHabit = new Map<string, Set<string>>();
    const counts = new Map<string, number>();
    const latest = new Map<string, { id: string; completedAt: string }>();
    for (const l of logs) {
      const k = dayKey(new Date(l.completedAt));
      if (!day.has(k)) day.set(k, new Set());
      day.get(k)!.add(l.habitId);
      if (!perHabit.has(l.habitId)) perHabit.set(l.habitId, new Set());
      perHabit.get(l.habitId)!.add(k);
      if (k === viewedK) {
        counts.set(l.habitId, (counts.get(l.habitId) ?? 0) + 1);
        const current = latest.get(l.habitId);
        if (!current || l.completedAt > current.completedAt) latest.set(l.habitId, { id: l.id, completedAt: l.completedAt });
      }
    }
    return { byDay: day, perHabitDays: perHabit, countsOnViewedDay: counts, latestLogIdOnViewedDay: latest };
  }, [logs, viewedK]);

  // Real progress for linked habits — today only, no history backfill for past days.
  const weight = latestMetric(health, 'weight');
  // The auto estimate, unless the user already set a real target on the
  // Nutrition hub's Objectifs card — this used to always show the raw
  // auto-estimate here, silently ignoring any customization made there.
  const hydrationTarget = useMemo(
    () => preferences.nutritionGoals?.hydrationMl ?? estimateTargets({ weightKg: weight }, now.toISOString()).value.hydrationMl,
    [preferences.nutritionGoals, weight],
  );
  const hydrationToday = useMemo(() => sumDay(nutrition, now.toISOString()).hydrationMl, [nutrition]);
  const stepsToday = useMemo(() => {
    const todays = health.filter((m) => m.type === 'steps' && dayKey(new Date(m.measuredAt)) === todayK);
    return [...todays].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt)).at(-1)?.value ?? 0;
  }, [health, todayK]);
  // A completed strength/circuit session OR any imported activity (Apple
  // Santé/Garmin cardio included) counts as "séance faite" for today.
  const workoutDoneToday = useMemo(() => {
    const structured = workouts.some((w) => w.status === 'completed' && w.completedAt && dayKey(new Date(w.completedAt)) === todayK);
    if (structured) return true;
    return activities.some((a) => dayKey(new Date(a.startedAt)) === todayK);
  }, [workouts, activities, todayK]);

  const liveProgress = (kind: LinkedKind): { value: number; target: number } => {
    if (kind === 'hydration') return { value: hydrationToday, target: hydrationTarget };
    if (kind === 'steps') return { value: stepsToday, target: preferences.dailyStepsGoal };
    return { value: workoutDoneToday ? 1 : 0, target: 1 };
  };

  /**
   * count/target/done for a habit on the viewed day — live data for linked
   * habits, else manual log count. `liveConfirmed` is true only once real
   * data itself hits the target — a linked habit not yet confirmed that way
   * (e.g. Apple Santé hasn't synced today's workout yet) still allows a
   * manual tap, same as any other habit ("on ne peut pas cocher la case
   * sport malgré qu'elle soit faite via Apple Santé" — previously the
   * checkbox was hidden entirely whenever a habit was linked and it's today).
   */
  const progressFor = (h: Habit): { count: number; target: number; done: boolean; live?: { value: number; target: number }; liveConfirmed: boolean } => {
    const kind = linkedKindFor(h.name);
    if (kind && isToday) {
      const live = liveProgress(kind);
      const liveConfirmed = live.target > 0 && live.value >= live.target;
      const manuallyLogged = (perHabitDays.get(h.id) ?? new Set()).has(todayK);
      const done = liveConfirmed || manuallyLogged;
      return { count: done ? 1 : 0, target: 1, done, live, liveConfirmed };
    }
    const target = h.cadence === 'daily' ? Math.max(1, h.targetPerPeriod) : 1;
    const count = countsOnViewedDay.get(h.id) ?? 0;
    return { count, target, done: count >= target, liveConfirmed: false };
  };

  // Linked habits auto-log once their real-data target is hit — guarded by
  // perHabitDays so it only fires once (the query invalidation that follows
  // a successful log flips `alreadyLogged`, which then skips it on rerender).
  // Also waits for both queries to actually resolve first: while `logs` is
  // still loading (e.g. right after app launch) it reads as [], which would
  // otherwise look like "never logged today" and fire a duplicate log for a
  // day that was already auto-logged in an earlier session.
  useEffect(() => {
    if (!isToday || habitsLoading || logsLoading) return;
    for (const h of active) {
      const kind = linkedKindFor(h.name);
      if (!kind) continue;
      const live = liveProgress(kind);
      if (live.target <= 0 || live.value < live.target) continue;
      if ((perHabitDays.get(h.id) ?? new Set()).has(todayK)) continue;
      logHabit.mutate({ habitId: h.id });
    }
  }, [isToday, habitsLoading, logsLoading, active, hydrationToday, hydrationTarget, stepsToday, preferences.dailyStepsGoal, workoutDoneToday, perHabitDays, todayK]);

  const denom = Math.max(1, active.length);

  // 30-day completion calendar (oldest → today) — always anchored to real
  // "today", independent of the day being browsed in the checklist above.
  const cal = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date(now.getTime() - (29 - i) * DAY_MS);
      const done = byDay.get(dayKey(d))?.size ?? 0;
      const frac = done / denom;
      return { frac, isToday: dayKey(d) === todayK };
    });
  }, [byDay, denom, now, todayK]);

  // Success rate over 30 days.
  const success = useMemo(() => {
    const total = cal.reduce((s, c) => s + c.frac, 0);
    return Math.round((total / 30) * 100);
  }, [cal]);

  // Streaks per habit (shown individually in "Séries en cours").
  const streaks = useMemo(() => active.map((h) => ({ habit: h, streak: streakOf(perHabitDays.get(h.id) ?? new Set(), now) })).sort((a, b) => b.streak - a.streak), [active, perHabitDays, now]);
  // "Meilleure série" KPI: a streak day only counts if ALL active habits were
  // validated that day — previously it took the max of any single habit's own
  // streak, so it could read "1 j" even on a day nothing else was done. Reuses
  // the same full-day-completion notion as the 30-day calendar's "Tout fait" cells.
  const daysFullyDone = useMemo(() => {
    const full = new Set<string>();
    for (const [k, ids] of byDay) if (ids.size >= denom) full.add(k);
    return full;
  }, [byDay, denom]);
  const bestStreak = useMemo(() => streakOf(daysFullyDone, now), [daysFullyDone, now]);
  const doneToday = useMemo(() => new Set(active.filter((h) => (perHabitDays.get(h.id) ?? new Set()).has(todayK)).map((h) => h.id)), [active, perHabitDays, todayK]);
  const disciplineScore = Math.round((doneToday.size / denom) * 40 + success * 0.6);

  const cellColor = (frac: number, future = false): string => {
    if (future) return colors.surfaceElevated;
    if (frac >= 1) return colors.accentData;
    if (frac > 0) return colors.warning;
    return colors.surfaceElevated;
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen scroll>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <BackButton />
          <View style={{ flexDirection: 'row', gap: spacing[2] }}>
            <Button label={t('sport.goals.screen.addGoalButton')} variant="secondary" onPress={() => setShowGoalForm((v) => !v)} />
            <Button label={t('sport.gamification.habitsScreen.addButton')} onPress={() => router.push('/profile/habit/new')} accessibilityLabel={t('sport.gamification.habitsScreen.addButtonA11y')} />
          </View>
        </View>
        <Text variant="title">{t('sport.gamification.habitsScreen.combinedTitle')}</Text>
        <Text variant="caption" color="textSubtle">{t('sport.gamification.habitsScreen.combinedSubtitle')}</Text>

        {/* Habitudes & discipline */}
        <Text variant="heading" style={{ marginTop: spacing[2] }}>{t('sport.gamification.habitsScreen.title')}</Text>

        {/* KPI */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] }}>
          <Kpi icon={<Icon name="checkCircle" size={18} color={colors.accentData} />} value={`${doneToday.size}`} sub={`/${active.length}`} label={t('sport.gamification.habitsScreen.kpi.doneToday')} color={colors.accentData} />
          <Kpi icon={<Icon name="bolt" size={18} color={colors.warning} />} value={t('sport.gamification.habitsScreen.daysSuffix', { count: bestStreak })} label={t('sport.gamification.habitsScreen.kpi.bestStreak')} />
          <Kpi icon={<Icon name="target" size={18} color={colors.accentData} />} value={`${success} %`} label={t('sport.gamification.habitsScreen.kpi.successRate')} />
          <Kpi icon={<Icon name="medal" size={18} color={colors.warning} />} value={`${active.length}`} label={t('sport.gamification.habitsScreen.kpi.activeHabits')} />
        </View>

        {/* 30-day calendar */}
        <Card>
          <Text variant="heading">{t('sport.gamification.habitsScreen.calendar.heading')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing[3] }}>
            {cal.map((c, i) => (
              <View key={i} style={{ width: `${(100 - 6 * 5) / 6}%`, aspectRatio: 1, borderRadius: 6, backgroundColor: cellColor(c.frac), borderWidth: c.isToday ? 1.5 : 0, borderColor: colors.primary }} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: spacing[3], marginTop: spacing[3] }}>
            <Legend color={colors.accentData} label={t('sport.gamification.habitsScreen.calendar.legend.done')} />
            <Legend color={colors.warning} label={t('sport.gamification.habitsScreen.calendar.legend.partial')} />
            <Legend color={colors.surfaceElevated} label={t('sport.gamification.habitsScreen.calendar.legend.none')} />
          </View>
        </Card>

        {/* Daily checklist */}
        <Card>
          <Text variant="heading">{t('sport.gamification.habitsScreen.checklist.heading')}</Text>
          <DayNav value={selectedDate} onChange={setSelectedDate} maxDaysFuture={0} />
          {active.length === 0 ? (
            <Text variant="body" color="textMuted" style={{ marginTop: spacing[2] }}>{t('sport.gamification.habitsScreen.checklist.emptyMessage')}</Text>
          ) : (
            <View style={{ marginTop: spacing[3] }}>
              {active.map((h, i) => {
                const p = progressFor(h);
                const kind = linkedKindFor(h.name);
                const isLast = i === active.length - 1;
                return (
                  <View key={h.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3], borderBottomWidth: isLast ? 0 : 1, borderBottomColor: colors.border }}>
                    <Pressable
                      onPress={() => router.push({ pathname: '/profile/habit/[id]/edit', params: { id: h.id } })}
                      accessibilityLabel={t('sport.gamification.habitsScreen.checklist.editA11y', { name: h.name })}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], flex: 1 }}
                    >
                    <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 17 }}>{iconFor(h.pillar, h.name)}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text variant="body" style={{ color: p.done ? colors.textMuted : colors.text }}>{h.name}</Text>
                      {p.live ? (
                        <>
                          <Text variant="caption" color="textSubtle">
                            {kind === 'hydration'
                              ? t('sport.gamification.habitsScreen.checklist.hydrationProgress', { value: (p.live.value / 1000).toFixed(1), target: (p.live.target / 1000).toFixed(1) })
                              : kind === 'steps'
                                ? t('sport.gamification.habitsScreen.checklist.stepsProgress', { value: p.live.value.toLocaleString('fr-FR'), target: p.live.target.toLocaleString('fr-FR') })
                                : p.done ? t('sport.gamification.habitsScreen.checklist.done') : t('sport.gamification.habitsScreen.checklist.notDone')}
                          </Text>
                          <MiniBar pct={(p.live.value / Math.max(1, p.live.target)) * 100} color={p.done ? colors.accentData : colors.warning} />
                        </>
                      ) : p.target > 1 ? (
                        <>
                          <Text variant="caption" color={p.done ? 'accentData' : 'textSubtle'} style={{ fontWeight: '600' }}>{p.count}/{p.target}</Text>
                          <MiniBar pct={(p.count / p.target) * 100} color={p.done ? colors.accentData : colors.warning} />
                        </>
                      ) : (
                        <Text variant="caption" style={{ color: p.done ? colors.accentData : colors.textSubtle, fontWeight: '600' }}>{p.done ? t('sport.gamification.habitsScreen.checklist.done') : t('sport.gamification.habitsScreen.checklist.notDone')}</Text>
                      )}
                    </View>
                    </Pressable>
                    {p.liveConfirmed ? null : (
                      <Pressable
                        onPress={() => {
                          const settle = (): void => setPendingHabitId((id) => (id === h.id ? null : id));
                          const onError = (): void => {
                            Alert.alert(
                              t('sport.gamification.habitsScreen.checklist.toggleErrorTitle'),
                              t('sport.gamification.habitsScreen.checklist.toggleError'),
                            );
                          };
                          if (p.done) {
                            const logId = latestLogIdOnViewedDay.get(h.id)?.id;
                            if (!logId) return;
                            setPendingHabitId(h.id);
                            unlogHabit.mutate(logId, { onSettled: settle, onError });
                          } else {
                            setPendingHabitId(h.id);
                            logHabit.mutate(
                              { habitId: h.id, completedAt: isToday ? undefined : new Date(selectedDate).toISOString() },
                              { onSettled: settle, onError },
                            );
                          }
                        }}
                        disabled={pendingHabitId === h.id}
                        hitSlop={16}
                        accessibilityLabel={p.done ? t('sport.gamification.habitsScreen.checklist.uncheckA11y', { name: h.name }) : t('sport.gamification.habitsScreen.checklist.checkA11y', { name: h.name })}
                        style={{ padding: 6 }}
                      >
                        <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: p.done ? colors.accentData : 'transparent', borderWidth: p.done ? 0 : 2, borderColor: colors.textSubtle }}>
                          {pendingHabitId === h.id ? (
                            <ActivityIndicator size="small" color={p.done ? '#04140b' : colors.textSubtle} />
                          ) : p.done ? (
                            <Text style={{ color: '#04140b', fontSize: 14, fontWeight: '800' }}>✓</Text>
                          ) : null}
                        </View>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </Card>

        {/* Score discipline */}
        <Card>
          <Text variant="heading">{t('sport.gamification.habitsScreen.disciplineScore.heading')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[4], marginTop: spacing[2] }}>
            {/* variant="data" (Archivo Black, already a black weight) — forcing
                fontWeight:800 onto Barlow (a regular-weight font file with no
                800 cut) made iOS synthesize the bold and mangled the digits
                into illegible glyphs, exactly what a tester reported. */}
            <Text variant="data" style={{ fontSize: 48, color: colors.text, flexShrink: 0 }}>{disciplineScore}<Text variant="subtitle" color="textSubtle">/100</Text></Text>
            <Text variant="body" color="textMuted" style={{ flex: 1, lineHeight: 20 }}>
              {disciplineScore >= 80
                ? t('sport.gamification.habitsScreen.disciplineScore.excellent')
                : disciplineScore >= 50
                  ? t('sport.gamification.habitsScreen.disciplineScore.good')
                  : t('sport.gamification.habitsScreen.disciplineScore.low')}
            </Text>
          </View>
        </Card>

        {/* Streaks */}
        {streaks.length > 0 ? (
          <Card>
            <Text variant="heading">{t('sport.gamification.habitsScreen.streaks.heading')}</Text>
            <View style={{ gap: spacing[3], marginTop: spacing[3] }}>
              {streaks.map(({ habit, streak }) => (
                <View key={habit.id}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text variant="body">{iconFor(habit.pillar, habit.name)}  {habit.name}</Text>
                    <Text variant="body" style={{ fontWeight: '700' }}>{t('sport.gamification.habitsScreen.daysSuffix', { count: streak })}</Text>
                  </View>
                  <View style={{ height: 8, borderRadius: 6, backgroundColor: colors.surfaceElevated, overflow: 'hidden', marginTop: 6 }}>
                    <View style={{ width: `${Math.min(100, (streak / 30) * 100)}%`, height: 8, borderRadius: 6, backgroundColor: colors.accentData }} />
                  </View>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        {/* Objectifs */}
        <View style={{ marginTop: spacing[2] }}>
          <GoalsSection showForm={showGoalForm} onCloseForm={() => setShowGoalForm(false)} />
        </View>
      </Screen>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }): React.JSX.Element {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[1] }}>
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }} />
      <Text variant="caption" color="textSubtle">{label}</Text>
    </View>
  );
}
