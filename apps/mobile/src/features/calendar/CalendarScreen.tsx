import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, Gradient, Screen, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { useActivities, useSleepSessions, useWorkouts } from '@/lib/data/queries';
import { activityLabel, formatDuration } from '@/lib/format';

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MONTHS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

/** Local YYYY-MM-DD key (device timezone). */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const clock = (iso: string): string =>
  new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/**
 * Calendar — a month grid marking days with logged data (activities, workouts,
 * nights), plus a read-out of today's events. Everything is derived from the
 * user's real data; empty days simply carry no dot.
 */
export function CalendarScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { data: activities = [] } = useActivities();
  const { data: workouts = [] } = useWorkouts();
  const { data: sessions = [] } = useSleepSessions();

  const [offset, setOffset] = useState(0); // months from the current one
  const today = new Date();
  const todayKey = dayKey(today);
  const view = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const year = view.getFullYear();
  const month = view.getMonth();

  // Days (this month) that carry any logged data → a dot.
  const activeDays = useMemo(() => {
    const set = new Set<string>();
    for (const a of activities) set.add(dayKey(new Date(a.startedAt)));
    for (const w of workouts) set.add(dayKey(new Date(w.completedAt ?? w.createdAt)));
    for (const s of sessions) set.add(dayKey(new Date(s.endedAt)));
    return set;
  }, [activities, workouts, sessions]);

  // Grid: Monday-first. Leading blanks before day 1.
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // 0 = Monday
  const cells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  // Today's events (only meaningful when viewing the current month or always
  // for the actual "today", regardless of the month being browsed).
  const todaysActivities = activities
    .filter((a) => dayKey(new Date(a.startedAt)) === todayKey)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const lastNight = sessions.find((s) => dayKey(new Date(s.endedAt)) === todayKey);
  const todaysWorkouts = workouts.filter(
    (w) => w.completedAt && dayKey(new Date(w.completedAt)) === todayKey,
  );
  const hasToday = todaysActivities.length + todaysWorkouts.length + (lastNight ? 1 : 0) > 0;

  return (
    <Screen scroll>
      <Text variant="title">Calendrier</Text>

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Pressable onPress={() => setOffset((o) => o - 1)} hitSlop={10}>
            <Text variant="subtitle" color="textMuted">‹</Text>
          </Pressable>
          <Text variant="heading">
            {MONTHS[month]} {year}
          </Text>
          <Pressable onPress={() => setOffset((o) => o + 1)} hitSlop={10}>
            <Text variant="subtitle" color="textMuted">›</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', marginTop: spacing[3] }}>
          {WEEKDAYS.map((d, i) => (
            <Text
              key={i}
              variant="caption"
              color="textSubtle"
              style={{ flex: 1, textAlign: 'center' }}
            >
              {d}
            </Text>
          ))}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing[2] }}>
          {cells.map((day, i) => {
            if (day === null) return <View key={i} style={{ width: `${100 / 7}%`, height: 44 }} />;
            const key = dayKey(new Date(year, month, day));
            const isToday = key === todayKey;
            const active = activeDays.has(key);
            return (
              <View
                key={i}
                style={{ width: `${100 / 7}%`, height: 44, alignItems: 'center', justifyContent: 'center' }}
              >
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    overflow: 'hidden',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {isToday && <Gradient fill />}
                  <Text variant="body" color={isToday ? 'onPrimary' : 'text'}>
                    {day}
                  </Text>
                </View>
                <View
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: 2.5,
                    marginTop: 2,
                    backgroundColor: active ? colors.accentData : 'transparent',
                  }}
                />
              </View>
            );
          })}
        </View>
      </Card>

      <Text variant="heading">Aujourd'hui</Text>
      {!hasToday ? (
        <Card>
          <Text variant="body" color="textMuted">
            Aucun événement enregistré aujourd'hui.
          </Text>
        </Card>
      ) : (
        <View style={{ gap: spacing[2] }}>
          {lastNight && (
            <Pressable onPress={() => router.push('/sleep')}>
              <Card>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text variant="body">
                    {Math.floor(lastNight.asleepMin / 60)}h
                    {String(Math.round(lastNight.asleepMin % 60)).padStart(2, '0')} de sommeil
                  </Text>
                  <Text variant="caption" color="textMuted">
                    réveil {clock(lastNight.endedAt)}
                  </Text>
                </View>
              </Card>
            </Pressable>
          )}
          {todaysActivities.map((a) => (
            <Card key={a.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text variant="body">{activityLabel(a.type)}</Text>
                <Text variant="caption" color="textMuted">
                  {clock(a.startedAt)} · {formatDuration(a.durationSec)}
                </Text>
              </View>
            </Card>
          ))}
          {todaysWorkouts.map((w) => (
            <Card key={w.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text variant="body">{w.name}</Text>
                <Text variant="caption" color="textMuted">
                  {w.completedAt ? clock(w.completedAt) : ''}
                </Text>
              </View>
            </Card>
          ))}
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: spacing[2] }}>
        <Button label="+ Séance" onPress={() => router.push('/workout/new')} />
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
