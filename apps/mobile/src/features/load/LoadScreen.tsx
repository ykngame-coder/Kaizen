import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Card, EmptyState, ProgressRing, Screen, Sparkline, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { computeAcwr, dailyLoadSeries, loadExplanation, type LoadZone } from '@supotsu/engines';
import { useActivities } from '@/lib/data/queries';

const ZONE_TONE: Record<LoadZone, 'info' | 'success' | 'warning' | 'error'> = {
  'sous-charge': 'info',
  optimal: 'success',
  'élevé': 'warning',
  risque: 'error',
};

/** Training load & injury-risk (Master Prompt P13/P34): explainable ACWR. */
export function LoadScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { data: activities = [], isLoading } = useActivities();
  const asOf = new Date().toISOString();

  const acwr = useMemo(() => computeAcwr(activities, asOf), [activities, asOf]);
  const trend = useMemo(() => dailyLoadSeries(activities, asOf, 28), [activities, asOf]);
  const explanation = useMemo(() => loadExplanation(activities, asOf), [activities, asOf]);
  const hasData = acwr.ratio !== null && acwr.confidence !== 'to_confirm';

  // Gauge scale: ratio 0…2 → 0…100, with the boundaries 0.8 / 1.3 / 1.5.
  const zones = [
    { color: colors.info, weight: 40 }, // 0 – 0.8 sous-charge
    { color: colors.success, weight: 25 }, // 0.8 – 1.3 optimal
    { color: colors.warning, weight: 10 }, // 1.3 – 1.5 élevé
    { color: colors.error, weight: 25 }, // 1.5 – 2.0 risque
  ];
  const marker = Math.max(0, Math.min(100, ((acwr.ratio ?? 0) / 2) * 100));

  const legend: LoadZone[] = ['sous-charge', 'optimal', 'élevé', 'risque'];
  const zoneColor: Record<LoadZone, string> = {
    'sous-charge': colors.info,
    optimal: colors.success,
    'élevé': colors.warning,
    risque: colors.error,
  };

  return (
    <Screen scroll>
      <Text variant="title">Charge d'entraînement</Text>
      <Text variant="caption" color="textMuted">
        Le ratio charge aiguë / chronique — pour progresser sans te blesser.
      </Text>

      {isLoading ? (
        <Text variant="body" color="textMuted">
          Chargement…
        </Text>
      ) : !hasData ? (
        <EmptyState
          icon="📈"
          title="Pas encore assez d'activités"
          message="Enregistre tes séances sur quelques semaines pour calculer ta charge et ton risque."
          actionLabel="Ajouter une activité"
          onAction={() => router.push('/activity/new')}
        />
      ) : (
        <>
          <Card>
            <View style={{ alignItems: 'center', gap: spacing[1] }}>
              <ProgressRing
                value={marker}
                segments={zones}
                centerLabel={acwr.ratio!.toFixed(2)}
                caption="ratio"
                size={124}
              />
              <Badge label={acwr.zone!} tone={ZONE_TONE[acwr.zone!]} />
            </View>
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: spacing[3],
                justifyContent: 'center',
                marginTop: spacing[2],
              }}
            >
              {legend.map((z) => (
                <View key={z} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[1] }}>
                  <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: zoneColor[z] }} />
                  <Text variant="caption" color="textMuted">
                    {z}
                  </Text>
                </View>
              ))}
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

          <Card>
            <View style={{ flexDirection: 'row', gap: spacing[6] }}>
              <View>
                <Text variant="label" color="textMuted">
                  CHARGE AIGUË
                </Text>
                <Text variant="subtitle">{acwr.acute}</Text>
                <Text variant="caption" color="textSubtle">
                  7 derniers jours
                </Text>
              </View>
              <View>
                <Text variant="label" color="textMuted">
                  CHARGE CHRONIQUE
                </Text>
                <Text variant="subtitle">{acwr.chronic}</Text>
                <Text variant="caption" color="textSubtle">
                  moyenne / semaine
                </Text>
              </View>
            </View>
            <View style={{ marginTop: spacing[3] }}>
              <Text variant="caption" color="textMuted">
                Charge quotidienne — 28 jours
              </Text>
              <View style={{ marginTop: spacing[1] }}>
                <Sparkline values={trend} width={280} height={56} color={colors.accentStrength} />
              </View>
            </View>
          </Card>
        </>
      )}

      <View style={{ alignItems: 'flex-start' }}>
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
