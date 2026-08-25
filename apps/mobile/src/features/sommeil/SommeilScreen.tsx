import React, { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, EmptyState, Icon, ProgressRing, Screen, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { HealthMetric, SleepSession } from '@supotsu/core';
import {
  averageSleepHours,
  computeAcwr,
  computeCircadianProfile,
  computeSleepScore2,
  computeWellnessIndex,
  predictNextDayEnergy,
  sleepBand,
  sleepCoaching,
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

  return (
    <Screen scroll onRefresh={onRefresh} refreshing={refreshing}>
      <View style={{ position: 'relative' }}>
        <View style={{ alignItems: 'center' }}>
          <Text variant="title">{t('common.tab.sommeil')}</Text>
          <Text variant="caption" color="textMuted">
            {t('sommeil.screen.subtitle')}
          </Text>
        </View>
        <Pressable onPress={() => router.push('/search')} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, position: 'absolute', right: 0, top: 0 })}>
          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="search" size={16} color={colors.text} />
          </View>
        </Pressable>
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

          {/* 3. 7 dernières nuits */}
          {chrono.length > 0 && (
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
          )}

          {/* 4. Phases de sommeil */}
          {lastSession && <PhasesCard session={lastSession} timeFormat={preferences.timeFormat} />}

          {/* 5. Coucher optimal */}
          {circadian.value && (
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
          )}

          {/* 6. Conseil du jour */}
          {coaching && (
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
          )}

          {/* 7. Détail — plus analytique, repoussé en fin */}
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

          {prediction.value && prediction.explanation && (
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
          )}

          {signals.length > 0 && (
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
          )}

          {/* 8. Rythme circadien */}
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

          {/* 9. Outils de récupération */}
          <Text variant="heading" style={{ marginTop: spacing[2] }}>
            {t('sommeil.screen.tools.title')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] }}>
            <ToolTile icon={<Icon name="windy" size={16} color={colors.text} />} label={t('sommeil.screen.tools.breathing')} path="/sommeil/breathing" />
            <ToolTile icon={<Icon name="lungs" size={16} color={colors.text} />} label={t('sommeil.screen.tools.stomachVacuum')} path="/sport/stomach-vacuum" />
            <ToolTile icon={<Icon name="puzzle" size={16} color={colors.text} />} label={t('sommeil.screen.tools.neuroRecovery')} path="/sommeil/neuro-recovery" />
            <ToolTile icon={<Icon name="headphones" size={16} color={colors.text} />} label={t('sommeil.screen.tools.sounds')} path="/sommeil/sound" />
            <ToolTile icon={<Icon name="moon" size={16} color={colors.text} />} label={t('sommeil.screen.tools.phoneTracking')} path="/sommeil/track" />
            <ToolTile icon={<Icon name="alarm" size={16} color={colors.text} />} label={t('sommeil.screen.tools.smartAlarm')} path="/sommeil/alarm" />
          </View>

          {/* 10. Comprendre + Objectifs */}
          <ComprendreCard pillars={['sleep', 'recovery', 'understanding']} />
          <ObjectifsCard types={['health']} />
        </>
      )}
    </Screen>
  );
}
