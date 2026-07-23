import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Card, EmptyState, ProgressRing, Screen, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import type { HealthMetric } from '@supotsu/core';
import {
  averageSleepHours,
  computeSleepScore,
  sleepBand,
  sleepExplanation,
  sleepTrend,
  type SleepBand,
} from '@supotsu/engines';
import { useHealthMetrics } from '@/lib/data/queries';
import { formatDate } from '@/lib/format';

const BAND_LABEL: Record<SleepBand, string> = {
  excellent: 'Excellent',
  correct: 'Correct',
  moyen: 'Moyen',
  faible: 'Faible',
};
const BAND_TONE: Record<SleepBand, 'success' | 'info' | 'warning' | 'error'> = {
  excellent: 'success',
  correct: 'info',
  moyen: 'warning',
  faible: 'error',
};

function latestOf(metrics: HealthMetric[], type: HealthMetric['type']): HealthMetric | undefined {
  return metrics
    .filter((m) => m.type === type)
    .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0];
}

/** Sleep pillar (Master Prompt P14): explainable sleep score, trend, signals. */
export function SleepScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { data: metrics = [], isLoading } = useHealthMetrics();
  const asOf = new Date().toISOString();

  const score = useMemo(() => computeSleepScore(metrics, asOf), [metrics, asOf]);
  const trend = useMemo(() => sleepTrend(metrics, asOf, 7), [metrics, asOf]);
  const avg = useMemo(() => averageSleepHours(metrics, asOf, 7), [metrics, asOf]);
  const explanation = useMemo(() => sleepExplanation(metrics, asOf), [metrics, asOf]);
  const hasData = score.confidence !== 'to_confirm';

  const zones = [
    { color: colors.error, weight: 50 },
    { color: colors.warning, weight: 25 },
    { color: colors.success, weight: 25 },
  ];
  const band = sleepBand(score.value);

  const hrv = latestOf(metrics, 'hrv');
  const rhr = latestOf(metrics, 'resting_heart_rate');
  const stress = latestOf(metrics, 'stress');
  const signals = [
    hrv && { label: 'VFC (HRV)', value: `${Math.round(hrv.value)} ms` },
    rhr && { label: 'FC repos', value: `${Math.round(rhr.value)} bpm` },
    stress && { label: 'Stress', value: `${Math.round(stress.value)}/100` },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <Screen scroll>
      <Text variant="title">Sommeil</Text>
      <Text variant="caption" color="textMuted">
        Ton sommeil, expliqué — durée et efficacité de tes nuits importées de Garmin ou Apple Santé.
      </Text>

      {isLoading ? (
        <Text variant="body" color="textMuted">
          Chargement…
        </Text>
      ) : !hasData ? (
        <EmptyState
          icon="😴"
          title="Pas encore de données de sommeil"
          message="Importe ton export Garmin ou connecte Apple Santé pour suivre tes nuits."
          actionLabel="Importer / connecter"
          onAction={() => router.push('/import')}
        />
      ) : (
        <>
          <Card>
            <View style={{ alignItems: 'center', gap: spacing[1] }}>
              <ProgressRing value={score.value} segments={zones} caption="/100" size={116} />
              <Badge label={BAND_LABEL[band]} tone={BAND_TONE[band]} />
              {avg !== undefined && (
                <Text variant="caption" color="textMuted">
                  Moyenne 7 jours : {avg.toFixed(1)} h / nuit
                </Text>
              )}
            </View>
          </Card>

          {explanation && (
            <Card>
              <Text variant="heading">Analyse</Text>
              <Text variant="caption" color="textMuted">
                {explanation.observation}
              </Text>
              <Text variant="caption" color="textMuted">
                {explanation.analysis}
              </Text>
              <Text variant="body" style={{ marginTop: spacing[1] }}>
                {explanation.action}
              </Text>
            </Card>
          )}

          {signals.length > 0 && (
            <Card>
              <Text variant="heading">Signaux de récupération</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[4], marginTop: spacing[2] }}>
                {signals.map((s) => (
                  <View key={s.label}>
                    <Text variant="caption" color="textSubtle">
                      {s.label}
                    </Text>
                    <Text variant="subtitle">{s.value}</Text>
                  </View>
                ))}
              </View>
            </Card>
          )}

          {trend.length > 0 && (
            <Card>
              <Text variant="heading">7 derniers jours</Text>
              <View style={{ gap: spacing[2], marginTop: spacing[1] }}>
                {trend.map((n) => (
                  <View
                    key={n.date}
                    style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <Text variant="body">{formatDate(n.date)}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                      <Text variant="caption" color="textMuted">
                        {n.hours.toFixed(1)} h
                      </Text>
                      <Badge label={`${n.score}`} tone={BAND_TONE[sleepBand(n.score)]} />
                    </View>
                  </View>
                ))}
              </View>
            </Card>
          )}
        </>
      )}

      <View style={{ alignItems: 'flex-start' }}>
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
