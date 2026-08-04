import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Card, EmptyState, ProgressRing, Screen, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import type { DataSource, HealthMetricType, Reliability } from '@supotsu/core';
import {
  dataQualityScore,
  metricProvenance,
  validateActivity,
  type FreshnessLevel,
} from '@supotsu/engines';
import { useActivities, useHealthMetrics } from '@/lib/data/queries';
import { formatDate } from '@/lib/format';

const METRIC_LABEL: Record<HealthMetricType, string> = {
  sleep_duration: 'Durée de sommeil',
  sleep_efficiency: 'Efficacité du sommeil',
  resting_heart_rate: 'FC au repos',
  hrv: 'VFC (HRV)',
  stress: 'Stress',
  weight: 'Poids',
  body_fat: 'Masse grasse',
  muscle_mass: 'Masse musculaire',
  hydration: 'Hydratation',
};

const SOURCE_LABEL: Record<DataSource, string> = {
  manual: 'Saisie manuelle',
  apple_health: 'Apple Santé',
  garmin: 'Garmin',
  strava: 'Strava',
  renpho: 'Renpho',
  polar: 'Polar',
  coros: 'Coros',
  fitbit: 'Fitbit',
  oura: 'Oura',
  withings: 'Withings',
  supotsu: 'Calculé par SUPOTSU',
};

const REL_LABEL: Record<Reliability, string> = { high: 'Fiable', medium: 'Moyenne', low: 'À confirmer' };
const REL_TONE: Record<Reliability, 'success' | 'info' | 'warning'> = { high: 'success', medium: 'info', low: 'warning' };
const FRESH_TONE: Record<FreshnessLevel, 'success' | 'info' | 'warning' | 'error'> = {
  'à jour': 'success',
  récent: 'info',
  ancien: 'warning',
  obsolète: 'error',
};

/** Data quality & provenance (Master Prompt P9/P38): source, freshness, trust. */
export function DataQualityScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { data: metrics = [] } = useHealthMetrics();
  const { data: activities = [] } = useActivities();
  const asOf = new Date().toISOString();

  const provenance = useMemo(() => metricProvenance(metrics, asOf), [metrics, asOf]);
  const score = useMemo(() => dataQualityScore(provenance), [provenance]);
  const flagged = useMemo(
    () => activities.map((a) => ({ a, v: validateActivity(a) })).filter((x) => !x.v.valid),
    [activities],
  );

  const zones = [
    { color: colors.error, weight: 40 },
    { color: colors.warning, weight: 30 },
    { color: colors.success, weight: 30 },
  ];

  const hasData = provenance.length > 0 || activities.length > 0;

  return (
    <Screen scroll>
      <Text variant="title">Qualité des données</Text>
      <Text variant="caption" color="textMuted">
        D'où viennent tes données, leur fiabilité et leur fraîcheur — rien n'est une boîte noire.
      </Text>

      {!hasData ? (
        <EmptyState
          icon="🔎"
          title="Aucune donnée à évaluer"
          message="Connecte un appareil ou importe un export pour voir la provenance et la fiabilité de tes données."
          actionLabel="Mes appareils"
          onAction={() => router.push('/profile/connectors')}
        />
      ) : (
        <>
          {provenance.length > 0 && (
            <Card>
              <View style={{ alignItems: 'center', gap: spacing[1] }}>
                <ProgressRing value={score} segments={zones} caption="/100" size={112} />
                <Text variant="caption" color="textMuted">
                  Indice de qualité global
                </Text>
              </View>
            </Card>
          )}

          {provenance.length > 0 && (
            <Card>
              <Text variant="heading">Provenance par mesure</Text>
              <View style={{ gap: spacing[3], marginTop: spacing[2] }}>
                {provenance.map((p) => (
                  <View key={p.type} style={{ gap: spacing[1] }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text variant="body">{METRIC_LABEL[p.type]}</Text>
                      <Text variant="subtitle">
                        {p.value % 1 === 0 ? p.value : p.value.toFixed(1)} {p.unit}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], alignItems: 'center' }}>
                      <Text variant="caption" color="textMuted">
                        {SOURCE_LABEL[p.source]}
                      </Text>
                      <Badge label={REL_LABEL[p.reliability]} tone={REL_TONE[p.reliability]} />
                      <Badge label={p.freshness.level} tone={FRESH_TONE[p.freshness.level]} />
                      <Text variant="caption" color="textSubtle">
                        {formatDate(p.measuredAt)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </Card>
          )}

          <Card>
            <Text variant="heading">Cohérence des activités</Text>
            {flagged.length === 0 ? (
              <Text variant="body" color="textMuted">
                {activities.length > 0
                  ? 'Toutes tes activités semblent cohérentes ✅'
                  : 'Aucune activité à vérifier pour l’instant.'}
              </Text>
            ) : (
              <View style={{ gap: spacing[2], marginTop: spacing[1] }}>
                {flagged.map(({ a, v }) => (
                  <View key={a.id}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text variant="body">{a.type}</Text>
                      <Text variant="caption" color="textSubtle">
                        {formatDate(a.startedAt)}
                      </Text>
                    </View>
                    {v.issues.map((issue) => (
                      <Text key={issue} variant="caption" style={{ color: colors.warning }}>
                        ⚠ {issue}
                      </Text>
                    ))}
                  </View>
                ))}
                <Text variant="caption" color="textSubtle">
                  Ces données sont conservées, jamais supprimées — seulement signalées.
                </Text>
              </View>
            )}
          </Card>
        </>
      )}

      <View style={{ alignItems: 'flex-start' }}>
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
