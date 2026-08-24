import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
      <Text variant="title">{t('analytics.weight.title')}</Text>
      <Text variant="caption" color="textMuted">
        {t('analytics.weight.subtitle')}
      </Text>

      <SegmentedControl options={PERIODS.map((p) => ({ value: p.key, label: p.label }))} value={period} onChange={setPeriod} />

      <View style={{ alignItems: 'flex-start' }}>
        <Button
          label={adding ? t('common.cancel') : t('analytics.weight.add')}
          variant="secondary"
          onPress={() => setAdding((v) => !v)}
        />
      </View>
      {adding ? (
        <Card>
          <Input
            label={t('analytics.weight.inputLabel')}
            placeholder={t('analytics.weight.inputPlaceholder')}
            keyboardType="decimal-pad"
            value={weightInput}
            onChangeText={setWeightInput}
          />
          <View style={{ marginTop: spacing[3], alignItems: 'flex-start' }}>
            <Button
              label={addMetric.isPending ? t('analytics.weight.saving') : t('common.save')}
              onPress={submitWeight}
              disabled={addMetric.isPending || weightInput.trim() === ''}
            />
          </View>
        </Card>
      ) : null}

      {currentWeight == null ? (
        <EmptyState icon={<Icon name="scale" size={44} color={colors.textSubtle} />} title={t('analytics.weight.emptyState.title')} message={t('analytics.weight.emptyState.message')} />
      ) : (
        <>
          {/* Poids courant + tendance */}
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <View>
                <Text variant="display">{currentWeight.toFixed(1)}</Text>
                <Text variant="caption" color="textSubtle">
                  {t('analytics.weight.current.unit')}
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
                {t('analytics.weight.singlePoint')}
              </Text>
            )}
            {summary ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing[3], paddingTop: spacing[3], borderTopWidth: 1, borderTopColor: colors.border }}>
                <MiniStat label={t('analytics.weight.stats.min')} value={`${summary.min.toFixed(1)}`} />
                <MiniStat label={t('analytics.weight.stats.max')} value={`${summary.max.toFixed(1)}`} />
                <MiniStat label={t('analytics.weight.stats.start')} value={`${summary.first.toFixed(1)}`} />
              </View>
            ) : null}
          </Card>

          {/* Composition corporelle */}
          <Text variant="heading">{t('analytics.weight.composition.title')}</Text>
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <CompTile label={t('analytics.weight.composition.bodyFat')} value={bodyFat.last} unit="%" delta={bodyFat.delta} deltaGood={(bodyFat.delta ?? 0) <= 0} />
            <CompTile label={t('analytics.weight.composition.muscleMass')} value={muscle.last} unit="kg" delta={muscle.delta} deltaGood={(muscle.delta ?? 0) >= 0} />
          </View>
          <Text variant="caption" color="textSubtle">
            {t('analytics.weight.composition.source')}
          </Text>
        </>
      )}

      <View style={{ alignItems: 'flex-start' }}>
        <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
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
