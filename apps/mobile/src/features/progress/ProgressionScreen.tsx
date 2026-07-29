import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Card, Screen, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { averageSleepHours, computeRecoveryScore } from '@supotsu/engines';
import { HubRow } from '@/features/navigation/HubRow';
import { useActivities, useHealthMetrics } from '@/lib/data/queries';

const DAY_MS = 86_400_000;

interface Section {
  title: string;
  subtitle: string;
  icon: string;
  path?: Href;
  soon?: boolean;
}

/** Weekly snapshot stat. */
function Snap({ icon, value, label }: { icon: string; value: string; label: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceElevated, borderRadius: radii.lg, padding: spacing[3], alignItems: 'center' }}>
      <Text style={{ fontSize: 16 }}>{icon}</Text>
      <Text variant="subtitle" style={{ marginTop: spacing[1] }}>
        {value}
      </Text>
      <Text variant="caption" color="textSubtle" style={{ marginTop: 2, textAlign: 'center' }}>
        {label}
      </Text>
    </View>
  );
}

/** Progression hub (architecture: Application → Progression) — snapshot + sections. */
export function ProgressionScreen(): React.JSX.Element {
  const router = useRouter();
  const { data: activities = [] } = useActivities();
  const { data: health = [] } = useHealthMetrics();
  const asOf = new Date().toISOString();

  const snap = useMemo(() => {
    const since = new Date(asOf).getTime() - 7 * DAY_MS;
    const sessions = activities.filter((a) => new Date(a.startedAt).getTime() >= since).length;
    const avgSleep = averageSleepHours(health, asOf, 7);
    const rec = computeRecoveryScore(health, asOf);
    const weights = health.filter((m) => m.type === 'weight').sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
    const wLast = weights.at(-1)?.value;
    const wRef = weights.find((m) => new Date(m.measuredAt).getTime() >= since)?.value ?? weights[0]?.value;
    const wDelta = wLast != null && wRef != null ? wLast - wRef : null;
    return {
      sessions,
      sleep: avgSleep != null && avgSleep > 0 ? `${avgSleep.toFixed(1)} h` : '—',
      recovery: rec.confidence === 'to_confirm' ? '—' : `${rec.value}`,
      weight: wDelta != null ? `${wDelta > 0 ? '+' : ''}${wDelta.toFixed(1)} kg` : '—',
    };
  }, [activities, health, asOf]);

  const sections: Section[] = [
    { title: 'Rapport hebdomadaire', subtitle: 'Ton bilan de la semaine, expliqué', icon: '📄', path: '/report' },
    { title: 'Statistiques', subtitle: 'Vue d’ensemble sur la période', icon: '📊', path: '/analytics' },
    { title: 'Tendances & corrélations', subtitle: 'Ce qui influence ta forme (IA)', icon: '📈', path: '/analytics' },
    { title: 'Objectifs', subtitle: 'Cibles mesurables et progression', icon: '🎯', path: '/goals' },
    { title: 'Records', subtitle: '1RM, meilleurs temps, distances', icon: '🏆', path: '/records' },
    { title: 'Badges', subtitle: 'Récompenses gagnées sur tes données', icon: '🏅', soon: true },
    { title: 'Comparaisons', subtitle: 'Périodes et références', icon: '⚖', soon: true },
    { title: 'Photos d’évolution', subtitle: 'Avant / après dans le temps', icon: '📷', soon: true },
  ];

  return (
    <Screen scroll>
      <Text variant="title">Progression</Text>
      <Text variant="caption" color="textMuted">
        Tes tendances, tes records et tes objectifs dans le temps.
      </Text>

      {/* Bilan de la semaine */}
      <Card style={{ marginTop: spacing[3] }}>
        <Text variant="heading">7 derniers jours</Text>
        <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[3] }}>
          <Snap icon="💪" value={`${snap.sessions}`} label="Séances" />
          <Snap icon="😴" value={snap.sleep} label="Sommeil moy." />
          <Snap icon="✅" value={snap.recovery} label="Récup moy." />
          <Snap icon="⚖" value={snap.weight} label="Poids" />
        </View>
      </Card>

      <View style={{ gap: spacing[2], marginTop: spacing[3] }}>
        {sections.map((s) => (
          <HubRow key={s.title} title={s.title} subtitle={s.subtitle} icon={s.icon} soon={s.soon} onPress={s.path ? () => router.push(s.path!) : undefined} />
        ))}
      </View>
    </Screen>
  );
}
