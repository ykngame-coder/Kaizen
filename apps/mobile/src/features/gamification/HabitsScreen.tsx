import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, Fab, Screen, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { BackButton } from '@/features/navigation/BackButton';
import { useHabitLogs, useHabits, useLogHabit } from '@/lib/data/queries';

const DAY_MS = 86_400_000;
const dayKey = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const PILLAR_ICON: Record<string, string> = {
  sleep: '😴', nutrition: '🥗', training: '🏋️', mind: '🧘', recovery: '💧', habits: '✅', movement: '🚶', mobility: '🧘', hydration: '💧',
};
const iconFor = (pillar: string, name: string): string => {
  const n = name.toLowerCase();
  if (n.includes('eau') || n.includes('hydrat')) return '💧';
  if (n.includes('lecture') || n.includes('lire')) return '📖';
  if (n.includes('sommeil') || n.includes('couch')) return '😴';
  if (n.includes('mobil') || n.includes('étir') || n.includes('stretch')) return '🧘';
  if (n.includes('marche') || n.includes('pas')) return '🚶';
  if (n.includes('muscu') || n.includes('entra') || n.includes('sport')) return '🏋️';
  return PILLAR_ICON[pillar] ?? '✅';
};

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

function Kpi({ icon, value, sub, label, color }: { icon: string; value: string; sub?: string; label: string; color?: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ flexGrow: 1, flexBasis: '45%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing[4] }}>
      <Text style={{ fontSize: 18 }}>{icon}</Text>
      <Text variant="data" style={{ marginTop: spacing[2], color: color ?? colors.text }}>{value}{sub ? <Text variant="caption" color="textSubtle">{sub}</Text> : null}</Text>
      <Text variant="caption" color="textSubtle" style={{ marginTop: 2 }}>{label}</Text>
    </View>
  );
}

/** Habitudes & Discipline (mockup #9) — daily checklist, streaks, 30-day calendar. */
export function HabitsScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { data: habits = [] } = useHabits();
  const { data: logs = [] } = useHabitLogs();
  const logHabit = useLogHabit();
  const now = new Date();
  const todayK = dayKey(now);

  const active = habits.filter((h) => !h.archivedAt);

  // Logs indexed by day, and per-habit day-sets.
  const { doneToday, byDay, perHabitDays } = useMemo(() => {
    const doneT = new Set<string>();
    const day = new Map<string, Set<string>>(); // dayKey -> set of habitIds done
    const perHabit = new Map<string, Set<string>>(); // habitId -> set of dayKeys
    for (const l of logs) {
      const k = dayKey(new Date(l.completedAt));
      if (k === todayK) doneT.add(l.habitId);
      if (!day.has(k)) day.set(k, new Set());
      day.get(k)!.add(l.habitId);
      if (!perHabit.has(l.habitId)) perHabit.set(l.habitId, new Set());
      perHabit.get(l.habitId)!.add(k);
    }
    return { doneToday: doneT, byDay: day, perHabitDays: perHabit };
  }, [logs, todayK]);

  const denom = Math.max(1, active.length);

  // 30-day completion calendar (oldest → today).
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

  // Streaks per habit + best.
  const streaks = useMemo(() => active.map((h) => ({ habit: h, streak: streakOf(perHabitDays.get(h.id) ?? new Set(), now) })).sort((a, b) => b.streak - a.streak), [active, perHabitDays, now]);
  const bestStreak = streaks[0]?.streak ?? 0;
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
        <BackButton />
        <Text variant="title">Habitudes & discipline</Text>
        <Text variant="caption" color="textSubtle">Discipline • Séries • Progression</Text>

        {/* KPI */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] }}>
          <Kpi icon="✅" value={`${doneToday.size}`} sub={`/${active.length}`} label="Validées aujourd'hui" color={colors.accentData} />
          <Kpi icon="⚡" value={`${bestStreak} j`} label="Meilleure série" />
          <Kpi icon="🎯" value={`${success} %`} label="Réussite · 30 j" />
          <Kpi icon="🏅" value={`${active.length}`} label="Habitudes actives" />
        </View>

        {/* 30-day calendar */}
        <Card>
          <Text variant="heading">Progression · 30 jours</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing[3] }}>
            {cal.map((c, i) => (
              <View key={i} style={{ width: `${(100 - 6 * 5) / 6}%`, aspectRatio: 1, borderRadius: 6, backgroundColor: cellColor(c.frac), borderWidth: c.isToday ? 1.5 : 0, borderColor: colors.primary }} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: spacing[3], marginTop: spacing[3] }}>
            <Legend color={colors.accentData} label="Tout fait" />
            <Legend color={colors.warning} label="Partiel" />
            <Legend color={colors.surfaceElevated} label="Rien / à venir" />
          </View>
        </Card>

        {/* Daily checklist */}
        <Card>
          <Text variant="heading">Check-list du jour</Text>
          {active.length === 0 ? (
            <Text variant="body" color="textMuted" style={{ marginTop: spacing[2] }}>Crée une habitude simple (eau, mobilité, lecture, sommeil…) pour construire ta régularité.</Text>
          ) : (
            <View style={{ marginTop: spacing[1] }}>
              {active.map((h, i) => {
                const done = doneToday.has(h.id);
                return (
                  <View key={h.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3], borderBottomWidth: i < active.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                    <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 17 }}>{iconFor(h.pillar, h.name)}</Text></View>
                    <Text variant="body" style={{ flex: 1, color: done ? colors.textMuted : colors.text }}>{h.name}</Text>
                    <Text variant="caption" style={{ color: done ? colors.accentData : colors.textSubtle, fontWeight: '600' }}>{done ? 'Fait' : 'À faire'}</Text>
                    <Pressable onPress={() => { if (!done) logHabit.mutate(h.id); }} disabled={done || logHabit.isPending} hitSlop={8}>
                      <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? colors.accentData : 'transparent', borderWidth: done ? 0 : 2, borderColor: colors.textSubtle }}>
                        {done ? <Text style={{ color: '#04140b', fontSize: 14, fontWeight: '800' }}>✓</Text> : null}
                      </View>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}
        </Card>

        {/* Score discipline */}
        <Card>
          <Text variant="heading">Score discipline</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[4], marginTop: spacing[2] }}>
            <Text style={{ fontSize: 48, fontWeight: '800', letterSpacing: -1, color: colors.text, flexShrink: 0 }}>{disciplineScore}<Text variant="subtitle" color="textSubtle">/100</Text></Text>
            <Text variant="body" color="textMuted" style={{ flex: 1, lineHeight: 20 }}>
              {disciplineScore >= 80 ? 'Excellent — tu es très régulier.' : disciplineScore >= 50 ? 'Bonne régularité, continue sur ta lancée.' : 'Valide tes habitudes du jour pour faire grimper ton score.'}
            </Text>
          </View>
        </Card>

        {/* Streaks */}
        {streaks.length > 0 ? (
          <Card>
            <Text variant="heading">Séries en cours</Text>
            <View style={{ gap: spacing[3], marginTop: spacing[3] }}>
              {streaks.map(({ habit, streak }) => (
                <View key={habit.id}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text variant="body">{iconFor(habit.pillar, habit.name)}  {habit.name}</Text>
                    <Text variant="body" style={{ fontWeight: '700' }}>{streak} j</Text>
                  </View>
                  <View style={{ height: 8, borderRadius: 6, backgroundColor: colors.surfaceElevated, overflow: 'hidden', marginTop: 6 }}>
                    <View style={{ width: `${Math.min(100, (streak / 30) * 100)}%`, height: 8, borderRadius: 6, backgroundColor: colors.accentData }} />
                  </View>
                </View>
              ))}
            </View>
          </Card>
        ) : null}
      </Screen>
      <Fab icon="+" accessibilityLabel="Nouvelle habitude" onPress={() => router.push('/profile/habit/new')} />
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
