import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, ProgressRing, Screen, Text, useTheme, type BadgeTone } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { buildDailySnapshot } from '@supotsu/engines';
import type { Confidence } from '@supotsu/core';
import { useActivities, useHealthMetrics } from '@/lib/data/queries';
import { BadgesCard } from '@/features/gamification/BadgesCard';
import { HabitsCard } from '@/features/gamification/HabitsCard';
import { DailyBriefingCard } from './DailyBriefingCard';
import { NutritionWidget } from './NutritionWidget';
import { WeightWidget } from './WeightWidget';
import { MuscleWidget } from './MuscleWidget';

const CONFIDENCE_LABEL: Record<Confidence, { label: string; tone: BadgeTone }> = {
  high: { label: 'Confiance élevée', tone: 'success' },
  medium: { label: 'Confiance moyenne', tone: 'info' },
  to_confirm: { label: 'À confirmer', tone: 'warning' },
};

/** A dashboard score as a circular gauge (Garmin Connect style) with a label. */
function ScoreRing({
  label,
  value,
  size = 72,
}: {
  label: string;
  value: number | null;
  size?: number;
}): React.JSX.Element {
  const { colors } = useTheme();
  const zones = [
    { color: colors.error, weight: 50 },
    { color: colors.warning, weight: 25 },
    { color: colors.success, weight: 25 },
  ];
  return (
    <View style={{ alignItems: 'center', gap: spacing[1] }}>
      <ProgressRing
        value={value ?? 0}
        centerLabel={value === null ? '—' : String(value)}
        caption="/100"
        segments={value === null ? undefined : zones}
        color={colors.surfaceElevated}
        size={size}
      />
      <Text variant="label" color="textMuted">
        {label.toUpperCase()}
      </Text>
    </View>
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
 * Dashboard — data-first "Aujourd'hui": hero scores, then nutrition / weight /
 * muscle widgets wired to the engines, an explainable briefing, habits and quick
 * links. Emerald stays primary; lime is the secondary highlight accent.
 */
export function DashboardScreen(): React.JSX.Element {
  const { name, toggle } = useTheme();
  const router = useRouter();
  const { data: activities = [] } = useActivities();
  const { data: health = [] } = useHealthMetrics();

  const snapshot = useMemo(
    () => buildDailySnapshot(activities, [], new Date().toISOString(), health),
    [activities, health],
  );
  const s = snapshot.value;
  const hasData = activities.length > 0;
  const conf = CONFIDENCE_LABEL[snapshot.confidence];

  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async (): Promise<void> => {
    setRefreshing(true);
    await qc.invalidateQueries();
    setRefreshing(false);
  };

  return (
    <Screen scroll onRefresh={onRefresh} refreshing={refreshing}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <Text variant="title">Aujourd'hui</Text>
          <Text variant="caption" color="textMuted">
            Comment vais-je aujourd'hui ?
          </Text>
        </View>
        <Button label={name === 'dark' ? '☀︎' : '☾'} variant="secondary" onPress={toggle} />
      </View>

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-start' }}>
          <ScoreRing label="Kaizen" value={hasData ? s.overall : null} size={84} />
          <ScoreRing label="Récupération" value={s.recovery} />
          <ScoreRing label="Régularité" value={hasData ? s.consistency : null} />
        </View>
        <Text variant="caption" color="textMuted" style={{ textAlign: 'center', marginTop: spacing[3] }}>
          {hasData
            ? `Basé sur ta performance et ta régularité (${conf.label.toLowerCase()}).`
            : 'Ajoute une activité pour calibrer ton score.'}
        </Text>
      </Card>

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
          <Button label="+ Activité" onPress={() => router.push('/activity/new')} />
        </View>
      </Card>

      <BadgesCard />
    </Screen>
  );
}
