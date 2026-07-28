import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Button, Card, EmptyState, Screen, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { computeCircadianProfile, computeRecoveryScore } from '@supotsu/engines';
import {
  useHabitLogs,
  useHabits,
  useHealthMetrics,
  useRecords,
  useSleepSessions,
} from '@/lib/data/queries';

type Tone = 'success' | 'info' | 'warning' | 'error';

interface Notif {
  id: string;
  icon: string;
  tone: Tone;
  title: string;
  detail: string;
  when: string;
  path: Href;
}

const DAY_MS = 86_400_000;
const dayKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function relative(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
  if (days <= 0) return "Aujourd'hui";
  if (days === 1) return 'Hier';
  return `Il y a ${days} j`;
}
function bandTone(v: number): Tone {
  if (v >= 85) return 'success';
  if (v >= 70) return 'info';
  if (v >= 50) return 'warning';
  return 'error';
}
function hhmmWindow(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (h === undefined || m === undefined) return hhmm;
  const base = h * 60 + m;
  const fmt = (min: number): string => {
    const mm = ((min % 1440) + 1440) % 1440;
    return `${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`;
  };
  return `${fmt(base - 15)} – ${fmt(base + 15)}`;
}

/**
 * Notifications — derived deterministically from the user's own data (recovery,
 * records, circadian bedtime, habit reminders, sleep), each linking to where it
 * came from. Nothing is invented; an empty data set yields an empty list.
 */
export function NotificationsScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { data: health = [] } = useHealthMetrics();
  const { data: records = [] } = useRecords();
  const { data: sessions = [] } = useSleepSessions();
  const { data: habits = [] } = useHabits();
  const { data: habitLogs = [] } = useHabitLogs();
  const [cleared, setCleared] = useState(false);

  const notifs = useMemo<Notif[]>(() => {
    const asOf = new Date().toISOString();
    const out: Notif[] = [];

    const recovery = computeRecoveryScore(health, asOf);
    if (recovery.confidence !== 'to_confirm') {
      out.push({
        id: 'recovery',
        icon: '♥',
        tone: bandTone(recovery.value),
        title: `Score de récupération : ${recovery.value}`,
        detail: 'Basé sur ta VFC, ta FC de repos et ton sommeil.',
        when: "Aujourd'hui",
        path: '/analytics',
      });
    }

    const lastRecord = [...records].sort((a, b) => b.achievedAt.localeCompare(a.achievedAt))[0];
    if (lastRecord) {
      out.push({
        id: 'record',
        icon: '🏆',
        tone: 'success',
        title: 'Record personnel',
        detail: `${lastRecord.label} — ${lastRecord.value} ${lastRecord.unit}`,
        when: relative(lastRecord.achievedAt),
        path: '/records',
      });
    }

    const circadian = computeCircadianProfile(health, asOf, {
      tzOffsetMinutes: -new Date().getTimezoneOffset(),
    });
    if (circadian.value) {
      out.push({
        id: 'bedtime',
        icon: '🌙',
        tone: 'info',
        title: 'Heure de coucher optimale',
        detail: hhmmWindow(circadian.value.idealBedtime),
        when: "Aujourd'hui",
        path: '/circadian',
      });
    }

    const todayKey = dayKey(new Date());
    const doneToday = new Set(
      habitLogs.filter((l) => dayKey(new Date(l.completedAt)) === todayKey).map((l) => l.habitId),
    );
    const pending = habits.filter((h) => !h.archivedAt && !doneToday.has(h.id));
    if (pending.length > 0) {
      out.push({
        id: 'habits',
        icon: '✓',
        tone: 'warning',
        title: pending.length === 1 ? 'Habitude à valider' : `${pending.length} habitudes à valider`,
        detail: pending.map((h) => h.name).slice(0, 3).join(' · '),
        when: "Aujourd'hui",
        path: '/',
      });
    }

    const lastNight = [...sessions].sort((a, b) => b.endedAt.localeCompare(a.endedAt))[0];
    if (lastNight) {
      const h = Math.floor(lastNight.asleepMin / 60);
      const m = String(Math.round(lastNight.asleepMin % 60)).padStart(2, '0');
      out.push({
        id: 'sleep',
        icon: '😴',
        tone: 'info',
        title: 'Nuit enregistrée',
        detail: `${h}h${m} de sommeil`,
        when: relative(lastNight.endedAt),
        path: '/sleep',
      });
    }

    return out;
  }, [health, records, sessions, habits, habitLogs]);

  const toneColor: Record<Tone, string> = {
    success: colors.success,
    info: colors.info,
    warning: colors.warning,
    error: colors.error,
  };

  return (
    <Screen scroll>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="title">Notifications</Text>
        {!cleared && notifs.length > 0 ? (
          <Pressable onPress={() => setCleared(true)} hitSlop={8}>
            <Text variant="caption" color="primary">
              Tout marquer comme lu
            </Text>
          </Pressable>
        ) : null}
      </View>

      {cleared || notifs.length === 0 ? (
        <EmptyState
          icon="🔔"
          title={cleared ? 'Tout est à jour' : 'Rien de neuf'}
          message="Tes alertes sont générées à partir de tes données (récupération, records, sommeil, habitudes)."
        />
      ) : (
        <View style={{ gap: spacing[2] }}>
          {notifs.map((n) => (
            <Pressable
              key={n.id}
              onPress={() => router.push(n.path)}
              style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
            >
              <Card style={{ borderLeftWidth: 3, borderLeftColor: toneColor[n.tone] }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
                  <Text variant="subtitle">{n.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text variant="body">{n.title}</Text>
                    <Text variant="caption" color="textMuted">
                      {n.detail}
                    </Text>
                  </View>
                  <Text variant="caption" color="textSubtle">
                    {n.when}
                  </Text>
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
      )}

      <View style={{ alignItems: 'flex-start' }}>
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
