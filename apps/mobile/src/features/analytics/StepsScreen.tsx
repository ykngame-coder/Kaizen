import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, EmptyState, Icon, Input, ProgressRing, Screen, SegmentedControl, Sparkline, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { computeStepsBaseline, stepsTrend, summarizeTrend } from '@supotsu/engines';
import { useAddHealthMetric, useHealthMetrics } from '@/lib/data/queries';
import { usePreferences } from '@/lib/preferences';
import { formatDate } from '@/lib/format';

const PERIODS = [
  { key: '30', label: '30 j', days: 30 },
  { key: '90', label: '90 j', days: 90 },
  { key: '365', label: '1 an', days: 365 },
] as const;
type PeriodKey = (typeof PERIODS)[number]['key'];

/** Pas — daily steps trend, today vs goal, and the 60-day baseline behind the Actif pillar. */
export function StepsScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { preferences } = usePreferences();
  const { data: health = [] } = useHealthMetrics();
  const addMetric = useAddHealthMetric();
  const asOf = new Date().toISOString();
  const todayKey = asOf.slice(0, 10);
  const [period, setPeriod] = useState<PeriodKey>('30');
  const days = PERIODS.find((p) => p.key === period)!.days;
  const [adding, setAdding] = useState(false);
  const [stepsInput, setStepsInput] = useState('');

  const submitSteps = (): void => {
    const value = Number(stepsInput.trim().replace(/[^0-9]/g, ''));
    if (!Number.isFinite(value) || value <= 0) return;
    addMetric.mutate(
      { type: 'steps', value, unit: 'steps' },
      { onSuccess: () => { setStepsInput(''); setAdding(false); } },
    );
  };

  const points = useMemo(() => stepsTrend(health, asOf, days), [health, asOf, days]);
  const summary = useMemo(() => summarizeTrend(points), [points]);
  const baseline = useMemo(() => computeStepsBaseline(health, asOf), [health, asOf]);

  const todaySteps = useMemo(
    () => points.find((p) => p.date.slice(0, 10) === todayKey)?.value ?? 0,
    [points, todayKey],
  );
  const goal = preferences.dailyStepsGoal;
  const todayPct = goal > 0 ? Math.min(100, Math.round((todaySteps / goal) * 100)) : 0;

  const hasAnyData = points.length > 0;

  return (
    <Screen scroll>
      <Text variant="title">{t('analytics.steps.title')}</Text>
      <Text variant="caption" color="textMuted">
        {t('analytics.steps.subtitle')}
      </Text>

      <SegmentedControl options={PERIODS.map((p) => ({ value: p.key, label: p.label }))} value={period} onChange={setPeriod} />

      <View style={{ alignItems: 'flex-start' }}>
        <Button
          label={adding ? t('common.cancel') : t('analytics.steps.add')}
          variant="secondary"
          onPress={() => setAdding((v) => !v)}
        />
      </View>
      {adding ? (
        <Card>
          <Input
            label={t('analytics.steps.inputLabel')}
            placeholder={t('analytics.steps.inputPlaceholder')}
            keyboardType="number-pad"
            value={stepsInput}
            onChangeText={setStepsInput}
          />
          <View style={{ marginTop: spacing[3], alignItems: 'flex-start' }}>
            <Button
              label={addMetric.isPending ? t('analytics.steps.saving') : t('common.save')}
              onPress={submitSteps}
              disabled={addMetric.isPending || stepsInput.trim() === ''}
            />
          </View>
        </Card>
      ) : null}

      {!hasAnyData ? (
        <EmptyState icon={<Icon name="footsteps" size={44} color={colors.textSubtle} />} title={t('analytics.steps.emptyState.title')} message={t('analytics.steps.emptyState.message')} />
      ) : (
        <>
          {/* Aujourd'hui vs objectif */}
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[4] }}>
              <ProgressRing value={todayPct} size={104} thickness={9} color={colors.primary} centerLabel={`${todayPct}%`} />
              <View style={{ flex: 1 }}>
                <Text variant="display">{todaySteps.toLocaleString('fr-FR')}</Text>
                <Text variant="caption" color="textSubtle">
                  {t('analytics.steps.today.goalSuffix', { goal: goal.toLocaleString('fr-FR') })}
                </Text>
              </View>
            </View>
            {points.length >= 2 ? (
              <View style={{ marginTop: spacing[4] }}>
                <Sparkline values={points.map((p) => p.value)} width={300} height={64} color={colors.primary} />
              </View>
            ) : (
              <Text variant="caption" color="textMuted" style={{ marginTop: spacing[2] }}>
                {t('analytics.steps.singlePoint')}
              </Text>
            )}
            {summary ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing[3], paddingTop: spacing[3], borderTopWidth: 1, borderTopColor: colors.border }}>
                <MiniStat label={t('analytics.steps.stats.min')} value={summary.min.toLocaleString('fr-FR')} />
                <MiniStat label={t('analytics.steps.stats.max')} value={summary.max.toLocaleString('fr-FR')} />
                <MiniStat
                  label={t('analytics.steps.stats.avg')}
                  value={Math.round(points.reduce((s, p) => s + p.value, 0) / points.length).toLocaleString('fr-FR')}
                />
              </View>
            ) : null}
          </Card>

          {/* Détail jour par jour : la courbe donne la forme, pas les valeurs —
              impossible jusqu'ici de relire les pas d'un jour précis
              (retour TestFlight). Plus récent en premier. */}
          <Card>
            <Text variant="heading">{t('analytics.steps.daily.heading')}</Text>
            <View style={{ marginTop: spacing[2] }}>
              {[...points].reverse().map((pt, i) => {
                const key = pt.date.slice(0, 10);
                const pct = goal > 0 ? Math.min(100, Math.round((pt.value / goal) * 100)) : 0;
                return (
                  <View
                    key={key}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: spacing[3],
                      paddingVertical: spacing[2],
                      borderBottomWidth: i < points.length - 1 ? 1 : 0, borderBottomColor: colors.border,
                    }}
                  >
                    <Text variant="body" style={{ flex: 1, fontWeight: key === todayKey ? '700' : '400' }}>
                      {key === todayKey ? t('analytics.steps.daily.today') : formatDate(pt.date)}
                    </Text>
                    <Text variant="caption" color={pct >= 100 ? 'accentData' : 'textSubtle'}>{pct}%</Text>
                    <Text variant="body" style={{ fontWeight: '600', minWidth: 72, textAlign: 'right' }}>
                      {pt.value.toLocaleString('fr-FR')}
                    </Text>
                  </View>
                );
              })}
            </View>
          </Card>

          {/* Baseline 60 jours — alimente le pilier Actif */}
          {baseline ? (
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text variant="heading">{t('analytics.steps.baseline.heading')}</Text>
                <Badge label={Math.round(baseline.averagePerDay).toLocaleString('fr-FR')} tone="info" />
              </View>
              <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[1] }}>
                {t('analytics.steps.baseline.note')}
              </Text>
            </Card>
          ) : null}

          <View style={{ alignItems: 'flex-start' }}>
            <Text variant="caption" color="primary" onPress={() => router.push('/profile/settings')}>
              {t('analytics.steps.goalLink')}
            </Text>
          </View>
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
