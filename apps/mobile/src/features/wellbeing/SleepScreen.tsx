import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Card, EmptyState, ProgressRing, Screen, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import type { HealthMetric, SleepSession } from '@supotsu/core';
import {
  averageSleepHours,
  computeAcwr,
  computeSleepScore2,
  predictNextDayEnergy,
  sleepBand,
  sleepCoaching,
  sleepTrend,
  type FatigueRisk,
  type SleepBand,
} from '@supotsu/engines';
import { useActivities, useHealthMetrics, useSleepSessions } from '@/lib/data/queries';
import { formatDate } from '@/lib/format';

const RISK_TONE: Record<FatigueRisk, 'success' | 'warning' | 'error'> = {
  faible: 'success',
  modéré: 'warning',
  élevé: 'error',
};

const BAND_LABEL: Record<SleepBand, string> = {
  excellent: 'Excellent',
  correct: 'Correct',
  moyen: 'Moyen',
  faible: 'Faible',
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

const fmtClock = (iso: string): string =>
  new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const fmtHM = (min: number): string => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
};

/**
 * Sleep-phase breakdown for one night. A proportional stacked bar shows the
 * share of each stage (real device data), with a legend of minutes + %. The
 * minute-by-minute hypnogram is only shown when the source provides real
 * segments — a nightly-aggregated import doesn't, so we say so rather than
 * drawing a fabricated timeline (Master Prompt : pas de boîte noire).
 */
function PhasesCard({ session }: { session: SleepSession }): React.JSX.Element {
  const { colors } = useTheme();
  const stages = [
    { key: 'deep', label: 'Profond', min: session.deepMin, color: colors.primary },
    { key: 'light', label: 'Léger', min: session.lightMin, color: colors.info },
    { key: 'rem', label: 'Paradoxal', min: session.remMin, color: colors.accentLime },
    { key: 'awake', label: 'Éveillé', min: session.awakeMin, color: colors.border },
  ].filter((s) => s.min > 0);
  const total = stages.reduce((s, x) => s + x.min, 0) || 1;
  const asleep = session.asleepMin || 1;

  return (
    <Card>
      <Text variant="heading">Phases de sommeil</Text>
      <Text variant="caption" color="textSubtle">
        {fmtClock(session.startedAt)} → {fmtClock(session.endedAt)} · {fmtHM(session.inBedMin)} au
        lit, {fmtHM(session.asleepMin)} dormies
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
          Chronologie minute par minute non fournie par cet export — seules les durées par phase
          sont disponibles.
        </Text>
      )}
    </Card>
  );
}

/**
 * Sleep pillar (Sleep Suite). Explainable Sleep Score 2.0 decomposed into its
 * components, natural-language coaching, recovery signals and a weekly trend.
 * Every component shows its own rationale; missing ones say what's needed
 * rather than being silently zeroed (explicabilité obligatoire).
 */
export function SleepScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { data: metrics = [], isLoading } = useHealthMetrics();
  const { data: activities = [] } = useActivities();
  const { data: sessions = [] } = useSleepSessions();
  const asOf = new Date().toISOString();

  const lastSession = sessions[0];
  const score = useMemo(
    () => computeSleepScore2(metrics, asOf, 7, sessions),
    [metrics, asOf, sessions],
  );
  const trend = useMemo(() => sleepTrend(metrics, asOf, 7), [metrics, asOf]);
  const avg = useMemo(() => averageSleepHours(metrics, asOf, 7), [metrics, asOf]);
  const coaching = useMemo(() => sleepCoaching(metrics, asOf), [metrics, asOf]);
  const acwr = useMemo(() => computeAcwr(activities, asOf).ratio, [activities, asOf]);
  const prediction = useMemo(
    () => predictNextDayEnergy(metrics, asOf, { acwr }),
    [metrics, asOf, acwr],
  );
  const hasData = score.confidence !== 'to_confirm';

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
    hrv && { label: 'VFC (HRV)', value: `${Math.round(hrv.value)} ms` },
    rhr && { label: 'FC repos', value: `${Math.round(rhr.value)} bpm` },
    stress && { label: 'Stress', value: `${Math.round(stress.value)}/100` },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <Screen scroll>
      <Text variant="title">Sommeil</Text>
      <Text variant="caption" color="textMuted">
        Ton Sleep Score 2.0, décomposé et expliqué — à partir de tes nuits importées de Garmin ou
        Apple Santé.
      </Text>

      {isLoading ? (
        <Text variant="body" color="textMuted">
          Chargement…
        </Text>
      ) : !hasData ? (
        <EmptyState
          icon="😴"
          title="Pas encore de données de sommeil"
          message="Importe ton export Garmin ou connecte Apple Santé pour suivre tes nuits."
          actionLabel="Importer / connecter"
          onAction={() => router.push('/import')}
        />
      ) : (
        <>
          <Card>
            <View style={{ alignItems: 'center', gap: spacing[1] }}>
              <ProgressRing value={score.value} segments={zones} caption="/100" size={116} />
              <Badge label={BAND_LABEL[band]} tone={BAND_TONE[band]} />
              {avg !== undefined && (
                <Text variant="caption" color="textMuted">
                  Moyenne 7 jours : {avg.toFixed(1)} h / nuit
                </Text>
              )}
            </View>
          </Card>

          <Card>
            <Text variant="heading">Détail du score</Text>
            <Text variant="caption" color="textSubtle">
              Chaque composante est notée sur 100. Les composantes sans donnée n’entrent pas dans le
              calcul.
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

          {lastSession && <PhasesCard session={lastSession} />}

          {coaching && (
            <Card>
              <Text variant="heading">Coaching</Text>
              <Text variant="caption" color="textMuted">
                {coaching.observation}
              </Text>
              <Text variant="caption" color="textMuted">
                {coaching.analysis}
              </Text>
              <Text variant="body" style={{ marginTop: spacing[1] }}>
                {coaching.action}
              </Text>
            </Card>
          )}

          {prediction.value && prediction.explanation && (
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                <Text variant="heading">Prévision de demain</Text>
                <Badge
                  label={`Fatigue ${prediction.value.fatigueRisk}`}
                  tone={RISK_TONE[prediction.value.fatigueRisk]}
                />
              </View>
              <Text variant="subtitle" color="primary" style={{ marginTop: spacing[1] }}>
                Énergie estimée {prediction.value.energyScore}/100
              </Text>
              <Text variant="caption" color="textMuted" style={{ marginTop: spacing[1] }}>
                {prediction.explanation.analysis}
              </Text>
              <Text variant="body" style={{ marginTop: spacing[1] }}>
                {prediction.explanation.action}
              </Text>
            </Card>
          )}

          <Card>
            <Text variant="heading">Rythme circadien</Text>
            <Text variant="caption" color="textMuted">
              Découvre ton chronotype et tes horaires optimaux (coucher, caféine, sport, lumière).
            </Text>
            <View style={{ alignItems: 'flex-start', marginTop: spacing[2] }}>
              <Button label="Voir mes horaires optimaux" onPress={() => router.push('/circadian')} />
            </View>
          </Card>

          {signals.length > 0 && (
            <Card>
              <Text variant="heading">Signaux de récupération</Text>
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

          {trend.length > 0 && (
            <Card>
              <Text variant="heading">7 derniers jours</Text>
              <View style={{ gap: spacing[2], marginTop: spacing[1] }}>
                {trend.map((n) => (
                  <View
                    key={n.date}
                    style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <Text variant="body">{formatDate(n.date)}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                      <Text variant="caption" color="textMuted">
                        {n.hours.toFixed(1)} h
                      </Text>
                      <Badge label={`${n.score}`} tone={BAND_TONE[sleepBand(n.score)]} />
                    </View>
                  </View>
                ))}
              </View>
            </Card>
          )}
        </>
      )}

      <View style={{ alignItems: 'flex-start' }}>
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
