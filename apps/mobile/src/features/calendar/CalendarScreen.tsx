import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, Screen, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { ActivityType } from '@supotsu/core';
import { computeAcwr, computeRecoveryScore, sleepTrend, sumDay } from '@supotsu/engines';
import { useActivities, useChallenges, useGoals, useHealthMetrics, useNutritionEntries } from '@/lib/data/queries';
import { formatDate } from '@/lib/format';

const DAY_MS = 86_400_000;
const FR_MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const WEEK_HEAD = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const ACT_COLOR: Record<ActivityType, string> = {
  strength: '#ff4d67', running: '#ff8b38', cycling: '#3bcbff', swimming: '#2d7ff9', hyrox: '#8b5cf6',
  mobility: '#2be38b', yoga: '#19d3a2', walking: '#aab6c5', cross_training: '#f5b742', other: '#748092',
};
const ACT_ICON: Record<ActivityType, string> = {
  strength: '🏋️', running: '🏃', cycling: '🚴', swimming: '🏊', hyrox: '🔥', mobility: '🧘', yoga: '🧘', walking: '🚶', cross_training: '🤸', other: '⚡',
};
const ACT_LABEL: Record<ActivityType, string> = {
  strength: 'Musculation', running: 'Course', cycling: 'Vélo', swimming: 'Natation', hyrox: 'Hyrox', mobility: 'Mobilité', yoga: 'Yoga', walking: 'Marche', cross_training: 'Cross-training', other: 'Activité',
};
const MEAL_ICON: Record<string, string> = { breakfast: '🥣', lunch: '🍗', dinner: '🍝', snack: '🍎' };
const dayKey = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hhmm = (iso: string): string => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
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
  const router = useRouter();
  const { colors } = useTheme();
  const { data: activities = [] } = useActivities();
  const { data: nutrition = [] } = useNutritionEntries();
  const { data: goals = [] } = useGoals();
  const { data: challenges = [] } = useChallenges();
  const { data: health = [] } = useHealthMetrics();
  const now = new Date();
  const asOf = now.toISOString();
  const [monthOffset, setMonthOffset] = useState(0);

  const actsByDay = useMemo(() => {
    const map = new Map<string, ActivityType[]>();
    for (const a of activities) {
      const k = a.startedAt.slice(0, 10);
      const arr = map.get(k) ?? [];
      arr.push(a.type);
      map.set(k, arr);
    }
    return map;
  }, [activities]);

  const recovery = useMemo(() => computeRecoveryScore(health, asOf), [health, asOf]);
  const acwr = useMemo(() => computeAcwr(activities, asOf), [activities, asOf]);
  const todayActs = activities.filter((a) => a.startedAt.slice(0, 10) === dayKey(now));
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

  const timeline = useMemo(() => {
    const items: { time: string; icon: string; label: string; sort: number }[] = [];
    for (const a of todayActs) items.push({ time: hhmm(a.startedAt), icon: ACT_ICON[a.type], label: `${ACT_LABEL[a.type]} · ${Math.round(a.durationSec / 60)} min`, sort: new Date(a.startedAt).getTime() });
    for (const e of nutrition) if (e.loggedAt.slice(0, 10) === dayKey(now)) items.push({ time: hhmm(e.loggedAt), icon: MEAL_ICON[e.mealType] ?? '🍽', label: `${e.description} · ${Math.round(e.kcal)} kcal`, sort: new Date(e.loggedAt).getTime() });
    return items.sort((a, b) => a.sort - b.sort);
  }, [todayActs, nutrition, now]);

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
      const sessions = activities.filter((a) => { const t = new Date(a.startedAt).getTime(); return t >= start && t < end; }).length;
      const recVals: number[] = [];
      for (let d = 0; d < 7; d += 1) { const r = computeRecoveryScore(health, new Date(start + d * DAY_MS).toISOString()); if (r.confidence !== 'to_confirm') recVals.push(r.value); }
      const w = health.filter((m) => m.type === 'weight' && new Date(m.measuredAt).getTime() < end).sort((a, b) => a.measuredAt.localeCompare(b.measuredAt)).at(-1)?.value;
      return { label: i === 0 ? 'Cette semaine' : `Il y a ${i} sem.`, sessions, rec: recVals.length ? Math.round(mean(recVals)) : null, weight: w };
    });
  }, [activities, health, now]);

  return (
    <Screen scroll>
      <Text variant="title">Calendrier</Text>
      <Text variant="caption" color="textSubtle">Planification • Historique • Prévisions</Text>

      {/* Résumé du jour */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] }}>
        <Kpi label="Recovery" value={recovery.confidence !== 'to_confirm' ? `${recovery.value} %` : '—'} color={colors.accentData} />
        <Kpi label="Charge" value={acwr.ratio != null ? acwr.ratio.toFixed(2) : '—'} />
        <Kpi label="Séances" value={`${todayActs.length}`} />
        <Kpi label="Sommeil" value={lastNight ? `${Math.floor(lastNight.hours)} h ${String(Math.round((lastNight.hours % 1) * 60)).padStart(2, '0')}` : '—'} />
        <Kpi label="Nutrition" value={todayKcal > 0 ? `${Math.round(todayKcal)} kcal` : '—'} />
        <Kpi label="Date" value={`${now.getDate()} ${FR_MONTHS[now.getMonth()]!.slice(0, 4)}.`} />
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
            return (
              <View key={i} style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2 }}>
                <View style={{ flex: 1, borderRadius: 10, backgroundColor: types.length > 0 ? 'rgba(45,127,249,0.12)' : colors.surfaceElevated, borderWidth: isToday ? 1.5 : 0, borderColor: colors.primary, alignItems: 'center', paddingTop: 4 }}>
                  <Text variant="caption" style={{ color: isToday ? colors.primary : colors.textMuted, fontWeight: isToday ? '800' : '400' }}>{cell.day}</Text>
                  <View style={{ flexDirection: 'row', gap: 2, position: 'absolute', bottom: 4 }}>
                    {types.slice(0, 3).map((t, j) => (<View key={j} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: ACT_COLOR[t] }} />))}
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </Card>

      {/* Today timeline */}
      {timeline.length > 0 ? (
        <Card>
          <SectionTitle>Aujourd'hui</SectionTitle>
          {timeline.map((it, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: spacing[3], alignItems: 'center', paddingVertical: spacing[2] }}>
              <Text variant="caption" color="textSubtle" style={{ width: 44 }}>{it.time}</Text>
              <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 16 }}>{it.icon}</Text></View>
              <Text variant="body" style={{ flex: 1 }}>{it.label}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {/* Deadlines */}
      {deadlines.length > 0 ? (
        <Card>
          <SectionTitle>Objectifs & échéances</SectionTitle>
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
          <SectionTitle>Défis en cours</SectionTitle>
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
        <SectionTitle>Historique hebdomadaire</SectionTitle>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing[3] }}>
          {weeks.map((w, i) => (
            <View key={i} style={{ width: 150, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing[3] }}>
              <Text variant="caption" color="textSubtle">{w.label}</Text>
              <HistRow label="Séances" value={`${w.sessions}`} />
              <HistRow label="Recovery" value={w.rec != null ? `${w.rec} %` : '—'} />
              <HistRow label="Poids" value={w.weight != null ? `${w.weight.toFixed(1)}` : '—'} />
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Analyse */}
      <View style={{ borderRadius: radii.xl, borderWidth: 1, borderColor: 'rgba(139,92,246,0.28)', backgroundColor: 'rgba(139,92,246,0.10)', padding: spacing[5] }}>
        <View style={{ flexDirection: 'row', gap: spacing[2], alignItems: 'center' }}><Text style={{ fontSize: 20 }}>🧠</Text><Text variant="heading">Analyse Kaizen</Text></View>
        <Text variant="body" color="textMuted" style={{ marginTop: spacing[2], lineHeight: 22 }}>
          {acwr.zone === 'risque' || acwr.zone === 'élevé' ? 'Ta charge récente est élevée — pense à insérer une journée de récupération. ' : 'Ta charge est bien répartie. '}
          {deadlines.length > 0 ? `Prochaine échéance : ${deadlines[0]!.label} (${formatDate(deadlines[0]!.date)}).` : 'Ajoute un objectif avec une échéance pour un suivi calendaire.'}
        </Text>
      </View>

      <View style={{ alignItems: 'flex-start' }}>
        <Pressable onPress={() => router.back()}><Text variant="caption" color="primary">‹ Retour</Text></Pressable>
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
