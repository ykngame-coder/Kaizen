import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Card, EmptyState, Screen, SegmentedControl, Sparkline, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import {
  ANALYTICS_PERIODS,
  computeWellnessIndex,
  correlate,
  dailyMeans,
  dailySums,
  type CorrelationInsight,
} from '@supotsu/engines';
import type { TrendPoint } from '@supotsu/engines';
import {
  useActivities,
  useHealthMetrics,
  useNutritionEntries,
  useWellnessCheckins,
} from '@/lib/data/queries';

type PeriodKey = (typeof ANALYTICS_PERIODS)[number]['key'];

function Tile({
  label,
  value,
  sub,
  series,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  series: number[];
  color?: string;
}): React.JSX.Element {
  return (
    <Card>
      <Text variant="label" color="textMuted">
        {label.toUpperCase()}
      </Text>
      <Text variant="data" style={{ marginTop: spacing[1] }}>
        {value}
      </Text>
      {sub ? (
        <Text variant="caption" color="textMuted">
          {sub}
        </Text>
      ) : null}
      {series.length >= 2 ? (
        <View style={{ marginTop: spacing[2] }}>
          <Sparkline values={series} width={130} height={40} color={color} />
        </View>
      ) : null}
    </Card>
  );
}

const mean = (xs: number[]): number => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const notNull = (xs: (number | null)[]): number[] => xs.filter((x): x is number => x !== null);

/** Cross-pillar analytics (Master Prompt P34): trends per period + correlations. */
export function AnalyticsScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const asOf = new Date().toISOString();

  const { data: activities = [] } = useActivities();
  const { data: metrics = [] } = useHealthMetrics();
  const { data: nutrition = [] } = useNutritionEntries();
  const { data: checkins = [] } = useWellnessCheckins();

  const [period, setPeriod] = useState<PeriodKey>('4sem');
  const days = ANALYTICS_PERIODS.find((p) => p.key === period)!.days;

  const series = useMemo(() => {
    const trainingPts: TrendPoint[] = activities.map((a) => ({ date: a.startedAt, value: a.durationSec / 60 }));
    const sleepPts: TrendPoint[] = metrics
      .filter((m) => m.type === 'sleep_duration')
      .map((m) => ({ date: m.measuredAt, value: m.value }));
    const kcalPts: TrendPoint[] = nutrition.map((n) => ({ date: n.loggedAt, value: n.kcal }));
    const wellnessPts: TrendPoint[] = checkins.map((c) => ({
      date: c.checkedAt,
      value: computeWellnessIndex([c], c.checkedAt).value,
    }));
    return {
      training: dailySums(trainingPts, asOf, days),
      sleep: dailyMeans(sleepPts, asOf, days),
      kcal: dailySums(kcalPts, asOf, days),
      wellness: dailyMeans(wellnessPts, asOf, days),
    };
  }, [activities, metrics, nutrition, checkins, asOf, days]);

  const sessions = series.training.filter((m) => m > 0).length;
  const totalMinutes = Math.round(series.training.reduce((s, m) => s + m, 0));
  const avgSleep = mean(notNull(series.sleep));
  const avgWellness = Math.round(mean(notNull(series.wellness)));
  const kcalDays = series.kcal.filter((k) => k > 0);
  const avgKcal = Math.round(mean(kcalDays));

  const hasAny = sessions > 0 || notNull(series.sleep).length > 0 || checkins.length > 0 || kcalDays.length > 0;

  // Explained correlations across pillars.
  const insights = useMemo(() => {
    const out: { text: string; insight: CorrelationInsight }[] = [];
    const add = (
      a: (number | null)[],
      b: (number | null)[],
      pos: string,
      neg: string,
    ): void => {
      const c = correlate(a, b);
      if (c && c.strength !== 'négligeable') {
        out.push({ insight: c, text: c.direction === 'positive' ? pos : neg });
      }
    };
    add(
      series.sleep,
      series.wellness,
      'Mieux tu dors, mieux tu te sens les mêmes jours.',
      'Tes nuits plus courtes coïncident avec un meilleur ressenti — à surveiller.',
    );
    add(
      series.training.map((v) => (v > 0 ? v : null)),
      series.sleep,
      'Tes jours d’entraînement s’accompagnent de nuits plus longues.',
      'Tes grosses journées d’entraînement riment avec des nuits plus courtes.',
    );
    add(
      series.training.map((v) => (v > 0 ? v : null)),
      series.wellness,
      'Bouger va de pair avec un meilleur moral chez toi.',
      'Les journées très chargées pèsent sur ton moral — pense à récupérer.',
    );
    return out;
  }, [series]);

  return (
    <Screen scroll>
      <Text variant="title">Analyses & tendances</Text>
      <Text variant="caption" color="textMuted">
        Une vue transversale de tes piliers — et ce qui influence quoi, expliqué.
      </Text>

      <SegmentedControl
        options={ANALYTICS_PERIODS.map((p) => ({ value: p.key, label: p.label }))}
        value={period}
        onChange={setPeriod}
      />

      {!hasAny ? (
        <EmptyState
          icon="📊"
          title="Pas encore assez de données"
          message="Enregistre des activités, des nuits et des check-in pour voir tes tendances et corrélations."
        />
      ) : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] }}>
            <View style={{ flex: 1, minWidth: 150 }}>
              <Tile
                label="Charge"
                value={`${sessions}`}
                sub={`séances · ${totalMinutes} min`}
                series={series.training}
                color={colors.accentStrength}
              />
            </View>
            <View style={{ flex: 1, minWidth: 150 }}>
              <Tile
                label="Sommeil"
                value={avgSleep > 0 ? `${avgSleep.toFixed(1)} h` : '—'}
                sub="moyenne / nuit"
                series={notNull(series.sleep)}
                color={colors.accentRecovery}
              />
            </View>
            <View style={{ flex: 1, minWidth: 150 }}>
              <Tile
                label="Bien-être"
                value={avgWellness > 0 ? `${avgWellness}` : '—'}
                sub="indice moyen /100"
                series={notNull(series.wellness)}
                color={colors.success}
              />
            </View>
            <View style={{ flex: 1, minWidth: 150 }}>
              <Tile
                label="Nutrition"
                value={avgKcal > 0 ? `${avgKcal}` : '—'}
                sub="kcal / jour"
                series={kcalDays}
                color={colors.accentEndurance}
              />
            </View>
          </View>

          <Card>
            <Text variant="heading">Corrélations expliquées</Text>
            {insights.length === 0 ? (
              <Text variant="body" color="textMuted">
                Pas encore de lien net sur cette période — continue à enregistrer tes données.
              </Text>
            ) : (
              <View style={{ gap: spacing[3], marginTop: spacing[1] }}>
                {insights.map((it, i) => (
                  <View key={i} style={{ gap: spacing[1] }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                      <Badge
                        label={`Corrélation ${it.insight.strength}`}
                        tone={it.insight.direction === 'positive' ? 'success' : 'warning'}
                      />
                      <Text variant="caption" color="textSubtle">
                        r = {it.insight.r.toFixed(2)} · {it.insight.pairs} jours
                      </Text>
                    </View>
                    <Text variant="body">{it.text}</Text>
                  </View>
                ))}
              </View>
            )}
            <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[2] }}>
              Corrélation n'est pas causalité — ces liens sont des pistes, pas des verdicts.
            </Text>
          </Card>
        </>
      )}

      <View style={{ alignItems: 'flex-start' }}>
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
