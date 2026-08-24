import React, { useMemo, useState } from 'react';
import { Share, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, EmptyState, Icon, Screen, SegmentedControl, Sparkline, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { ActivityType } from '@supotsu/core';
import {
  ANALYTICS_PERIODS,
  acwrZone,
  computeAcwr,
  computeRecoveryScore,
  computeWellnessIndex,
  correlate,
  dailyMeans,
  dailySums,
  recoveryBand,
  sleepTrend,
  weightTrend,
  type CorrelationInsight,
  type TrendPoint,
} from '@supotsu/engines';
import { useActivities, useHealthMetrics, useNutritionEntries, useRecords, useWellnessCheckins } from '@/lib/data/queries';
import { useAuth } from '@/features/auth/AuthProvider';
import { createDataRepository, exportUserData } from '@/lib/data/repository';
import { formatDate } from '@/lib/format';

const DAY_MS = 86_400_000;
type PeriodKey = (typeof ANALYTICS_PERIODS)[number]['key'];

const DIST_COLORS = ['#2d7ff9', '#2be38b', '#f5b742', '#19d3a2', '#8b5cf6', '#3bcbff', '#ff7a8a', '#ff8b5e', '#aab6c5', '#748092'];

const mean = (xs: number[]): number => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const notNull = (xs: (number | null)[]): number[] => xs.filter((x): x is number => x !== null);

function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }): React.JSX.Element {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: spacing[3] }}>
      <Text variant="heading">{children}</Text>
      {right}
    </View>
  );
}

function Kpi({ label, value, unit, color }: { label: string; value: string; unit?: string; color?: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ flexGrow: 1, flexBasis: '30%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing[3] }}>
      <Text variant="caption" color="textSubtle">{label}</Text>
      <Text variant="subtitle" style={{ marginTop: spacing[1], letterSpacing: -0.4, color: color ?? colors.text }}>
        {value}{unit ? <Text variant="caption" color="textSubtle"> {unit}</Text> : null}
      </Text>
    </View>
  );
}

/** Statistiques (mockup #13) — KPIs, evolution, distribution, load, correlations, records, heatmap, compare, export. */
export function AnalyticsScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useAuth();
  const asOf = useMemo(() => new Date().toISOString(), []);
  const now = useMemo(() => new Date(asOf), [asOf]);

  const { data: activities = [] } = useActivities();
  const { data: metrics = [] } = useHealthMetrics();
  const { data: nutrition = [] } = useNutritionEntries();
  const { data: checkins = [] } = useWellnessCheckins();
  const { data: records = [] } = useRecords();

  const ACTIVITY_LABEL: Record<ActivityType, string> = useMemo(() => ({
    walking: t('analytics.screen.activityLabels.walking'), running: t('analytics.screen.activityLabels.running'), cycling: t('analytics.screen.activityLabels.cycling'), swimming: t('analytics.screen.activityLabels.swimming'), strength: t('analytics.screen.activityLabels.strength'),
    cross_training: t('analytics.screen.activityLabels.crossTraining'), hyrox: t('analytics.screen.activityLabels.hyrox'), mobility: t('analytics.screen.activityLabels.mobility'), yoga: t('analytics.screen.activityLabels.yoga'), other: t('analytics.screen.activityLabels.other'),
  }), [t]);

  const [period, setPeriod] = useState<PeriodKey>('4sem');
  const days = ANALYTICS_PERIODS.find((p) => p.key === period)!.days;
  const [exporting, setExporting] = useState(false);

  // Series over the selected period.
  const series = useMemo(() => {
    const sleepPts: TrendPoint[] = metrics.filter((m) => m.type === 'sleep_duration').map((m) => ({ date: m.measuredAt, value: m.value }));
    const kcalPts: TrendPoint[] = nutrition.map((n) => ({ date: n.loggedAt, value: n.kcal }));
    const wellnessPts: TrendPoint[] = checkins.map((c) => ({ date: c.checkedAt, value: computeWellnessIndex([c], c.checkedAt).value }));
    const trainingPts: TrendPoint[] = activities.map((a) => ({ date: a.startedAt, value: a.durationSec / 60 }));
    return {
      sleep: dailyMeans(sleepPts, asOf, days),
      kcal: dailySums(kcalPts, asOf, days),
      wellness: dailyMeans(wellnessPts, asOf, days),
      training: dailySums(trainingPts, asOf, days),
    };
  }, [metrics, nutrition, checkins, activities, asOf, days]);

  const recovery = useMemo(() => computeRecoveryScore(metrics, asOf), [metrics, asOf]);
  const acwr = useMemo(() => computeAcwr(activities, asOf), [activities, asOf]);
  const weightPts = useMemo(() => weightTrend(metrics, asOf, days), [metrics, asOf, days]);
  const recoveryPts = useMemo(() => {
    const out: number[] = [];
    for (let i = Math.min(days, 30) - 1; i >= 0; i -= 1) {
      const r = computeRecoveryScore(metrics, new Date(now.getTime() - i * DAY_MS).toISOString());
      if (r.confidence !== 'to_confirm') out.push(r.value);
    }
    return out;
  }, [metrics, now, days]);
  const hrvPts = useMemo(() => metrics.filter((m) => m.type === 'hrv').sort((a, b) => a.measuredAt.localeCompare(b.measuredAt)).slice(-30).map((m) => m.value), [metrics]);

  const weight = metrics.filter((m) => m.type === 'weight').sort((a, b) => a.measuredAt.localeCompare(b.measuredAt)).at(-1)?.value;
  const avgSleep = mean(notNull(series.sleep));
  const kcalDays = series.kcal.filter((k) => k > 0);
  const sessions = series.training.filter((m) => m > 0).length;

  // Activity type distribution.
  const distribution = useMemo(() => {
    const since = now.getTime() - days * DAY_MS;
    const counts = new Map<ActivityType, number>();
    for (const a of activities) {
      if (new Date(a.startedAt).getTime() < since) continue;
      counts.set(a.type, (counts.get(a.type) ?? 0) + 1);
    }
    const total = [...counts.values()].reduce((s, v) => s + v, 0);
    return { total, items: [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([type, n], i) => ({ type, n, pct: total ? Math.round((n / total) * 100) : 0, color: DIST_COLORS[i % DIST_COLORS.length]! })) };
  }, [activities, now, days]);

  // ACWR daily bars (28d training minutes).
  const loadBars = useMemo(() => dailySums(activities.map((a) => ({ date: a.startedAt, value: a.durationSec / 60 })), asOf, 28), [activities, asOf]);
  const loadMax = Math.max(1, ...loadBars);

  // Correlations (real).
  const insights = useMemo(() => {
    const out: { text: string; insight: CorrelationInsight }[] = [];
    const add = (a: (number | null)[], b: (number | null)[], pos: string, neg: string): void => {
      const c = correlate(a, b);
      if (c && c.strength !== 'négligeable') out.push({ insight: c, text: c.direction === 'positive' ? pos : neg });
    };
    add(series.sleep, series.wellness, t('analytics.screen.correlations.sleepWellnessPositive'), t('analytics.screen.correlations.sleepWellnessNegative'));
    add(series.training.map((v) => (v > 0 ? v : null)), series.sleep, t('analytics.screen.correlations.trainingSleepPositive'), t('analytics.screen.correlations.trainingSleepNegative'));
    add(series.training.map((v) => (v > 0 ? v : null)), series.wellness, t('analytics.screen.correlations.trainingWellnessPositive'), t('analytics.screen.correlations.trainingWellnessNegative'));
    return out;
  }, [series, t]);

  // Heatmap: last 18 weeks of activity (0–3 intensity by daily count).
  const heat = useMemo(() => {
    const WEEKS = 18;
    const counts = new Map<string, number>();
    for (const a of activities) {
      const k = a.startedAt.slice(0, 10);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const cols: number[][] = [];
    const start = new Date(now.getTime() - (WEEKS * 7 - 1) * DAY_MS);
    for (let w = 0; w < WEEKS; w += 1) {
      const col: number[] = [];
      for (let d = 0; d < 7; d += 1) {
        const day = new Date(start.getTime() + (w * 7 + d) * DAY_MS);
        const n = counts.get(day.toISOString().slice(0, 10)) ?? 0;
        col.push(day.getTime() > now.getTime() ? -1 : Math.min(3, n));
      }
      cols.push(col);
    }
    return cols;
  }, [activities, now]);
  const heatColor = (v: number): string => (v < 0 ? 'transparent' : ['#0e1a26', '#1d4d3a', '#2a8f5f', '#2be38b'][v]!);

  // Comparison: last 30d vs previous 30d.
  const compare = useMemo(() => {
    const avgMetric = (type: string, a: number, b: number): number | null => {
      const vals = metrics.filter((m) => m.type === type && new Date(m.measuredAt).getTime() >= now.getTime() - a * DAY_MS && new Date(m.measuredAt).getTime() < now.getTime() - b * DAY_MS).map((m) => m.value);
      return vals.length ? mean(vals) : null;
    };
    const nights = sleepTrend(metrics, asOf, 60);
    const sleepNow = mean(nights.filter((n) => new Date(n.date).getTime() >= now.getTime() - 30 * DAY_MS).map((n) => n.hours));
    const sleepPrev = mean(nights.filter((n) => new Date(n.date).getTime() < now.getTime() - 30 * DAY_MS).map((n) => n.hours));
    return {
      weightNow: avgMetric('weight', 30, 0), weightPrev: avgMetric('weight', 60, 30),
      hrvNow: avgMetric('hrv', 30, 0), hrvPrev: avgMetric('hrv', 60, 30),
      sleepNow, sleepPrev,
    };
  }, [metrics, now, asOf]);

  const hasAny = sessions > 0 || notNull(series.sleep).length > 0 || checkins.length > 0 || kcalDays.length > 0 || weightPts.length > 0;

  const onExport = async (): Promise<void> => {
    if (!user) return;
    setExporting(true);
    try {
      const data = await exportUserData(createDataRepository(), user.id);
      await Share.share({ message: JSON.stringify(data, null, 2) });
    } catch {
      /* ignore */
    } finally {
      setExporting(false);
    }
  };

  return (
    <Screen scroll>
      <Text variant="title">{t('analytics.screen.title')}</Text>
      <Text variant="caption" color="textSubtle">{t('analytics.screen.subtitle')}</Text>

      <SegmentedControl options={ANALYTICS_PERIODS.map((p) => ({ value: p.key, label: p.label }))} value={period} onChange={setPeriod} />

      {!hasAny ? (
        <EmptyState icon={<Icon name="chartBar" size={44} color={colors.textSubtle} />} title={t('analytics.screen.emptyState.title')} message={t('analytics.screen.emptyState.message')} />
      ) : (
        <>
          {/* KPI */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] }}>
            <Kpi label={t('analytics.screen.kpi.recovery')} value={recovery.confidence !== 'to_confirm' ? `${recovery.value}` : '—'} color={colors.accentData} />
            <Kpi label={t('analytics.screen.kpi.load')} value={acwr.ratio != null ? acwr.ratio.toFixed(2) : '—'} />
            <Kpi label={t('analytics.screen.kpi.weight')} value={weight != null ? weight.toFixed(1) : '—'} unit="kg" />
            <Kpi label={t('analytics.screen.kpi.avgSleep')} value={avgSleep > 0 ? avgSleep.toFixed(1) : '—'} unit="h" />
            <Kpi label={t('analytics.screen.kpi.sessions')} value={`${sessions}`} />
            <Kpi label={t('analytics.screen.kpi.avgKcal')} value={kcalDays.length ? `${Math.round(mean(kcalDays))}` : '—'} />
          </View>

          {/* Évolution globale */}
          {(weightPts.length >= 2 || recoveryPts.length >= 2 || hrvPts.length >= 2) ? (
            <Card>
              <SectionTitle right={<Text variant="caption" color="textSubtle">{ANALYTICS_PERIODS.find((p) => p.key === period)!.label}</Text>}>{t('analytics.screen.evolution.title')}</SectionTitle>
              {weightPts.length >= 2 ? <TrendLine label={t('analytics.screen.evolution.weight')} values={weightPts.map((p) => p.value)} color="#ff7a8a" /> : null}
              {recoveryPts.length >= 2 ? <TrendLine label={t('analytics.screen.evolution.recovery')} values={recoveryPts} color={colors.accentData} /> : null}
              {hrvPts.length >= 2 ? <TrendLine label={t('analytics.screen.evolution.hrv')} values={hrvPts} color={colors.accentEndurance} /> : null}
            </Card>
          ) : null}

          {/* Répartition des entraînements */}
          {distribution.total > 0 ? (
            <Card>
              <SectionTitle>{t('analytics.screen.distribution.title')}</SectionTitle>
              <View style={{ flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden' }}>
                {distribution.items.map((d) => (<View key={d.type} style={{ flex: d.n, backgroundColor: d.color }} />))}
              </View>
              <View style={{ marginTop: spacing[3], gap: spacing[2] }}>
                {distribution.items.map((d) => (
                  <View key={d.type} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                    <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: d.color }} />
                    <Text variant="body" style={{ flex: 1 }}>{ACTIVITY_LABEL[d.type]}</Text>
                    <Text variant="caption" color="textSubtle">{d.pct} %</Text>
                  </View>
                ))}
              </View>
            </Card>
          ) : null}

          {/* Charge ACWR */}
          <Card>
            <SectionTitle right={<Text variant="caption" color="textSubtle">{t('analytics.screen.load.period')}</Text>}>{t('analytics.screen.load.title')}</SectionTitle>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 110 }}>
              {loadBars.map((v, i) => {
                const ratio = v / loadMax;
                const c = ratio > 0.8 ? colors.accentStrength : ratio >= 0.4 ? colors.accentData : colors.accentEndurance;
                return <View key={i} style={{ flex: 1, height: Math.max(3, ratio * 110), borderRadius: 3, backgroundColor: v > 0 ? c : colors.surfaceElevated }} />;
              })}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing[3] }}>
              <Text variant="caption" color="textSubtle">{t('analytics.screen.load.ratioLabel')}</Text>
              {acwr.ratio != null ? <Badge label={`${acwr.ratio.toFixed(2)} · ${acwrZone(acwr.ratio)}`} tone={acwr.zone === 'optimal' ? 'success' : acwr.zone === 'risque' ? 'error' : 'info'} /> : <Text variant="caption" color="textSubtle">{t('analytics.screen.load.calibrate')}</Text>}
            </View>
          </Card>

          {/* Corrélations */}
          <Card>
            <SectionTitle>{t('analytics.screen.correlations.title')}</SectionTitle>
            {insights.length === 0 ? (
              <Text variant="body" color="textMuted">{t('analytics.screen.correlations.empty')}</Text>
            ) : (
              insights.map((it, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingVertical: spacing[2], borderBottomWidth: i < insights.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                  <Text variant="body" color="textMuted" style={{ flex: 1 }}>{it.text}</Text>
                  <Text variant="body" style={{ fontWeight: '800', color: it.insight.direction === 'positive' ? colors.accentData : colors.warning }}>r {it.insight.r.toFixed(2)}</Text>
                </View>
              ))
            )}
            <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[2] }}>{t('analytics.screen.correlations.disclaimer')}</Text>
          </Card>

          {/* Records */}
          {records.length > 0 ? (
            <Card>
              <SectionTitle>{t('analytics.screen.records.title')}</SectionTitle>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] }}>
                {records.slice(0, 6).map((r) => (
                  <View key={r.id} style={{ flexGrow: 1, flexBasis: '45%', backgroundColor: colors.surfaceElevated, borderRadius: radii.lg, padding: spacing[3] }}>
                    <Text variant="subtitle">{r.value} {r.unit}</Text>
                    <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>{r.label}</Text>
                    <Text variant="caption" color="textSubtle" style={{ marginTop: 2 }}>{formatDate(r.achievedAt)}</Text>
                  </View>
                ))}
              </View>
            </Card>
          ) : null}

          {/* Heatmap */}
          <Card>
            <SectionTitle>{t('analytics.screen.heatmap.title')}</SectionTitle>
            <View style={{ flexDirection: 'row', gap: 3 }}>
              {heat.map((col, i) => (
                <View key={i} style={{ gap: 3 }}>
                  {col.map((v, j) => (<View key={j} style={{ width: 11, height: 11, borderRadius: 3, backgroundColor: heatColor(v) }} />))}
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'flex-end', marginTop: spacing[2] }}>
              <Text variant="caption" color="textSubtle">{t('analytics.screen.heatmap.less')}</Text>
              {[0, 1, 2, 3].map((v) => (<View key={v} style={{ width: 11, height: 11, borderRadius: 3, backgroundColor: heatColor(v) }} />))}
              <Text variant="caption" color="textSubtle">{t('analytics.screen.heatmap.more')}</Text>
            </View>
          </Card>

          {/* Comparaison */}
          <Card>
            <SectionTitle right={<Text variant="caption" color="textSubtle">{t('analytics.screen.compare.period')}</Text>}>{t('analytics.screen.compare.title')}</SectionTitle>
            <CompareRow label={t('analytics.screen.compare.recovery')} now={recovery.confidence !== 'to_confirm' ? `${recovery.value}` : '—'} />
            <CompareRow label={t('analytics.screen.compare.weight')} now={compare.weightNow != null ? compare.weightNow.toFixed(1) : '—'} prev={compare.weightPrev != null ? compare.weightPrev.toFixed(1) : undefined} />
            <CompareRow label={t('analytics.screen.compare.hrv')} now={compare.hrvNow != null ? `${Math.round(compare.hrvNow)}` : '—'} prev={compare.hrvPrev != null ? `${Math.round(compare.hrvPrev)}` : undefined} />
            <CompareRow label={t('analytics.screen.compare.avgSleep')} now={compare.sleepNow > 0 ? `${compare.sleepNow.toFixed(1)} h` : '—'} prev={compare.sleepPrev > 0 ? `${compare.sleepPrev.toFixed(1)} h` : undefined} last />
          </Card>

          {/* Rapport IA */}
          <View style={{ borderRadius: radii.xl, borderWidth: 1, borderColor: 'rgba(45,127,249,0.25)', backgroundColor: 'rgba(45,127,249,0.08)', padding: spacing[5] }}>
            <View style={{ flexDirection: 'row', gap: spacing[2], alignItems: 'center' }}><Icon name="brain" size={20} color={colors.info} /><Text variant="heading">{t('analytics.screen.report.title')}</Text></View>
            <Text variant="body" color="textMuted" style={{ marginTop: spacing[2], lineHeight: 22 }}>
              {recovery.confidence !== 'to_confirm' ? t('analytics.screen.report.recoveryText', { band: recoveryBand(recovery.value) }) : ''}
              {sessions > 0 ? t('analytics.screen.report.sessions', { count: sessions }) : ''}
              {avgSleep > 0 && avgSleep < 7.5 ? t('analytics.screen.report.sleepImprove') : avgSleep >= 7.5 ? t('analytics.screen.report.sleepGood') : ''}
            </Text>
          </View>

          {/* Export */}
          <Card>
            <SectionTitle>{t('analytics.screen.export.title')}</SectionTitle>
            <View style={{ flexDirection: 'row', gap: spacing[2] }}>
              <Button label={exporting ? t('analytics.screen.export.exporting') : t('analytics.screen.export.exportJson')} onPress={onExport} disabled={exporting || !user} />
              <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
            </View>
          </Card>
        </>
      )}
    </Screen>
  );
}

function TrendLine({ label, values, color }: { label: string; values: number[]; color: string }): React.JSX.Element {
  return (
    <View style={{ marginBottom: spacing[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginBottom: spacing[1] }}>
        <View style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: color }} />
        <Text variant="caption" color="textMuted">{label}</Text>
      </View>
      <Sparkline values={values} width={300} height={44} color={color} />
    </View>
  );
}

function CompareRow({ label, now, prev, last }: { label: string; now: string; prev?: string; last?: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing[2], borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border }}>
      <Text variant="body" color="textMuted" style={{ flex: 1 }}>{label}</Text>
      <Text variant="body" style={{ fontWeight: '700' }}>{now}</Text>
      {prev ? <Text variant="caption" color="textSubtle" style={{ marginLeft: spacing[2] }}>← {prev}</Text> : null}
    </View>
  );
}
