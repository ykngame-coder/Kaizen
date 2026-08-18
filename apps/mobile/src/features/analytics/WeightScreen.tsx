import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Card, EmptyState, Icon, Input, Screen, SegmentedControl, Sparkline, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { HealthMetricType } from '@supotsu/core';
import { summarizeTrend, weightTrend } from '@supotsu/engines';
import { useAddHealthMetric, useHealthMetrics } from '@/lib/data/queries';

const PERIODS = [
  { key: '30', label: '30 j', days: 30 },
  { key: '90', label: '90 j', days: 90 },
  { key: '365', label: '1 an', days: 365 },
] as const;
type PeriodKey = (typeof PERIODS)[number]['key'];

function latest(metrics: { type: HealthMetricType; value: number; measuredAt: string }[], type: HealthMetricType): number | undefined {
  return metrics.filter((m) => m.type === type).sort((a, b) => a.measuredAt.localeCompare(b.measuredAt)).at(-1)?.value;
}

/** Body-composition stat block. */
function CompTile({ label, value, unit, delta, deltaGood }: { label: string; value?: number; unit: string; delta?: number; deltaGood?: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceElevated, borderRadius: radii.lg, padding: spacing[4] }}>
      <Text variant="caption" color="textSubtle">
        {label}
      </Text>
      <Text variant="subtitle" style={{ marginTop: spacing[1] }}>
        {value != null ? `${value.toFixed(1)} ${unit}` : '—'}
      </Text>
      {delta != null && Math.abs(delta) >= 0.05 ? (
        <Text variant="caption" style={{ color: deltaGood ? colors.accentData : colors.error, marginTop: 2, fontWeight: '600' }}>
          {delta > 0 ? '▲ +' : '▼ '}
          {Math.abs(delta).toFixed(1)}
        </Text>
      ) : null}
    </View>
  );
}

/** Poids & composition corporelle (mockup #10) — real weight/body-fat/muscle trends. */
export function WeightScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { data: health = [] } = useHealthMetrics();
  const addMetric = useAddHealthMetric();
  const asOf = new Date().toISOString();
  const [period, setPeriod] = useState<PeriodKey>('90');
  const days = PERIODS.find((p) => p.key === period)!.days;
  const [adding, setAdding] = useState(false);
  const [weightInput, setWeightInput] = useState('');

  const submitWeight = (): void => {
    const value = Number(weightInput.trim().replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) return;
    addMetric.mutate(
      { type: 'weight', value, unit: 'kg' },
      { onSuccess: () => { setWeightInput(''); setAdding(false); } },
    );
  };

  const points = useMemo(() => weightTrend(health, asOf, days), [health, asOf, days]);
  const summary = useMemo(() => summarizeTrend(points), [points]);

  const trend = (type: HealthMetricType) => {
    const now = new Date(asOf).getTime();
    const pts = health.filter((m) => m.type === type && (now - new Date(m.measuredAt).getTime()) / 86_400_000 < days).sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
    if (pts.length < 2) return { last: pts.at(-1)?.value, delta: undefined as number | undefined };
    return { last: pts.at(-1)!.value, delta: pts.at(-1)!.value - pts[0]!.value };
  };
  const bodyFat = trend('body_fat');
  const muscle = trend('muscle_mass');
  const currentWeight = summary?.last ?? latest(health, 'weight');

  return (
    <Screen scroll>
      <Text variant="title">Poids</Text>
      <Text variant="caption" color="textMuted">
        Ton poids et ta composition corporelle dans le temps.
      </Text>

      <SegmentedControl options={PERIODS.map((p) => ({ value: p.key, label: p.label }))} value={period} onChange={setPeriod} />

      <View style={{ alignItems: 'flex-start' }}>
        <Button
          label={adding ? 'Annuler' : '+ Ajouter une pesée'}
          variant="secondary"
          onPress={() => setAdding((v) => !v)}
        />
      </View>
      {adding ? (
        <Card>
          <Input
            label="Poids (kg)"
            placeholder="Ex. 72.5"
            keyboardType="decimal-pad"
            value={weightInput}
            onChangeText={setWeightInput}
          />
          <View style={{ marginTop: spacing[3], alignItems: 'flex-start' }}>
            <Button
              label={addMetric.isPending ? 'Enregistrement…' : 'Enregistrer'}
              onPress={submitWeight}
              disabled={addMetric.isPending || weightInput.trim() === ''}
            />
          </View>
        </Card>
      ) : null}

      {currentWeight == null ? (
        <EmptyState icon={<Icon name="scale" size={44} color={colors.textSubtle} />} title="Aucune pesée" message="Connecte une balance (Renpho via Apple Santé), importe tes données, ou ajoute une pesée manuellement ci-dessus." />
      ) : (
        <>
          {/* Poids courant + tendance */}
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <View>
                <Text variant="display">{currentWeight.toFixed(1)}</Text>
                <Text variant="caption" color="textSubtle">
                  kg · aujourd'hui
                </Text>
              </View>
              {summary && Math.abs(summary.changeAbs) >= 0.05 ? (
                <Badge label={`${summary.changeAbs > 0 ? '+' : ''}${summary.changeAbs.toFixed(1)} kg`} tone={summary.direction === 'down' ? 'success' : summary.direction === 'up' ? 'warning' : 'info'} />
              ) : null}
            </View>
            {points.length >= 2 ? (
              <View style={{ marginTop: spacing[3] }}>
                <Sparkline values={points.map((p) => p.value)} width={300} height={64} color={colors.primary} />
              </View>
            ) : (
              <Text variant="caption" color="textMuted" style={{ marginTop: spacing[2] }}>
                Une seule mesure sur la période — enregistre d'autres pesées pour voir la courbe.
              </Text>
            )}
            {summary ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing[3], paddingTop: spacing[3], borderTopWidth: 1, borderTopColor: colors.border }}>
                <MiniStat label="Min" value={`${summary.min.toFixed(1)}`} />
                <MiniStat label="Max" value={`${summary.max.toFixed(1)}`} />
                <MiniStat label="Départ" value={`${summary.first.toFixed(1)}`} />
              </View>
            ) : null}
          </Card>

          {/* Composition corporelle */}
          <Text variant="heading">Composition corporelle</Text>
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <CompTile label="Masse grasse" value={bodyFat.last} unit="%" delta={bodyFat.delta} deltaGood={(bodyFat.delta ?? 0) <= 0} />
            <CompTile label="Masse musculaire" value={muscle.last} unit="kg" delta={muscle.delta} deltaGood={(muscle.delta ?? 0) >= 0} />
          </View>
          <Text variant="caption" color="textSubtle">
            Masse grasse et musculaire proviennent de ta balance connectée (Renpho via Apple Santé).
          </Text>
        </>
      )}

      <View style={{ alignItems: 'flex-start' }}>
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

function MiniStat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text variant="caption" color="textSubtle">
        {label}
      </Text>
      <Text variant="subtitle" style={{ marginTop: 2 }}>
        {value}
      </Text>
    </View>
  );
}
