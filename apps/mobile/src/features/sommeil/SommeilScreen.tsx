import React, { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, EmptyState, Icon, ProgressRing, Screen, Sparkline, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { HealthMetric, SleepSession, SleepStage } from '@supotsu/core';
import {
  averageSleepHours,
  computeAcwr,
  computeCircadianProfile,
  computeSleepScore2,
  computeWellnessIndex,
  predictNextDayEnergy,
  sleepBand,
  sleepCoaching,
  sleepDebtHours,
  sleepTrend,
  wellnessBand,
  type FatigueRisk,
  type SleepBand,
  type SleepNight,
} from '@supotsu/engines';
import { useActivities, useHealthMetrics, useLeaderboardPrefs, useRecordDailyScore, useSleepSessions, useWellnessCheckins } from '@/lib/data/queries';
import { useManualHealthKitSync } from '@/features/connectors/useHealthKitAutoSync';
import { formatClock, formatClockFromIso, usePreferences, type TimeFormat } from '@/lib/preferences';
import { DayNav, useSelectedDay } from '@/features/navigation/DayNav';
import { ComprendreCard } from '@/features/knowledge/ComprendreCard';
import { ObjectifsCard } from '@/features/goals/ObjectifsCard';
import { isTodayLocal } from '@/features/community/leaderboardHelpers';
import { resolveSommeilCardOrder } from './sommeilCards';

const DAY_MS = 86_400_000;
/** Sleep debt trend card: how many trailing days to plot, one point per day. */
const DEBT_TREND_DAYS = 30;

const RISK_TONE: Record<FatigueRisk, 'success' | 'warning' | 'error'> = {
  faible: 'success',
  modéré: 'warning',
  élevé: 'error',
};

const BAND_LABEL_KEY: Record<SleepBand, string> = {
  excellent: 'sommeil.screen.band.excellent',
  correct: 'sommeil.screen.band.correct',
  moyen: 'sommeil.screen.band.moyen',
  faible: 'sommeil.screen.band.faible',
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

/** Thin 0-100 meter used for each Sleep Score 2.0 component. */
function ScoreBar({
  value,
  color,
  track,
}: {
  value: number | null;
  color: string;
  track: string;
}): React.JSX.Element {
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: track, overflow: 'hidden' }}>
      {value !== null && (
        <View
          style={{ width: `${value}%`, height: '100%', backgroundColor: color, borderRadius: 4 }}
        />
      )}
    </View>
  );
}

const weekdayLetter = (iso: string): string =>
  new Date(iso).toLocaleDateString('fr-FR', { weekday: 'narrow' }).toUpperCase();

const fullWeekdayDate = (iso: string): string => {
  const label = new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return label.charAt(0).toUpperCase() + label.slice(1);
};

/** "22:30" → a ±15 min window "22:15 – 22:45". */
function bedtimeWindow(hhmm: string, timeFormat: TimeFormat): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (h === undefined || m === undefined) return hhmm;
  const base = h * 60 + m;
  const fmt = (min: number): string => {
    const mm = ((min % 1440) + 1440) % 1440;
    return formatClock(Math.floor(mm / 60), mm % 60, timeFormat);
  };
  return `${fmt(base - 15)} – ${fmt(base + 15)}`;
}
const fmtHM = (min: number): string => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
};

/** Compact quick-glance stat tile (Stress / Bien-être). */
function QuickStat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing[3], alignItems: 'center' }}>
      {typeof icon === 'string' ? <Text style={{ fontSize: 15 }}>{icon}</Text> : icon}
      <Text variant="subtitle" style={{ marginTop: spacing[1] }}>{value}</Text>
      <Text variant="caption" color="textSubtle" style={{ marginTop: 2 }}>{label}</Text>
    </View>
  );
}

/** Min/avg/max readout under the sleep debt evolution Sparkline. */
function DebtStat({ label, value }: { label: string; value: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center' }}>
      <Text variant="caption" color="textSubtle">{label}</Text>
      <Text variant="body" style={{ fontWeight: '700', color: colors.warning, marginTop: 2 }}>{value}</Text>
    </View>
  );
}

/** Recovery-tool link tile (grille outils). */
function ToolTile({ icon, label, path }: { icon: React.ReactNode; label: string; path: Href }): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => router.push(path)}
      style={({ pressed }) => ({ flex: 1, minWidth: '45%', opacity: pressed ? 0.6 : 1, backgroundColor: colors.surfaceElevated, borderRadius: radii.lg, padding: spacing[3] })}
    >
      {typeof icon === 'string' ? <Text style={{ fontSize: 16 }}>{icon}</Text> : icon}
      <Text variant="body" style={{ marginTop: spacing[1] }}>{label}</Text>
    </Pressable>
  );
}

/**
 * Sleep-phase breakdown for one night. A proportional stacked bar shows the
 * share of each stage (real device data), with a legend of minutes + %. The
 * minute-by-minute hypnogram is only shown when the source provides real
 * segments — a nightly-aggregated import doesn't, so we say so rather than
 * drawing a fabricated timeline (Master Prompt : pas de boîte noire).
 */
function PhasesCard({ session, timeFormat }: { session: SleepSession; timeFormat: TimeFormat }): React.JSX.Element {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const stages = [
    { key: 'deep', label: t('sommeil.screen.phases.stage.deep'), min: session.deepMin, color: colors.primary },
    { key: 'light', label: t('sommeil.screen.phases.stage.light'), min: session.lightMin, color: colors.info },
    { key: 'rem', label: t('sommeil.screen.phases.stage.rem'), min: session.remMin, color: colors.accentLime },
    { key: 'awake', label: t('sommeil.screen.phases.stage.awake'), min: session.awakeMin, color: colors.border },
  ].filter((s) => s.min > 0);
  const total = stages.reduce((s, x) => s + x.min, 0) || 1;
  const asleep = session.asleepMin || 1;

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
        <Text variant="heading">{t('sommeil.screen.phases.title')}</Text>
        {session.source === 'phone' && <Badge label={t('sommeil.screen.phases.estimatedPhoneBadge')} tone="warning" />}
      </View>
      <Text variant="caption" color="textSubtle">
        {t('sommeil.screen.phases.summary', {
          start: formatClockFromIso(session.startedAt, timeFormat),
          end: formatClockFromIso(session.endedAt, timeFormat),
          inBed: fmtHM(session.inBedMin),
          asleep: fmtHM(session.asleepMin),
        })}
      </Text>

      <View
        style={{
          flexDirection: 'row',
          height: 16,
          borderRadius: 8,
          overflow: 'hidden',
          marginTop: spacing[3],
        }}
      >
        {stages.map((s) => (
          <View key={s.key} style={{ flex: s.min / total, backgroundColor: s.color }} />
        ))}
      </View>

      <View style={{ gap: spacing[2], marginTop: spacing[3] }}>
        {stages.map((s) => (
          <View
            key={s.key}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s.color }} />
              <Text variant="body">{s.label}</Text>
            </View>
            <Text variant="caption" color="textMuted">
              {fmtHM(s.min)}
              {s.key !== 'awake' ? ` · ${Math.round((s.min / asleep) * 100)}%` : ''}
            </Text>
          </View>
        ))}
      </View>

      {!session.segments && (
        <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[3] }}>
          {t('sommeil.screen.phases.noTimeline')}
        </Text>
      )}
      {session.source === 'phone' && (
        <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[3] }}>
          {t('sommeil.screen.phases.phoneEstimate')}
        </Text>
      )}
    </Card>
  );
}

const LANE_LABEL_WIDTH = 64;
/** Top-to-bottom lane order for the hypnogram, matching the mockup the request was based on. */
const HYPNOGRAM_LANES: { stage: SleepStage; labelKey: string }[] = [
  { stage: 'awake', labelKey: 'sommeil.screen.phases.stage.awake' },
  { stage: 'rem', labelKey: 'sommeil.screen.phases.stage.rem' },
  { stage: 'light', labelKey: 'sommeil.screen.phases.stage.light' },
  { stage: 'deep', labelKey: 'sommeil.screen.phases.stage.deep' },
];

/**
 * Minute-by-minute hypnogram — one lane per stage, bars placed by real time
 * across the night. Only rendered when `session.segments` is present (same
 * "no fabricated timeline" rule as PhasesCard's noTimeline message).
 */
function HypnogramCard({ session, timeFormat }: { session: SleepSession; timeFormat: TimeFormat }): React.JSX.Element {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const segments = session.segments ?? [];
  // Awake gets a distinctly visible color here (unlike the subtle border tone
  // in PhasesCard's stacked bar) — spotting wake bursts is the whole point of
  // a hypnogram, matching the reference screenshots.
  const stageColor: Record<SleepStage, string> = {
    deep: colors.primary,
    light: colors.info,
    rem: colors.accentLime,
    awake: colors.warning,
  };
  const startMs = new Date(session.startedAt).getTime();
  const endMs = new Date(session.endedAt).getTime();
  const totalMs = Math.max(1, endMs - startMs);

  const hourMarks = useMemo(() => {
    const marks: { hour: number; pct: number }[] = [];
    const first = new Date(session.startedAt);
    first.setMinutes(0, 0, 0);
    if (first.getTime() < startMs) first.setHours(first.getHours() + 1);
    for (let ms = first.getTime(); ms < endMs; ms += 3_600_000) {
      marks.push({ hour: new Date(ms).getHours(), pct: ((ms - startMs) / totalMs) * 100 });
    }
    return marks;
  }, [session.startedAt, session.endedAt, startMs, endMs, totalMs]);

  return (
    <Card>
      <Text variant="heading">{t('sommeil.screen.hypnogram.title')}</Text>
      <Text variant="caption" color="textSubtle">
        {t('sommeil.screen.phases.summary', {
          start: formatClockFromIso(session.startedAt, timeFormat),
          end: formatClockFromIso(session.endedAt, timeFormat),
          inBed: fmtHM(session.inBedMin),
          asleep: fmtHM(session.asleepMin),
        })}
      </Text>

      <View style={{ marginTop: spacing[4], gap: spacing[1] }}>
        {HYPNOGRAM_LANES.map((lane) => (
          <View key={lane.stage} style={{ flexDirection: 'row', alignItems: 'center', height: 22 }}>
            <Text variant="caption" color="textSubtle" style={{ width: LANE_LABEL_WIDTH }}>{t(lane.labelKey)}</Text>
            <View style={{ flex: 1, height: 14, position: 'relative' }}>
              {segments.filter((s) => s.stage === lane.stage).map((s, i) => {
                const segStart = new Date(s.startedAt).getTime();
                const segEnd = new Date(s.endedAt).getTime();
                const left = Math.min(100, Math.max(0, ((segStart - startMs) / totalMs) * 100));
                const width = Math.max(0.6, ((segEnd - segStart) / totalMs) * 100);
                return (
                  <View
                    key={i}
                    style={{
                      position: 'absolute',
                      left: `${left}%`,
                      width: `${width}%`,
                      height: 14,
                      borderRadius: 4,
                      backgroundColor: stageColor[lane.stage],
                    }}
                  />
                );
              })}
            </View>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', marginTop: spacing[1] }}>
        <View style={{ width: LANE_LABEL_WIDTH }} />
        <View style={{ flex: 1, height: 14, position: 'relative' }}>
          {hourMarks.map((m) => (
            <Text key={m.hour} variant="caption" color="textSubtle" style={{ position: 'absolute', left: `${m.pct}%` }}>
              {String(m.hour).padStart(2, '0')}
            </Text>
          ))}
        </View>
      </View>
    </Card>
  );
}

/**
 * Swipeable carousel over the two sleep-phase views (proportional breakdown
 * + hypnogram timeline) — falls back to just PhasesCard when the source
 * doesn't provide real segments, so there's never a single-dot carousel.
 */
function SleepPhaseCarousel({ session, timeFormat }: { session: SleepSession; timeFormat: TimeFormat }): React.JSX.Element {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const pageWidth = width - spacing[4] * 2;
  const [index, setIndex] = useState(0);
  const hasTimeline = !!session.segments && session.segments.length > 0;

  if (!hasTimeline) {
    return <PhasesCard session={session} timeFormat={timeFormat} />;
  }

  return (
    <View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / pageWidth))}
      >
        <View style={{ width: pageWidth }}>
          <PhasesCard session={session} timeFormat={timeFormat} />
        </View>
        <View style={{ width: pageWidth }}>
          <HypnogramCard session={session} timeFormat={timeFormat} />
        </View>
      </ScrollView>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: spacing[2] }}>
        {[0, 1].map((i) => (
          <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: i === index ? colors.primary : colors.border }} />
        ))}
      </View>
    </View>
  );
}

/**
 * Sommeil hub (was Sleep Suite, promu mini-accueil — absorbe sommeil,
 * récupération mentale, HRV et respiration de l'ancien "Santé"). Score de
 * sommeil, stress/bien-être, phases, coucher optimal, conseil, puis le détail
 * plus analytique (composantes du score, prévision) et les outils.
 */
export function SommeilScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { preferences } = usePreferences();
  const cardOrder = useMemo(() => resolveSommeilCardOrder(preferences.sommeilCards), [preferences.sommeilCards]);
  const { data: metrics = [], isLoading } = useHealthMetrics();
  const { data: activities = [] } = useActivities();
  const { data: sessions = [] } = useSleepSessions();
  const { data: checkins = [] } = useWellnessCheckins();
  const [selectedDate, setSelectedDate] = useSelectedDay();
  const asOf = selectedDate;

  const qc = useQueryClient();
  const syncHealth = useManualHealthKitSync();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async (): Promise<void> => { setRefreshing(true); await syncHealth(); await qc.invalidateQueries(); setRefreshing(false); };
  const [tappedNight, setTappedNight] = useState<SleepNight | null>(null);

  const lastSession = sessions[0];
  const score = useMemo(
    () => computeSleepScore2(metrics, asOf, 7, sessions),
    [metrics, asOf, sessions],
  );
  const { data: leaderboardPrefs } = useLeaderboardPrefs();
  const recordDailyScore = useRecordDailyScore();
  useEffect(() => {
    if (!leaderboardPrefs?.leaderboardOptIn) return;
    if (!isTodayLocal(asOf)) return;
    // "to_confirm" means there's no real data yet — don't publish a placeholder 0.
    if (score.confidence === 'to_confirm') return;
    if (!Number.isFinite(score.value)) return;
    recordDailyScore.mutate({ column: 'sleep', value: Math.round(score.value) });
  }, [leaderboardPrefs?.leaderboardOptIn, asOf, score.confidence, score.value]);
  const trend = useMemo(() => sleepTrend(metrics, asOf, 7), [metrics, asOf]);
  const chrono = useMemo(() => [...trend].sort((a, b) => a.date.localeCompare(b.date)), [trend]);
  const chronoMax = Math.max(1, ...chrono.map((n) => n.hours));
  const avg = useMemo(() => averageSleepHours(metrics, asOf, 7), [metrics, asOf]);
  // Sleep debt evolution — one point per trailing day, each computed with its
  // own rolling debt window (same sleepDebtHours the "Dette" score component
  // above already uses), so the curve shows whether the debt itself is
  // growing or being paid down over the last month, not just today's value.
  const debtSeries = useMemo(() => {
    const points: number[] = [];
    for (let i = DEBT_TREND_DAYS - 1; i >= 0; i -= 1) {
      const dayIso = new Date(new Date(asOf).getTime() - i * DAY_MS).toISOString();
      points.push(sleepDebtHours(metrics, dayIso, 30).debt);
    }
    return points;
  }, [metrics, asOf]);
  const debtStats = useMemo(() => {
    if (debtSeries.length < 2) return null;
    return {
      avg: Math.round((debtSeries.reduce((s, v) => s + v, 0) / debtSeries.length) * 10) / 10,
      max: Math.max(...debtSeries),
      min: Math.min(...debtSeries),
    };
  }, [debtSeries]);
  const coaching = useMemo(() => sleepCoaching(metrics, asOf), [metrics, asOf]);
  const acwr = useMemo(() => computeAcwr(activities, asOf).ratio, [activities, asOf]);
  const prediction = useMemo(
    () => predictNextDayEnergy(metrics, asOf, { acwr }),
    [metrics, asOf, acwr],
  );
  const circadian = useMemo(
    () =>
      computeCircadianProfile(metrics, asOf, {
        tzOffsetMinutes: -new Date().getTimezoneOffset(),
      }),
    [metrics, asOf],
  );
  const wellness = useMemo(() => computeWellnessIndex(checkins, asOf), [checkins, asOf]);
  // Show the screen as soon as we have any sleep night (any source), even if the
  // full quality score can't be computed yet.
  const hasData = trend.length > 0 || lastSession != null;

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
    hrv && { label: t('sommeil.screen.signals.hrv'), value: `${Math.round(hrv.value)} ms` },
    rhr && { label: t('sommeil.screen.signals.restingHr'), value: `${Math.round(rhr.value)} bpm` },
    stress && { label: t('sommeil.screen.signals.stress'), value: `${Math.round(stress.value)}/100` },
  ].filter(Boolean) as { label: string; value: string }[];

  const cardNodes: Record<string, React.ReactNode> = {
    last7Nights: chrono.length > 0 ? (
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text variant="heading">{t('sommeil.screen.last7Nights.title')}</Text>
          {avg !== undefined && (
            <Text variant="caption" color="textMuted">
              {t('sommeil.screen.last7Nights.average', { avg: avg.toFixed(1) })}
            </Text>
          )}
        </View>
        <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[1] }}>
          {tappedNight
            ? t('sommeil.screen.last7Nights.tappedDetail', { day: fullWeekdayDate(tappedNight.date), hours: fmtHM(tappedNight.hours * 60) })
            : t('sommeil.screen.last7Nights.tapHint')}
        </Text>
        <View
          style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing[2], height: 92, marginTop: spacing[3] }}
        >
          {chrono.map((n) => {
            const selected = tappedNight?.date === n.date;
            return (
              <Pressable
                key={n.date}
                onPress={() => setTappedNight(selected ? null : n)}
                hitSlop={4}
                style={{ flex: 1, alignItems: 'center', gap: spacing[1] }}
              >
                <View
                  style={{
                    width: '70%',
                    height: Math.max(6, (n.hours / chronoMax) * 72),
                    borderRadius: 4,
                    backgroundColor: colors[BAND_TONE[sleepBand(n.score)]],
                    borderWidth: selected ? 2 : 0,
                    borderColor: colors.text,
                  }}
                />
                <Text variant="caption" color={selected ? 'text' : 'textSubtle'} style={selected ? { fontWeight: '700' } : undefined}>
                  {weekdayLetter(n.date)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>
    ) : null,
    phases: lastSession ? <SleepPhaseCarousel session={lastSession} timeFormat={preferences.timeFormat} /> : null,
    bedtime: circadian.value ? (
      <Card>
        <Text variant="caption" color="textMuted">
          {t('sommeil.screen.bedtime.title')}
        </Text>
        <Text variant="display" color="primary" style={{ marginTop: spacing[1] }}>
          {bedtimeWindow(circadian.value.idealBedtime, preferences.timeFormat)}
        </Text>
        <Text variant="caption" color="textSubtle">
          {t('sommeil.screen.bedtime.estimate', { chronotype: circadian.value.chronotype })}
        </Text>
      </Card>
    ) : null,
    advice: coaching ? (
      <Card>
        <Text variant="heading">{t('sommeil.screen.advice.title')}</Text>
        <Text variant="caption" color="textMuted">
          {t(coaching.observation.key, coaching.observation.params)}
        </Text>
        <Text variant="caption" color="textMuted">
          {t(coaching.analysis.key, coaching.analysis.params)}
        </Text>
        <Text variant="body" style={{ marginTop: spacing[1] }}>
          {t(coaching.action.key, coaching.action.params)}
        </Text>
      </Card>
    ) : null,
    detail: (
      <Card>
        <Text variant="heading">{t('sommeil.screen.detail.title')}</Text>
        <Text variant="caption" color="textSubtle">
          {t('sommeil.screen.detail.description')}
        </Text>
        <View style={{ gap: spacing[3], marginTop: spacing[3] }}>
          {score.components.map((c) => {
            const tone = c.value !== null ? BAND_TONE[sleepBand(c.value)] : undefined;
            const barColor = tone ? colors[tone] : colors.border;
            return (
              <View key={c.key} style={{ gap: spacing[1] }}>
                <View
                  style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}
                >
                  <Text variant="body">{c.label}</Text>
                  <Text variant="subtitle" color={c.value !== null ? 'text' : 'textSubtle'}>
                    {c.value !== null ? `${c.value}` : '—'}
                  </Text>
                </View>
                <ScoreBar value={c.value} color={barColor} track={colors.surfaceElevated} />
                <Text variant="caption" color="textSubtle">
                  {c.detail}
                </Text>
              </View>
            );
          })}
        </View>
      </Card>
    ),
    debtTrend: score.components.find((c) => c.key === 'debt')?.value !== null && debtStats ? (
      <Card>
        <Text variant="heading">{t('sommeil.screen.debtTrend.title')}</Text>
        <Text variant="caption" color="textSubtle">{t('sommeil.screen.debtTrend.subtitle')}</Text>
        <View style={{ alignItems: 'center', marginTop: spacing[3] }}>
          <Sparkline values={debtSeries} width={300} height={70} color={colors.warning} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: spacing[3], paddingTop: spacing[3], borderTopWidth: 1, borderTopColor: colors.border }}>
          <DebtStat label={t('sommeil.screen.debtTrend.avg')} value={t('sommeil.screen.debtTrend.hoursValue', { value: debtStats.avg })} />
          <DebtStat label={t('sommeil.screen.debtTrend.max')} value={t('sommeil.screen.debtTrend.hoursValue', { value: debtStats.max })} />
          <DebtStat label={t('sommeil.screen.debtTrend.min')} value={t('sommeil.screen.debtTrend.hoursValue', { value: debtStats.min })} />
        </View>
      </Card>
    ) : null,
    prediction: prediction.value && prediction.explanation ? (
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <Text variant="heading">{t('sommeil.screen.prediction.title')}</Text>
          <Badge
            label={t('sommeil.screen.prediction.fatigueBadge', { risk: prediction.value.fatigueRisk })}
            tone={RISK_TONE[prediction.value.fatigueRisk]}
          />
        </View>
        <Text variant="subtitle" color="primary" style={{ marginTop: spacing[1] }}>
          {t('sommeil.screen.prediction.energy', { score: prediction.value.energyScore })}
        </Text>
        <Text variant="caption" color="textMuted" style={{ marginTop: spacing[1] }}>
          {t(prediction.explanation.analysis.key, prediction.explanation.analysis.params)}
        </Text>
        <Text variant="body" style={{ marginTop: spacing[1] }}>
          {t(prediction.explanation.action.key, prediction.explanation.action.params)}
        </Text>
      </Card>
    ) : null,
    signals: signals.length > 0 ? (
      <Card>
        <Text variant="heading">{t('sommeil.screen.signals.title')}</Text>
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[4], marginTop: spacing[2] }}
        >
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
    ) : null,
    circadian: (
      <Card>
        <Text variant="heading">{t('sommeil.screen.circadian.title')}</Text>
        <Text variant="caption" color="textMuted">
          {t('sommeil.screen.circadian.description')}
        </Text>
        <View style={{ alignItems: 'flex-start', marginTop: spacing[2] }}>
          <Button
            label={t('sommeil.screen.circadian.cta')}
            variant="gradient"
            onPress={() => router.push('/sommeil/circadian')}
          />
        </View>
      </Card>
    ),
    tools: (
      <>
        <Text variant="heading" style={{ marginTop: spacing[2] }}>
          {t('sommeil.screen.tools.title')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] }}>
          <ToolTile icon={<Icon name="windy" size={16} color={colors.text} />} label={t('sommeil.screen.tools.breathing')} path="/sommeil/breathing" />
          <ToolTile icon={<Icon name="lungs" size={16} color={colors.text} />} label={t('sommeil.screen.tools.stomachVacuum')} path="/sport/stomach-vacuum" />
          <ToolTile icon={<Icon name="puzzle" size={16} color={colors.text} />} label={t('sommeil.screen.tools.neuroRecovery')} path="/sommeil/neuro-recovery" />
          <ToolTile icon={<Icon name="headphones" size={16} color={colors.text} />} label={t('sommeil.screen.tools.sounds')} path="/sommeil/sound" />
        </View>
      </>
    ),
    comprendre: <ComprendreCard pillars={['sleep', 'recovery', 'understanding']} />,
    objectifs: <ObjectifsCard types={['health']} />,
  };

  return (
    <Screen scroll onRefresh={onRefresh} refreshing={refreshing}>
      <View style={{ position: 'relative' }}>
        <View style={{ alignItems: 'center' }}>
          <Text variant="title">{t('common.tab.sommeil')}</Text>
          <Text variant="caption" color="textMuted">
            {t('sommeil.screen.subtitle')}
          </Text>
        </View>
        <View style={{ position: 'absolute', right: 0, top: 0, flexDirection: 'row', gap: spacing[2] }}>
          <Pressable onPress={() => router.push('/sommeil-customize')} accessibilityLabel={t('sommeil.customize.title')} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="tune" size={16} color={colors.text} />
            </View>
          </Pressable>
          <Pressable onPress={() => router.push('/search')} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="search" size={16} color={colors.text} />
            </View>
          </Pressable>
        </View>
      </View>
      <DayNav value={selectedDate} onChange={setSelectedDate} />

      {isLoading ? (
        <Text variant="body" color="textMuted">
          {t('common.loading')}
        </Text>
      ) : !hasData ? (
        <EmptyState
          icon={<Icon name="bedtime" size={44} color={colors.textSubtle} />}
          title={t('sommeil.screen.empty.title')}
          message={t('sommeil.screen.empty.message')}
          actionLabel={t('sommeil.screen.empty.action')}
          onAction={() => router.push('/profile/import')}
        />
      ) : (
        <>
          {/* 1. Score de sommeil */}
          <Card>
            <View style={{ alignItems: 'center', gap: spacing[1] }}>
              <ProgressRing value={score.value} segments={zones} caption="/100" size={116} />
              <Badge label={t(BAND_LABEL_KEY[band])} tone={BAND_TONE[band]} />
              {avg !== undefined && (
                <Text variant="caption" color="textMuted">
                  {t('sommeil.screen.score.average', { avg: avg.toFixed(1) })}
                </Text>
              )}
            </View>
            {lastSession && (
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-around',
                  marginTop: spacing[4],
                  paddingTop: spacing[4],
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                }}
              >
                <View style={{ alignItems: 'center' }}>
                  <Text variant="subtitle">{fmtHM(lastSession.asleepMin)}</Text>
                  <Text variant="caption" color="textSubtle">
                    {t('sommeil.screen.score.totalDuration')}
                  </Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text variant="subtitle" color="primary">
                    {fmtHM(lastSession.deepMin)}
                  </Text>
                  <Text variant="caption" color="textSubtle">
                    {t('sommeil.screen.score.deepSleep')}
                  </Text>
                </View>
              </View>
            )}
          </Card>

          {/* 2. Stress + Bien-être mental */}
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <QuickStat icon={<Icon name="windy" size={15} color={colors.info} />} value={stress ? `${Math.round(stress.value)}/100` : '—'} label={t('sommeil.screen.signals.stress')} />
            <QuickStat
              icon={<Icon name="emoticonHappy" size={15} color={colors.accentData} />}
              value={wellness.confidence !== 'to_confirm' ? `${wellness.value}/100` : '—'}
              label={
                wellness.confidence !== 'to_confirm'
                  ? t('sommeil.screen.wellness.labelWithBand', { band: wellnessBand(wellness.value) })
                  : t('sommeil.screen.wellness.label')
              }
            />
          </View>

          {cardOrder.filter((c) => c.visible).map((c) => (
            <React.Fragment key={c.id}>{cardNodes[c.id]}</React.Fragment>
          ))}
        </>
      )}
    </Screen>
  );
}
