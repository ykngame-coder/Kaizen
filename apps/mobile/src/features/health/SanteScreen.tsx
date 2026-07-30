import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Card, ProgressRing, Screen, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { computeAcwr, computeRecoveryScore, recoveryBand, sleepTrend } from '@supotsu/engines';
import { HubRow } from '@/features/navigation/HubRow';
import { useActivities, useHealthMetrics } from '@/lib/data/queries';

interface Section {
  title: string;
  subtitle: string;
  icon: string;
  path?: Href;
  soon?: boolean;
}

const BAND_LABEL: Record<string, string> = { excellent: 'Excellent', correct: 'Bon', moyen: 'Moyen', faible: 'Faible' };

function fmtSleep(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h} h ${String(m).padStart(2, '0')}`;
}

/** Santé hub (architecture: Application → Santé). Summary header + every signal. */
export function SanteScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { data: health = [] } = useHealthMetrics();
  const { data: activities = [] } = useActivities();
  const asOf = new Date().toISOString();

  const recovery = useMemo(() => {
    const r = computeRecoveryScore(health, asOf);
    return r.confidence === 'to_confirm' ? null : { value: r.value, band: recoveryBand(r.value) };
  }, [health, asOf]);
  const nights = useMemo(() => [...sleepTrend(health, asOf, 7)].sort((a, b) => a.date.localeCompare(b.date)), [health, asOf]);
  const lastNight = nights[nights.length - 1];
  const acwr = useMemo(() => computeAcwr(activities, asOf), [activities, asOf]);

  const sections: Section[] = [
    { title: 'Sommeil', subtitle: 'Score, phases, coucher optimal', icon: '😴', path: '/sleep' },
    { title: 'Récupération', subtitle: 'VFC, FC repos, stress combinés', icon: '♥', path: '/analytics' },
    { title: "Charge d'entraînement", subtitle: 'Ratio aigu/chronique', icon: '⚡', path: '/load' },
    { title: 'Nutrition', subtitle: 'Calories, macros, journal, scanner', icon: '◍', path: '/nutrition' },
    { title: 'Journal & déficit', subtitle: 'Bilan calorique et déficit du jour', icon: '📉', path: '/journal' },
    { title: 'Poids & composition', subtitle: 'Poids, masse grasse, masse musculaire', icon: '⚖', path: '/weight' },
    { title: 'Habitudes & discipline', subtitle: 'Check-list, séries, score de régularité', icon: '✓', path: '/habits' },
    { title: 'Bien-être mental', subtitle: 'Check-in subjectif, indice de forme', icon: '🧠', path: '/wellness' },
    { title: 'Respiration', subtitle: 'Cohérence cardiaque, 4-7-8', icon: '🌬', path: '/breathing' },
    { title: 'HRV (VFC)', subtitle: 'Variabilité cardiaque détaillée', icon: '📈', path: { pathname: '/health/[metric]', params: { metric: 'hrv' } } },
    { title: 'Fréquence cardiaque', subtitle: 'FC repos et tendance', icon: '💓', path: { pathname: '/health/[metric]', params: { metric: 'resting_heart_rate' } } },
    { title: 'Stress', subtitle: 'Niveau de stress sur la journée', icon: '🧠', path: { pathname: '/health/[metric]', params: { metric: 'stress' } } },
    { title: 'VO₂ Max', subtitle: 'Capacité cardio-respiratoire', icon: '🫁', path: { pathname: '/health/[metric]', params: { metric: 'vo2max' } } },
  ];

  return (
    <Screen scroll>
      <Text variant="title">Santé</Text>
      <Text variant="caption" color="textMuted">
        Tous tes signaux physiologiques, au même endroit.
      </Text>

      {/* Résumé du jour */}
      <Card style={{ marginTop: spacing[3] }}>
        <View style={{ flexDirection: 'row', gap: spacing[5], alignItems: 'center' }}>
          <ProgressRing value={recovery?.value ?? 0} size={96} thickness={9} gradient centerLabel={recovery ? `${recovery.value}` : '—'} caption="Recovery" />
          <View style={{ flex: 1, gap: spacing[3] }}>
            <SumRow label="Récupération" value={recovery ? BAND_LABEL[recovery.band]! : '—'} color={colors.accentData} />
            <SumRow label="Sommeil" value={lastNight ? fmtSleep(lastNight.hours) : '—'} />
            <SumRow label="Charge" value={acwr.ratio != null ? `ratio ${acwr.ratio.toFixed(2)}` : 'À calibrer'} />
          </View>
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

function SumRow({ label, value, color }: { label: string; value: string; color?: string }): React.JSX.Element {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text variant="body" color="textMuted">
        {label}
      </Text>
      <Text variant="body" style={{ fontWeight: '700', color }}>
        {value}
      </Text>
    </View>
  );
}
