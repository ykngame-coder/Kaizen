import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, ProgressRing, Screen, Text, useTheme, type BadgeTone } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { buildDailySnapshot } from '@supotsu/engines';
import type { Confidence } from '@supotsu/core';
import { useActivities, useHealthMetrics } from '@/lib/data/queries';
import { BadgesCard } from '@/features/gamification/BadgesCard';
import { HabitsCard } from '@/features/gamification/HabitsCard';
import { DailyBriefingCard } from './DailyBriefingCard';

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
  // Zone gauge: red (<50) · amber (50–75) · green (75+); the marker lands in
  // the band matching the score, so the thresholds are visible at a glance.
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

/**
 * Dashboard wired to the scoring engine (Master Prompt P3, P10, P34): real
 * scores + an explainable recommendation computed from the user's activities.
 */
export function DashboardScreen(): React.JSX.Element {
  const { name, toggle } = useTheme();
  const router = useRouter();
  const { data: activities = [], isLoading } = useActivities();
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
          <Text variant="title">Bonjour 👋</Text>
          <Text variant="caption" color="textMuted">
            Comment vais-je aujourd'hui ?
          </Text>
        </View>
        <Button label={name === 'dark' ? '☀︎' : '☾'} variant="secondary" onPress={toggle} />
      </View>

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-start' }}>
          <ScoreRing label="Supotsu" value={hasData ? s.overall : null} size={84} />
          <ScoreRing label="Récupération" value={s.recovery} />
          <ScoreRing label="Régularité" value={hasData ? s.consistency : null} />
        </View>
        <Text variant="caption" color="textMuted" style={{ textAlign: 'center', marginTop: spacing[3] }}>
          {hasData
            ? `Basé sur ta performance et ta régularité (${conf.label.toLowerCase()}).`
            : 'Ajoute une activité pour calibrer ton score.'}
        </Text>
      </Card>

      <DailyBriefingCard />

      <Card>
        <Text variant="heading">Sommeil & bien-être</Text>
        <Text variant="body" color="textMuted">
          Ton score de sommeil, tes signaux de récupération et ton ressenti du jour.
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[1] }}>
          <Button label="Sommeil" onPress={() => router.push('/sleep')} />
          <Button label="Bien-être" variant="secondary" onPress={() => router.push('/wellness')} />
        </View>
      </Card>

      <Card>
        <Text variant="heading">Activité</Text>
        <Text variant="body" color="textMuted">
          {isLoading
            ? 'Chargement…'
            : hasData
              ? `${activities.length} activité(s) enregistrée(s).`
              : 'Aucune activité pour le moment.'}
        </Text>
        <View style={{ alignItems: 'flex-start' }}>
          <Button label="Ajouter une activité" onPress={() => router.push('/activity/new')} />
        </View>
      </Card>

      <HabitsCard />
      <BadgesCard />

      <Card>
        <Text variant="heading">Communauté</Text>
        <Text variant="body" color="textMuted">
          Rejoins des défis et compare-toi — chaque classement se lit dans les faits.
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing[2] }}>
          <Button label="Défis" onPress={() => router.push('/community')} />
          <Button label="Programmes" variant="secondary" onPress={() => router.push('/marketplace')} />
        </View>
      </Card>
    </Screen>
  );
}
