import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, EmptyState, Icon, ProgressRing, Screen, Text, useTheme } from '@supotsu/ui';
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

const REL_TONE: Record<Reliability, 'success' | 'info' | 'warning'> = { high: 'success', medium: 'info', low: 'warning' };
const FRESH_TONE: Record<FreshnessLevel, 'success' | 'info' | 'warning' | 'error'> = {
  'à jour': 'success',
  récent: 'info',
  ancien: 'warning',
  obsolète: 'error',
};

/** Data quality & provenance (Master Prompt P9/P38): source, freshness, trust. */
export function DataQualityScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { data: metrics = [] } = useHealthMetrics();
  const { data: activities = [] } = useActivities();
  const asOf = new Date().toISOString();

  const METRIC_LABEL: Record<HealthMetricType, string> = {
    sleep_duration: t('dataquality.screen.metricLabel.sleep_duration'),
    sleep_efficiency: t('dataquality.screen.metricLabel.sleep_efficiency'),
    resting_heart_rate: t('dataquality.screen.metricLabel.resting_heart_rate'),
    hrv: t('dataquality.screen.metricLabel.hrv'),
    stress: t('dataquality.screen.metricLabel.stress'),
    weight: t('dataquality.screen.metricLabel.weight'),
    body_fat: t('dataquality.screen.metricLabel.body_fat'),
    muscle_mass: t('dataquality.screen.metricLabel.muscle_mass'),
    hydration: t('dataquality.screen.metricLabel.hydration'),
    steps: t('dataquality.screen.metricLabel.steps'),
  };

  const SOURCE_LABEL: Record<DataSource, string> = {
    manual: t('dataquality.screen.sourceLabel.manual'),
    apple_health: t('dataquality.screen.sourceLabel.apple_health'),
    garmin: t('dataquality.screen.sourceLabel.garmin'),
    strava: t('dataquality.screen.sourceLabel.strava'),
    renpho: t('dataquality.screen.sourceLabel.renpho'),
    polar: t('dataquality.screen.sourceLabel.polar'),
    coros: t('dataquality.screen.sourceLabel.coros'),
    fitbit: t('dataquality.screen.sourceLabel.fitbit'),
    oura: t('dataquality.screen.sourceLabel.oura'),
    withings: t('dataquality.screen.sourceLabel.withings'),
    phone: t('dataquality.screen.sourceLabel.phone'),
    supotsu: t('dataquality.screen.sourceLabel.supotsu'),
  };

  const REL_LABEL: Record<Reliability, string> = {
    high: t('dataquality.screen.reliabilityLabel.high'),
    medium: t('dataquality.screen.reliabilityLabel.medium'),
    low: t('dataquality.screen.reliabilityLabel.low'),
  };

  const FRESH_LABEL: Record<FreshnessLevel, string> = {
    'à jour': t('dataquality.screen.freshnessLabel.aJour'),
    récent: t('dataquality.screen.freshnessLabel.recent'),
    ancien: t('dataquality.screen.freshnessLabel.ancien'),
    obsolète: t('dataquality.screen.freshnessLabel.obsolete'),
  };

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
      <Text variant="title">{t('dataquality.screen.title')}</Text>
      <Text variant="caption" color="textMuted">
        {t('dataquality.screen.subtitle')}
      </Text>

      {!hasData ? (
        <EmptyState
          icon={<Icon name="search" size={44} color={colors.textSubtle} />}
          title={t('dataquality.screen.emptyState.title')}
          message={t('dataquality.screen.emptyState.message')}
          actionLabel={t('dataquality.screen.emptyState.actionLabel')}
          onAction={() => router.push('/profile/connectors')}
        />
      ) : (
        <>
          {provenance.length > 0 && (
            <Card>
              <View style={{ alignItems: 'center', gap: spacing[1] }}>
                <ProgressRing value={score} segments={zones} caption="/100" size={112} />
                <Text variant="caption" color="textMuted">
                  {t('dataquality.screen.qualityIndex')}
                </Text>
              </View>
            </Card>
          )}

          {provenance.length > 0 && (
            <Card>
              <Text variant="heading">{t('dataquality.screen.provenanceHeading')}</Text>
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
                      <Badge label={FRESH_LABEL[p.freshness.level]} tone={FRESH_TONE[p.freshness.level]} />
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
            <Text variant="heading">{t('dataquality.screen.consistencyHeading')}</Text>
            {flagged.length === 0 ? (
              <Text variant="body" color="textMuted">
                {activities.length > 0
                  ? t('dataquality.screen.consistencyOk')
                  : t('dataquality.screen.consistencyNone')}
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
                  {t('dataquality.screen.consistencyNote')}
                </Text>
              </View>
            )}
          </Card>
        </>
      )}

      <View style={{ alignItems: 'flex-start' }}>
        <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
