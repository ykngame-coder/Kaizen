import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Badge, Card, Gradient, Screen, Text, useTheme, type BadgeTone } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { computeAcwr, computeRecoveryScore, sleepTrend } from '@supotsu/engines';
import { useActivities, useHealthMetrics } from '@/lib/data/queries';
import { useAuth } from '@/features/auth/AuthProvider';

const DAY_MS = 86_400_000;

/** Decimal hours → "7h45". */
function fmtSleep(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h${String(m).padStart(2, '0')}`;
}

/** A 0-100 score → plain-language band + badge tone. */
function scoreBand(value: number): { label: string; tone: BadgeTone } {
  if (value >= 85) return { label: 'Excellent', tone: 'success' };
  if (value >= 70) return { label: 'Bon', tone: 'info' };
  if (value >= 50) return { label: 'Moyen', tone: 'warning' };
  return { label: 'Faible', tone: 'error' };
}

function greetingName(email: string | undefined): string {
  const handle = (email ?? '').split('@')[0] ?? '';
  const cleaned = handle.replace(/[._-]+/g, ' ').trim().split(' ')[0] ?? '';
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : '';
}

/** Proportional bar row for the mini charts (mockup style). */
function MiniBars({ values, color, height = 44 }: { values: number[]; color: string; height?: number }): React.JSX.Element {
  const { colors } = useTheme();
  const max = Math.max(1, ...values);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 5, height }}>
      {values.map((v, i) => (
        <View
          key={i}
          style={{
            width: 9,
            height: Math.max(4, (v / max) * height),
            borderRadius: 3,
            backgroundColor: v > 0 ? color : colors.surfaceElevated,
          }}
        />
      ))}
    </View>
  );
}

const QUICK_LINKS: { label: string; icon: string; path: Href }[] = [
  { label: 'Muscles', icon: '💪', path: '/muscles' },
  { label: 'Nutrition', icon: '◍', path: '/nutrition' },
  { label: 'Objectifs', icon: '🎯', path: '/goals' },
  { label: 'Habitudes', icon: '✓', path: '/wellness' },
  { label: 'Statistiques', icon: '📊', path: '/analytics' },
  { label: 'Calendrier', icon: '🗓', path: '/calendar' },
  { label: 'Récup neuro', icon: '✦', path: '/neuro-recovery' },
  { label: 'Notifications', icon: '🔔', path: '/notifications' },
];

/**
 * Dashboard — faithful to the mockup (#3): greeting + avatar, then dark stat
 * cards in order (Récupération → Sommeil → Charge d'entraînement), each with its
 * own accent/chart. Numbers are real; the "vs hier" delta is computed against
 * yesterday's recovery. A compact quick-links grid reaches the other sections.
 */
export function DashboardScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { data: activities = [] } = useActivities();
  const { data: health = [] } = useHealthMetrics();
  const asOf = new Date().toISOString();

  const recovery = useMemo(() => {
    const today = computeRecoveryScore(health, asOf);
    if (today.confidence === 'to_confirm') return null;
    const yIso = new Date(new Date(asOf).getTime() - DAY_MS).toISOString();
    const y = computeRecoveryScore(health, yIso);
    return { value: today.value, delta: y.confidence !== 'to_confirm' ? today.value - y.value : null };
  }, [health, asOf]);

  const nights = useMemo(
    () => [...sleepTrend(health, asOf, 7)].sort((a, b) => a.date.localeCompare(b.date)),
    [health, asOf],
  );
  const lastNight = nights[nights.length - 1];

  const acwr = useMemo(() => computeAcwr(activities, asOf), [activities, asOf]);
  const loadBars = useMemo(() => {
    const buckets = new Array(7).fill(0) as number[];
    const start = new Date(asOf).getTime() - 6 * DAY_MS;
    for (const a of activities) {
      const idx = Math.floor((new Date(a.startedAt).getTime() - start) / DAY_MS);
      if (idx >= 0 && idx < 7) buckets[idx] += a.durationSec / 60;
    }
    return buckets;
  }, [activities, asOf]);
  const LOAD_ZONE: Record<string, { label: string; tone: BadgeTone }> = {
    'sous-charge': { label: 'Sous-charge', tone: 'info' },
    optimal: { label: 'Optimale', tone: 'success' },
    'élevé': { label: 'Élevée', tone: 'warning' },
    risque: { label: 'Risque', tone: 'error' },
  };
  const zone = acwr.zone ? LOAD_ZONE[acwr.zone] : null;

  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async (): Promise<void> => {
    setRefreshing(true);
    await qc.invalidateQueries();
    setRefreshing(false);
  };

  const firstName = greetingName(user?.email);
  const initial = (firstName || user?.email || 'K').charAt(0).toUpperCase();

  return (
    <Screen scroll onRefresh={onRefresh} refreshing={refreshing}>
      {/* Header: greeting + avatar */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text variant="title">Bonjour{firstName ? ` ${firstName}` : ''} 👋</Text>
          <Text variant="caption" color="textMuted">
            Voici ton résumé du jour.
          </Text>
        </View>
        <Pressable onPress={() => router.push('/profile')}>
          <View style={{ width: 46, height: 46, borderRadius: 23, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
            <Gradient fill />
            <Text variant="subtitle" color="onPrimary">
              {initial}
            </Text>
          </View>
        </Pressable>
      </View>

      {/* 1 — Score de récupération */}
      <Pressable onPress={() => router.push('/analytics')} style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}>
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text variant="caption" color="textMuted">
                Score de récupération
              </Text>
              <Text variant="display" style={{ marginTop: spacing[1] }}>
                {recovery ? recovery.value : '—'}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: spacing[1] }}>
                {recovery ? <Badge label={scoreBand(recovery.value).label} tone={scoreBand(recovery.value).tone} /> : null}
                {recovery?.delta != null && recovery.delta !== 0 ? (
                  <Text variant="caption" color={recovery.delta > 0 ? 'accentData' : 'error'}>
                    {recovery.delta > 0 ? '+' : ''}
                    {recovery.delta} vs hier
                  </Text>
                ) : null}
              </View>
            </View>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: colors.surfaceElevated,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: colors.accentData, fontSize: 18 }}>♥</Text>
            </View>
          </View>
        </Card>
      </Pressable>

      {/* 2 — Sommeil */}
      <Pressable onPress={() => router.push('/sleep')} style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}>
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text variant="caption" color="textMuted">
                Sommeil
              </Text>
              <Text variant="display" style={{ marginTop: spacing[1] }}>
                {lastNight ? fmtSleep(lastNight.hours) : '—'}
              </Text>
              {lastNight ? (
                <View style={{ marginTop: spacing[1], flexDirection: 'row' }}>
                  <Badge label={scoreBand(lastNight.score).label} tone={scoreBand(lastNight.score).tone} />
                </View>
              ) : null}
            </View>
            {nights.length > 0 ? <MiniBars values={nights.map((n) => n.hours)} color={colors.primary} /> : null}
          </View>
        </Card>
      </Pressable>

      {/* 3 — Charge d'entraînement */}
      <Pressable onPress={() => router.push('/load')} style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}>
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text variant="caption" color="textMuted">
              Charge d'entraînement
            </Text>
            {zone ? <Badge label={zone.label} tone={zone.tone} /> : null}
          </View>
          <Text variant="subtitle" style={{ marginTop: spacing[1] }}>
            {zone ? zone.label : 'À calibrer'}
            {acwr.ratio != null ? `  ·  ratio ${acwr.ratio.toFixed(2)}` : ''}
          </Text>
          <View style={{ marginTop: spacing[3] }}>
            <MiniBars values={loadBars} color={colors.accentEndurance} height={64} />
          </View>
        </Card>
      </Pressable>

      {/* Quick access to the other sections */}
      <Card>
        <Text variant="heading">Explorer</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing[2] }}>
          {QUICK_LINKS.map((l) => (
            <Pressable
              key={l.label}
              onPress={() => router.push(l.path)}
              style={({ pressed }) => ({ width: '25%', alignItems: 'center', gap: 4, paddingVertical: spacing[2], opacity: pressed ? 0.6 : 1 })}
            >
              <Text style={{ fontSize: 22 }}>{l.icon}</Text>
              <Text variant="caption" color="textMuted" style={{ textAlign: 'center' }}>
                {l.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Card>
    </Screen>
  );
}
