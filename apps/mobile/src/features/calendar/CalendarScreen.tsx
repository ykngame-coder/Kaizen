import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Card, Icon, Screen, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { ActivityType } from '@supotsu/core';
import { computeAcwr, computeRecoveryScore, sleepTrend, sumDay } from '@supotsu/engines';
import { useActivities, useChallenges, useGoals, useHealthMetrics, useNutritionEntries } from '@/lib/data/queries';
import { formatDate } from '@/lib/format';
import { formatClockFromIso, usePreferences } from '@/lib/preferences';

const DAY_MS = 86_400_000;

const ACT_COLOR: Record<ActivityType, string> = {
  strength: '#ff4d67', running: '#ff8b38', cycling: '#3bcbff', swimming: '#2d7ff9', hyrox: '#8b5cf6',
  mobility: '#2be38b', yoga: '#19d3a2', walking: '#aab6c5', cross_training: '#f5b742', other: '#748092',
};
const ACT_ICON: Record<ActivityType, string> = {
  strength: '🏋️', running: '🏃', cycling: '🚴', swimming: '🏊', hyrox: '🔥', mobility: '🧘', yoga: '🧘', walking: '🚶', cross_training: '🤸', other: '⚡',
};
const MEAL_ICON: Record<string, string> = { breakfast: '🥣', lunch: '🍗', dinner: '🍝', snack: '🍎' };
const dayKey = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const mean = (xs: number[]): number => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }): React.JSX.Element {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[3] }}>
      <Text variant="heading">{children}</Text>
      {right}
    </View>
  );
}
function Kpi({ label, value, color }: { label: string; value: string; color?: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ flexGrow: 1, flexBasis: '30%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing[3] }}>
      <Text variant="caption" color="textSubtle">{label}</Text>
      <Text variant="subtitle" style={{ marginTop: spacing[1], color: color ?? colors.text }}>{value}</Text>
    </View>
  );
}

/** Calendrier (mockup #14) — day summary, month grid, today timeline, deadlines, challenges, weekly history. */
export function CalendarScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { preferences } = usePreferences();
  const { data: activities = [] } = useActivities();
  const { data: nutrition = [] } = useNutritionEntries();
  const { data: goals = [] } = useGoals();
  const { data: challenges = [] } = useChallenges();
  const { data: health = [] } = useHealthMetrics();
  const now = useMemo(() => new Date(), []);
  const asOf = useMemo(() => now.toISOString(), [now]);
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedKey, setSelectedKey] = useState(() => dayKey(now));

  const FR_MONTHS = t('sport.calendar.months', { returnObjects: true }) as string[];
  const WEEK_HEAD = t('sport.calendar.weekdaysMin', { returnObjects: true }) as string[];
  const ACT_LABEL: Record<ActivityType, string> = {
    strength: t('sport.calendar.activityLabels.strength'), running: t('sport.calendar.activityLabels.running'),
    cycling: t('sport.calendar.activityLabels.cycling'), swimming: t('sport.calendar.activityLabels.swimming'),
    hyrox: t('sport.calendar.activityLabels.hyrox'), mobility: t('sport.calendar.activityLabels.mobility'),
    yoga: t('sport.calendar.activityLabels.yoga'), walking: t('sport.calendar.activityLabels.walking'),
    cross_training: t('sport.calendar.activityLabels.crossTraining'), other: t('sport.calendar.activityLabels.other'),
  };

  const actsByDay = useMemo(() => {
    const map = new Map<string, ActivityType[]>();
    for (const a of activities) {
      const k = dayKey(new Date(a.startedAt));
      const arr = map.get(k) ?? [];
      arr.push(a.type);
      map.set(k, arr);
    }
    return map;
  }, [activities]);

  const recovery = useMemo(() => computeRecoveryScore(health, asOf), [health, asOf]);
  const acwr = useMemo(() => computeAcwr(activities, asOf), [activities, asOf]);
  const todayActs = activities.filter((a) => dayKey(new Date(a.startedAt)) === dayKey(now));
  const lastNight = sleepTrend(health, asOf, 1).at(-1);
  const todayKcal = sumDay(nutrition, asOf).kcal;

  const grid = useMemo(() => {
    const base = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const year = base.getFullYear();
    const month = base.getMonth();
    const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: ({ day: number; key: string } | null)[] = [];
    for (let i = 0; i < firstDow; i += 1) cells.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) cells.push({ day: d, key: dayKey(new Date(year, month, d)) });
    return { year, month, cells };
  }, [now, monthOffset]);

  // Timeline for the currently selected day (defaults to today).
  const timeline = useMemo(() => {
    const items: { time: string; icon: string; label: string; sort: number; onPress?: () => void }[] = [];
    for (const a of activities) if (dayKey(new Date(a.startedAt)) === selectedKey) items.push({ time: formatClockFromIso(a.startedAt, preferences.timeFormat), icon: ACT_ICON[a.type], label: t('sport.calendar.timelineActivity', { label: ACT_LABEL[a.type], minutes: Math.round(a.durationSec / 60) }), sort: new Date(a.startedAt).getTime() });
    for (const e of nutrition) if (dayKey(new Date(e.loggedAt)) === selectedKey) items.push({ time: formatClockFromIso(e.loggedAt, preferences.timeFormat), icon: MEAL_ICON[e.mealType] ?? '🍽', label: t('sport.calendar.timelineMeal', { description: e.description, kcal: Math.round(e.kcal) }), sort: new Date(e.loggedAt).getTime(), onPress: () => router.push({ pathname: '/nutrition/meal/[id]', params: { id: e.id } }) });
    return items.sort((a, b) => a.sort - b.sort);
  }, [activities, nutrition, selectedKey, preferences.timeFormat, t, router]);

  const deadlines = useMemo(() => {
    const items: { icon: string; label: string; date: string }[] = [];
    for (const g of goals) if (g.deadline) items.push({ icon: '🎯', label: g.title, date: g.deadline });
    for (const c of challenges) items.push({ icon: '🏆', label: c.title, date: c.endsAt });
    return items.filter((i) => new Date(i.date).getTime() >= now.getTime() - DAY_MS).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
  }, [goals, challenges, now]);

  const activeChallenges = useMemo(() => challenges.filter((c) => new Date(c.startsAt).getTime() <= now.getTime() && new Date(c.endsAt).getTime() >= now.getTime()).map((c) => {
    const total = new Date(c.endsAt).getTime() - new Date(c.startsAt).getTime();
    const elapsed = now.getTime() - new Date(c.startsAt).getTime();
    return { title: c.title, pct: total > 0 ? Math.min(100, Math.round((elapsed / total) * 100)) : 0 };
  }), [challenges, now]);

  const weeks = useMemo(() => {
    return Array.from({ length: 4 }, (_, i) => {
      const end = now.getTime() - i * 7 * DAY_MS;
      const start = end - 7 * DAY_MS;
      const sessions = activities.filter((a) => { const tm = new Date(a.startedAt).getTime(); return tm >= start && tm < end; }).length;
      const recVals: number[] = [];
      for (let d = 0; d < 7; d += 1) { const r = computeRecoveryScore(health, new Date(start + d * DAY_MS).toISOString()); if (r.confidence !== 'to_confirm') recVals.push(r.value); }
      const w = health.filter((m) => m.type === 'weight' && new Date(m.measuredAt).getTime() < end).sort((a, b) => a.measuredAt.localeCompare(b.measuredAt)).at(-1)?.value;
      return { label: i === 0 ? t('sport.calendar.thisWeek') : t('sport.calendar.weeksAgo', { count: i }), sessions, rec: recVals.length ? Math.round(mean(recVals)) : null, weight: w };
    });
  }, [activities, health, now, t]);

  return (
    <Screen scroll>
      <Text variant="title">{t('sport.calendar.title')}</Text>
      <Text variant="caption" color="textSubtle">{t('sport.calendar.subtitle')}</Text>

      {/* Résumé du jour */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] }}>
        <Kpi label={t('sport.calendar.kpi.recovery')} value={recovery.confidence !== 'to_confirm' ? `${recovery.value} %` : '—'} color={colors.accentData} />
        <Kpi label={t('sport.calendar.kpi.load')} value={acwr.ratio != null ? acwr.ratio.toFixed(2) : '—'} />
        <Kpi label={t('sport.calendar.kpi.sessions')} value={`${todayActs.length}`} />
        <Kpi label={t('sport.calendar.kpi.sleep')} value={lastNight ? `${Math.floor(lastNight.hours)} h ${String(Math.round((lastNight.hours % 1) * 60)).padStart(2, '0')}` : '—'} />
        <Kpi label={t('sport.calendar.kpi.nutrition')} value={todayKcal > 0 ? `${Math.round(todayKcal)} kcal` : '—'} />
        <Kpi label={t('sport.calendar.kpi.date')} value={`${now.getDate()} ${FR_MONTHS[now.getMonth()]!.slice(0, 4)}.`} />
      </View>

      {/* Month grid */}
      <Card>
        <SectionTitle right={<View style={{ flexDirection: 'row', gap: spacing[4] }}>
          <Pressable onPress={() => setMonthOffset((o) => o - 1)} hitSlop={8}><Text variant="subtitle" color="textSubtle">‹</Text></Pressable>
          <Pressable onPress={() => setMonthOffset((o) => o + 1)} hitSlop={8}><Text variant="subtitle" color="textSubtle">›</Text></Pressable>
        </View>}>{FR_MONTHS[grid.month]} {grid.year}</SectionTitle>
        <View style={{ flexDirection: 'row' }}>
          {WEEK_HEAD.map((h, i) => (<Text key={i} variant="caption" color="textSubtle" style={{ flex: 1, textAlign: 'center' }}>{h}</Text>))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing[2] }}>
          {grid.cells.map((cell, i) => {
            if (!cell) return <View key={i} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />;
            const types = actsByDay.get(cell.key) ?? [];
            const isToday = cell.key === dayKey(now);
            const isSelected = cell.key === selectedKey;
            return (
              <Pressable key={i} onPress={() => setSelectedKey(cell.key)} style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2 }}>
                <View style={{ flex: 1, borderRadius: 10, backgroundColor: isSelected ? 'rgba(45,127,249,0.22)' : types.length > 0 ? 'rgba(45,127,249,0.12)' : colors.surfaceElevated, borderWidth: isSelected || isToday ? 1.5 : 0, borderColor: isSelected ? colors.primary : colors.accentData, alignItems: 'center', paddingTop: 4 }}>
                  <Text variant="caption" style={{ color: isToday ? colors.accentData : isSelected ? colors.primary : colors.textMuted, fontWeight: isToday || isSelected ? '800' : '400' }}>{cell.day}</Text>
                  <View style={{ flexDirection: 'row', gap: 2, position: 'absolute', bottom: 4 }}>
                    {types.slice(0, 3).map((tp, j) => (<View key={j} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: ACT_COLOR[tp] }} />))}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {/* Selected-day timeline */}
      <Card>
        <SectionTitle>{selectedKey === dayKey(now) ? t('sport.calendar.today') : formatDate(`${selectedKey}T12:00:00`)}</SectionTitle>
        {timeline.length > 0 ? (
          timeline.map((it, i) => {
            const row = (
              <View style={{ flexDirection: 'row', gap: spacing[3], alignItems: 'center', paddingVertical: spacing[2] }}>
                <Text variant="caption" color="textSubtle" style={{ width: 44 }}>{it.time}</Text>
                <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 16 }}>{it.icon}</Text></View>
                <Text variant="body" style={{ flex: 1 }}>{it.label}</Text>
              </View>
            );
            return it.onPress ? (
              <Pressable key={i} onPress={it.onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                {row}
              </Pressable>
            ) : (
              <View key={i}>{row}</View>
            );
          })
        ) : (
          <Text variant="body" color="textMuted">{t('sport.calendar.timelineEmpty')}</Text>
        )}
        <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[3] }}>
          <View style={{ flex: 1 }}>
            <Button
              label={t('sport.calendar.planSession')}
              variant="secondary"
              onPress={() => router.push({ pathname: '/sport/planning', params: { date: selectedKey } })}
              fullWidth
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={t('sport.calendar.planMeal')}
              variant="secondary"
              onPress={() => router.push({ pathname: '/nutrition/meal/new', params: { date: selectedKey } })}
              fullWidth
            />
          </View>
        </View>
      </Card>

      {/* Deadlines */}
      {deadlines.length > 0 ? (
        <Card>
          <SectionTitle>{t('sport.calendar.deadlinesHeading')}</SectionTitle>
          {deadlines.map((d, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3], borderBottomWidth: i < deadlines.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
              <Text style={{ fontSize: 16 }}>{d.icon}</Text>
              <Text variant="body" style={{ flex: 1 }}>{d.label}</Text>
              <Text variant="caption" color="textSubtle">{formatDate(d.date)}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {/* Active challenges */}
      {activeChallenges.length > 0 ? (
        <Card>
          <SectionTitle>{t('sport.calendar.challengesHeading')}</SectionTitle>
          {activeChallenges.map((c, i) => (
            <View key={i} style={{ marginTop: i > 0 ? spacing[3] : 0 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text variant="body">{c.title}</Text><Text variant="caption" color="textMuted">{c.pct} %</Text></View>
              <View style={{ height: 7, borderRadius: 5, backgroundColor: colors.surfaceElevated, overflow: 'hidden', marginTop: 6 }}><View style={{ width: `${c.pct}%`, height: 7, backgroundColor: colors.accentMobility }} /></View>
            </View>
          ))}
        </Card>
      ) : null}

      {/* Weekly history */}
      <View>
        <SectionTitle>{t('sport.calendar.historyHeading')}</SectionTitle>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing[3] }}>
          {weeks.map((w, i) => (
            <View key={i} style={{ width: 150, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing[3] }}>
              <Text variant="caption" color="textSubtle">{w.label}</Text>
              <HistRow label={t('sport.calendar.kpi.sessions')} value={`${w.sessions}`} />
              <HistRow label={t('sport.calendar.kpi.recovery')} value={w.rec != null ? `${w.rec} %` : '—'} />
              <HistRow label={t('sport.calendar.kpi.weight')} value={w.weight != null ? `${w.weight.toFixed(1)}` : '—'} />
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Analyse */}
      <View style={{ borderRadius: radii.xl, borderWidth: 1, borderColor: 'rgba(139,92,246,0.28)', backgroundColor: 'rgba(139,92,246,0.10)', padding: spacing[5] }}>
        <View style={{ flexDirection: 'row', gap: spacing[2], alignItems: 'center' }}><Icon name="brain" size={20} color={colors.info} /><Text variant="heading">{t('sport.calendar.analysisHeading')}</Text></View>
        <Text variant="body" color="textMuted" style={{ marginTop: spacing[2], lineHeight: 22 }}>
          {acwr.zone === 'risque' || acwr.zone === 'élevé' ? t('sport.calendar.analysisHighLoad') : t('sport.calendar.analysisBalanced')}
          {deadlines.length > 0 ? t('sport.calendar.analysisNextDeadline', { label: deadlines[0]!.label, date: formatDate(deadlines[0]!.date) }) : t('sport.calendar.analysisNoDeadline')}
        </Text>
      </View>

      <View style={{ alignItems: 'flex-start' }}>
        <Pressable onPress={() => router.back()}><Text variant="caption" color="primary">‹ {t('common.back')}</Text></Pressable>
      </View>
    </Screen>
  );
}

function HistRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
      <Text variant="caption" color="textMuted">{label}</Text>
      <Text variant="caption" style={{ fontWeight: '700' }}>{value}</Text>
    </View>
  );
}
