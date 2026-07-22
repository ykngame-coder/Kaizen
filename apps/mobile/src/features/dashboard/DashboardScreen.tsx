import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Card, KPICard, Screen, Text, useTheme, type BadgeTone } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { buildDailySnapshot, recoveryBand } from '@supotsu/engines';
import type { Confidence } from '@supotsu/core';
import { useActivities, useHealthMetrics } from '@/lib/data/queries';
import { BadgesCard } from '@/features/gamification/BadgesCard';
import { HabitsCard } from '@/features/gamification/HabitsCard';

const CONFIDENCE_LABEL: Record<Confidence, { label: string; tone: BadgeTone }> = {
  high: { label: 'Confiance élevée', tone: 'success' },
  medium: { label: 'Confiance moyenne', tone: 'info' },
  to_confirm: { label: 'À confirmer', tone: 'warning' },
};

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
  const rec = s.recommendation;

  return (
    <Screen scroll>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <Text variant="title">Bonjour 👋</Text>
          <Text variant="caption" color="textMuted">
            Comment vais-je aujourd'hui ?
          </Text>
        </View>
        <Button label={name === 'dark' ? '☀︎' : '☾'} variant="secondary" onPress={toggle} />
      </View>

      <KPICard
        label="Score Supotsu"
        value={hasData ? String(s.overall) : '—'}
        unit="/100"
        caption={
          hasData
            ? `Basé sur ta performance et ta régularité (${conf.label.toLowerCase()}).`
            : 'Ajoute une activité pour calibrer ton score.'
        }
      />

      <View style={{ flexDirection: 'row', gap: spacing[4] }}>
        <View style={{ flex: 1 }}>
          <KPICard
            label="Récupération"
            value={s.recovery !== null ? String(s.recovery) : '—'}
            unit="/100"
            caption={s.recovery !== null ? recoveryBand(s.recovery) : 'Connecte un appareil'}
          />
        </View>
        <View style={{ flex: 1 }}>
          <KPICard label="Régularité" value={hasData ? String(s.consistency) : '—'} unit="/100" />
        </View>
      </View>

      <Card>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <Text variant="heading">Recommandation du jour</Text>
          <Badge
            label={
              rec.confidence === 'high'
                ? 'Confiance élevée'
                : rec.confidence === 'medium'
                  ? 'Confiance moyenne'
                  : 'À confirmer'
            }
            tone={CONFIDENCE_LABEL[rec.confidence].tone}
          />
        </View>
        <Text variant="caption" color="textMuted">
          {rec.explanation.observation}
        </Text>
        <Text variant="caption" color="textMuted">
          {rec.explanation.analysis}
        </Text>
        <Text variant="body">{rec.explanation.action}</Text>
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
