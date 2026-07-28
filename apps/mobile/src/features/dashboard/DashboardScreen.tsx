import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, Gradient, Screen, Text, useTheme, type BadgeTone } from '@supotsu/ui';
import { spacing, radii } from '@supotsu/design-system';
import { buildDailySnapshot, computeAcwr, computeRecoveryScore, sleepTrend } from '@supotsu/engines';
import { useActivities, useHealthMetrics } from '@/lib/data/queries';
import { useAuth } from '@/features/auth/AuthProvider';
import { BadgesCard } from '@/features/gamification/BadgesCard';
import { HabitsCard } from '@/features/gamification/HabitsCard';
import { DailyBriefingCard } from './DailyBriefingCard';
import { NutritionWidget } from './NutritionWidget';
import { WeightWidget } from './WeightWidget';
import { MuscleWidget } from './MuscleWidget';

const DAY_MS = 86_400_000;

/** Decimal hours → "7h45" style. */
function fmtSleep(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h${String(m).padStart(2, '0')}`;
}

/** A 0-100 score → a plain-language band + a badge tone (Excellent…Faible). */
function scoreBand(value: number): { label: string; tone: BadgeTone } {
  if (value >= 85) return { label: 'Excellent', tone: 'success' };
  if (value >= 70) return { label: 'Bon', tone: 'info' };
  if (value >= 50) return { label: 'Moyen', tone: 'warning' };
  return { label: 'Faible', tone: 'error' };
}

/** First name from the account e-mail handle (no name field exists yet). */
function greetingName(email: string | undefined): string {
  const handle = (email ?? '').split('@')[0] ?? '';
  const cleaned = handle.replace(/[._-]+/g, ' ').trim().split(' ')[0] ?? '';
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : '';
}

/** Small proportional bar row for the mini charts on the stat cards. */
function MiniBars({
  values,
  color,
  height = 40,
}: {
  values: number[];
  color: string;
  height?: number;
}): React.JSX.Element {
  const { colors } = useTheme();
  const max = Math.max(1, ...values);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height }}>
      {values.map((v, i) => (
        <View
          key={i}
          style={{
            width: 8,
            height: Math.max(3, (v / max) * height),
            borderRadius: 3,
            backgroundColor: v > 0 ? color : colors.surfaceElevated,
          }}
        />
      ))}
    </View>
  );
}

/** A full-width stat card: title + big value + band, with a mini chart at right. */
function StatCard({
  title,
  value,
  unit,
  band,
  delta,
  chart,
  onPress,
}: {
  title: string;
  value: string;
  unit?: string;
  band?: { label: string; tone: BadgeTone };
  delta?: string;
  chart?: React.ReactNode;
  onPress?: () => void;
}): React.JSX.Element {
  const body = (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flex: 1, gap: spacing[1] }}>
          <Text variant="caption" color="textMuted">
            {title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing[2] }}>
            <Text variant="title">{value}</Text>
            {unit ? (
              <Text variant="body" color="textMuted">
                {unit}
              </Text>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
            {band ? <Badge label={band.label} tone={band.tone} /> : null}
            {delta ? (
              <Text variant="caption" color={delta.startsWith('-') ? 'error' : 'accentData'}>
                {delta}
              </Text>
            ) : null}
          </View>
        </View>
        {chart ? <View style={{ marginLeft: spacing[3] }}>{chart}</View> : null}
      </View>
    </Card>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      {body}
    </Pressable>
  );
}

const QUICK_LINKS: { label: string; path: Href }[] = [
  { label: 'Sommeil', path: '/sleep' },
  { label: 'Récup neuro', path: '/neuro-recovery' },
  { label: 'Bien-être', path: '/wellness' },
  { label: 'Objectifs', path: '/goals' },
  { label: 'Analyses', path: '/analytics' },
  { label: 'Comprendre', path: '/comprendre' },
  { label: 'Communauté', path: '/community' },
  { label: 'Programmes', path: '/marketplace' },
];

/**
 * Dashboard — "Aujourd'hui", restyled to the Kaizen Supotsu mockup: a greeting
 * header with avatar, a gradient hero holding the headline Kaizen score, then
 * recovery / sleep / training-load stat cards, the engine-backed widgets, an
 * explainable briefing, habits and quick links. Every number is real; the
 * "vs hier" delta is computed against yesterday's recovery, never faked.
 */
export function DashboardScreen(): React.JSX.Element {
  const { name: themeName, toggle, colors } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { data: activities = [] } = useActivities();
  const { data: health = [] } = useHealthMetrics();

  const asOf = new Date().toISOString();
  const snapshot = useMemo(
    () => buildDailySnapshot(activities, [], asOf, health),
    [activities, health, asOf],
  );
  const s = snapshot.value;
  const hasData = activities.length > 0;

  // Recovery today vs yesterday (both from the engine — a real delta or none).
  const recovery = useMemo(() => {
    const today = computeRecoveryScore(health, asOf);
    if (today.confidence === 'to_confirm') return null;
    const yesterdayIso = new Date(new Date(asOf).getTime() - DAY_MS).toISOString();
    const yest = computeRecoveryScore(health, yesterdayIso);
    const delta = yest.confidence !== 'to_confirm' ? today.value - yest.value : null;
    return { value: today.value, delta };
  }, [health, asOf]);

  // Last 7 nights of sleep (chronological) + last night for the headline.
  const nights = useMemo(
    () => [...sleepTrend(health, asOf, 7)].sort((a, b) => a.date.localeCompare(b.date)),
    [health, asOf],
  );
  const lastNight = nights[nights.length - 1];

  // Training load: ACWR zone + last 7 days of activity minutes.
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
  const LOAD_ZONE_LABEL: Record<string, { label: string; tone: BadgeTone }> = {
    'sous-charge': { label: 'Sous-charge', tone: 'info' },
    optimal: { label: 'Optimale', tone: 'success' },
    'élevé': { label: 'Élevée', tone: 'warning' },
    risque: { label: 'Risque', tone: 'error' },
  };

  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async (): Promise<void> => {
    setRefreshing(true);
    await qc.invalidateQueries();
    setRefreshing(false);
  };

  const firstName = greetingName(user?.email);
  const initial = (firstName || user?.email || 'K').charAt(0).toUpperCase();
  const kaizenBand = scoreBand(s.overall);

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
        <Pressable onPress={toggle} hitSlop={8} style={{ marginRight: spacing[2] }}>
          <Text variant="subtitle">{themeName === 'dark' ? '☀︎' : '☾'}</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/profile')}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              overflow: 'hidden',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Gradient fill />
            <Text variant="subtitle" color="onPrimary">
              {initial}
            </Text>
          </View>
        </Pressable>
      </View>

      {/* Hero: the Kaizen score on the brand gradient */}
      <View style={{ borderRadius: radii.lg, overflow: 'hidden' }}>
        <Gradient style={{ padding: spacing[5] }}>
          <Text variant="caption" color="onPrimary" style={{ opacity: 0.85 }}>
            SCORE KAIZEN
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing[3], marginTop: spacing[1] }}>
            <Text variant="display" color="onPrimary">
              {hasData ? s.overall : '—'}
            </Text>
            <Text variant="subtitle" color="onPrimary" style={{ opacity: 0.85, marginBottom: spacing[2] }}>
              / 100
            </Text>
          </View>
          <Text variant="caption" color="onPrimary" style={{ opacity: 0.9, marginTop: spacing[1] }}>
            {hasData
              ? `${kaizenBand.label} · performance et régularité combinées.`
              : 'Ajoute une activité pour calibrer ton score.'}
          </Text>
        </Gradient>
      </View>

      {/* Recovery */}
      <StatCard
        title="Score de récupération"
        value={recovery ? String(recovery.value) : '—'}
        band={recovery ? scoreBand(recovery.value) : undefined}
        delta={
          recovery?.delta != null && recovery.delta !== 0
            ? `${recovery.delta > 0 ? '+' : ''}${recovery.delta} vs hier`
            : undefined
        }
        onPress={() => router.push('/analytics')}
        chart={
          recovery ? (
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                borderWidth: 4,
                borderColor: colors.accentData,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text variant="body" color="accentData">
                {recovery.value}
              </Text>
            </View>
          ) : undefined
        }
      />

      {/* Sleep */}
      <StatCard
        title="Sommeil"
        value={lastNight ? fmtSleep(lastNight.hours) : '—'}
        band={lastNight ? scoreBand(lastNight.score) : undefined}
        onPress={() => router.push('/sleep')}
        chart={
          nights.length > 0 ? (
            <MiniBars values={nights.map((n) => n.hours)} color={colors.primary} />
          ) : undefined
        }
      />

      {/* Training load */}
      <StatCard
        title="Charge d'entraînement"
        value={acwr.ratio != null ? acwr.ratio.toFixed(2) : '—'}
        unit={acwr.ratio != null ? 'ratio A:C' : undefined}
        band={acwr.zone ? LOAD_ZONE_LABEL[acwr.zone] : undefined}
        onPress={() => router.push('/analytics')}
        chart={<MiniBars values={loadBars} color={colors.accentEndurance} />}
      />

      <View style={{ flexDirection: 'row', gap: spacing[3], alignItems: 'stretch' }}>
        <MuscleWidget />
        <WeightWidget />
      </View>

      <NutritionWidget />

      <DailyBriefingCard />

      <HabitsCard />

      <Card>
        <Text variant="heading">Explorer</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[2] }}>
          {QUICK_LINKS.map((l) => (
            <Button key={l.label} label={l.label} variant="secondary" onPress={() => router.push(l.path)} />
          ))}
          <Button label="+ Activité" variant="gradient" onPress={() => router.push('/activity/new')} />
        </View>
      </Card>

      <BadgesCard />
    </Screen>
  );
}
