import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Badge, Button, Card, EmptyState, Screen, SegmentedControl, Sparkline, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { HealthMetricType } from '@supotsu/core';
import { useHealthMetrics } from '@/lib/data/queries';

const DAY_MS = 86_400_000;
const PERIODS = [
  { key: '30', label: '30 j', days: 30 },
  { key: '90', label: '90 j', days: 90 },
  { key: '365', label: '1 an', days: 365 },
] as const;
type PeriodKey = (typeof PERIODS)[number]['key'];

interface MetricConfig {
  type: HealthMetricType | null;
  label: string;
  unit: string;
  icon: string;
  higherBetter?: boolean;
  desc: string;
  note?: string;
}

const CONFIG: Record<string, MetricConfig> = {
  hrv: { type: 'hrv', label: 'HRV (VFC)', unit: 'ms', icon: '📈', higherBetter: true, desc: 'Variabilité de la fréquence cardiaque — un marqueur clé de récupération et de forme.', note: 'Garmin ne transmet pas la HRV à Apple Santé : pour la suivre, utilise l’import d’un export Garmin.' },
  resting_heart_rate: { type: 'resting_heart_rate', label: 'Fréquence cardiaque de repos', unit: 'bpm', icon: '💓', higherBetter: false, desc: 'Ta FC au repos — plus elle est basse, meilleure est ta forme cardiovasculaire.' },
  stress: { type: 'stress', label: 'Stress', unit: '/100', icon: '🧠', higherBetter: false, desc: 'Niveau de stress estimé sur la journée (selon ta source de données).' },
  vo2max: { type: null, label: 'VO₂ Max', unit: '', icon: '🫁', desc: 'Ta capacité cardio-respiratoire maximale.', note: 'Le VO₂ Max n’est pas encore suivi dans Kaizen — l’intégration (Garmin/Apple) arrive.' },
};

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text variant="caption" color="textSubtle">{label}</Text>
      <Text variant="subtitle" style={{ marginTop: 2 }}>{value}</Text>
    </View>
  );
}

/** Generic health-metric detail — latest value, trend and stats over a period. */
export function HealthMetricScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { metric } = useLocalSearchParams<{ metric: string }>();
  const { data: health = [] } = useHealthMetrics();
  const [period, setPeriod] = useState<PeriodKey>('90');
  const days = PERIODS.find((p) => p.key === period)!.days;

  const cfg = CONFIG[metric ?? ''] ?? CONFIG.hrv!;

  const points = useMemo(() => {
    if (!cfg.type) return [] as { v: number; t: number }[];
    const since = Date.now() - days * DAY_MS;
    return health
      .filter((m) => m.type === cfg.type && new Date(m.measuredAt).getTime() >= since)
      .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
      .map((m) => ({ v: m.value, t: new Date(m.measuredAt).getTime() }));
  }, [health, cfg.type, days]);

  const values = points.map((p) => p.v);
  const latest = values.at(-1);
  const first = values[0];
  const delta = latest != null && first != null ? latest - first : null;
  const min = values.length ? Math.min(...values) : null;
  const max = values.length ? Math.max(...values) : null;
  const avg = values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
  const deltaGood = delta != null ? (cfg.higherBetter ? delta >= 0 : delta <= 0) : null;

  return (
    <Screen scroll>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        <Text style={{ fontSize: 26 }}>{cfg.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text variant="title">{cfg.label}</Text>
        </View>
      </View>
      <Text variant="caption" color="textMuted" style={{ lineHeight: 19 }}>{cfg.desc}</Text>

      {cfg.type ? (
        <>
          <SegmentedControl options={PERIODS.map((p) => ({ value: p.key, label: p.label }))} value={period} onChange={setPeriod} />

          {values.length === 0 ? (
            <EmptyState icon={cfg.icon} title="Pas encore de données" message={cfg.note ?? `Aucune mesure de ${cfg.label.toLowerCase()} sur cette période. Synchronise Apple Santé ou importe un export.`} />
          ) : (
            <>
              <Card>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <View>
                    <Text variant="display">{latest != null ? (Number.isInteger(latest) ? latest : latest.toFixed(1)) : '—'}</Text>
                    <Text variant="caption" color="textSubtle">{cfg.unit} · dernière mesure</Text>
                  </View>
                  {delta != null && Math.abs(delta) >= 0.5 ? (
                    <Badge label={`${delta > 0 ? '+' : ''}${Number.isInteger(delta) ? delta : delta.toFixed(1)} ${cfg.unit}`} tone={deltaGood ? 'success' : 'warning'} />
                  ) : null}
                </View>
                {values.length >= 2 ? (
                  <View style={{ marginTop: spacing[3] }}>
                    <Sparkline values={values} width={300} height={70} color={colors.primary} />
                  </View>
                ) : null}
                {min != null && max != null && avg != null ? (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing[3], paddingTop: spacing[3], borderTopWidth: 1, borderTopColor: colors.border }}>
                    <Stat label="Min" value={`${Number.isInteger(min) ? min : min.toFixed(1)}`} />
                    <Stat label="Moyenne" value={`${avg.toFixed(1)}`} />
                    <Stat label="Max" value={`${Number.isInteger(max) ? max : max.toFixed(1)}`} />
                  </View>
                ) : null}
              </Card>

              {cfg.note ? (
                <View style={{ borderRadius: radii.xl, borderWidth: 1, borderColor: 'rgba(245,183,66,0.25)', backgroundColor: 'rgba(245,183,66,0.08)', padding: spacing[4] }}>
                  <Text variant="caption" color="textMuted" style={{ lineHeight: 19 }}>ℹ️  {cfg.note}</Text>
                </View>
              ) : null}
            </>
          )}
        </>
      ) : (
        <EmptyState icon={cfg.icon} title="Bientôt disponible" message={cfg.note ?? 'Cette métrique arrive prochainement.'} />
      )}

      <View style={{ alignItems: 'flex-start' }}>
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
