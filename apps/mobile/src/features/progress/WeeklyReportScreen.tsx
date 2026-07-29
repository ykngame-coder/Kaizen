import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, ProgressRing, Screen, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { averageSleepHours, computeRecoveryScore, sleepTrend, sumDay } from '@supotsu/engines';
import { useActivities, useHealthMetrics, useNutritionEntries } from '@/lib/data/queries';

const DAY_MS = 86_400_000;

const FR_MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const shortDate = (d: Date): string => `${d.getDate()} ${FR_MONTHS[d.getMonth()]}`;

function fmtDur(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

/** One labelled line inside a report section. */
function Line({ label, value, color }: { label: string; value: string; color?: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing[2], borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Text variant="body" color="textMuted">
        {label}
      </Text>
      <Text variant="body" style={{ fontWeight: '700', color }}>
        {value}
      </Text>
    </View>
  );
}

/** Rapport hebdomadaire (mockup #20) — real 7-day aggregates + narrative. */
export function WeeklyReportScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { data: activities = [] } = useActivities();
  const { data: health = [] } = useHealthMetrics();
  const { data: nutrition = [] } = useNutritionEntries();
  const now = new Date();
  const asOf = now.toISOString();
  const since = now.getTime() - 7 * DAY_MS;

  const report = useMemo(() => {
    const acts = activities.filter((a) => new Date(a.startedAt).getTime() >= since);
    const totalSec = acts.reduce((s, a) => s + a.durationSec, 0);
    const cals = acts.reduce((s, a) => s + (a.calories ?? 0), 0);

    const nights = [...sleepTrend(health, asOf, 7)].sort((a, b) => a.hours - b.hours);
    const bestNight = nights.at(-1);
    const avgSleep = averageSleepHours(health, asOf, 7);

    const rec = computeRecoveryScore(health, asOf);

    // Average daily calories over days with any intake.
    let kcalSum = 0;
    let kcalDays = 0;
    for (let i = 0; i < 7; i += 1) {
      const day = new Date(now.getTime() - i * DAY_MS).toISOString();
      const t = sumDay(nutrition, day);
      if (t.kcal > 0) {
        kcalSum += t.kcal;
        kcalDays += 1;
      }
    }

    const weights = health.filter((m) => m.type === 'weight').sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
    const wLast = weights.at(-1)?.value;
    const wRef = weights.find((m) => new Date(m.measuredAt).getTime() >= since)?.value ?? weights[0]?.value;
    const wDelta = wLast != null && wRef != null ? wLast - wRef : null;

    return {
      sessions: acts.length,
      totalSec,
      cals,
      avgSleep,
      bestNight: bestNight?.hours,
      recovery: rec.confidence === 'to_confirm' ? null : rec.value,
      avgKcal: kcalDays > 0 ? Math.round(kcalSum / kcalDays) : null,
      wDelta,
    };
  }, [activities, health, nutrition, asOf, since, now]);

  const narrative = useMemo(() => {
    const bits: string[] = [];
    if (report.sessions > 0) bits.push(`${report.sessions} séance${report.sessions > 1 ? 's' : ''} (${fmtDur(report.totalSec)})`);
    if (report.avgSleep && report.avgSleep > 0) bits.push(`${report.avgSleep.toFixed(1)} h de sommeil en moyenne`);
    if (report.wDelta != null) bits.push(`${report.wDelta > 0 ? '+' : ''}${report.wDelta.toFixed(1)} kg`);
    if (bits.length === 0) return 'Pas encore assez de données cette semaine — enregistre tes séances, nuits et repas.';
    return `Cette semaine : ${bits.join(', ')}. ${report.recovery != null && report.recovery >= 70 ? 'Ta récupération est solide, tu peux maintenir le cap.' : 'Soigne ta récupération pour la semaine à venir.'}`;
  }, [report]);

  return (
    <Screen scroll>
      <Text variant="title">Rapport hebdomadaire</Text>
      <Text variant="caption" color="textMuted">
        {shortDate(new Date(since))} — {shortDate(now)}
      </Text>

      {/* Score global */}
      <Card style={{ marginTop: spacing[2], alignItems: 'center' }}>
        <ProgressRing value={report.recovery ?? 0} size={128} thickness={11} gradient centerLabel={report.recovery != null ? `${report.recovery}` : '—'} caption="Forme moyenne" />
        <Text variant="body" color="textMuted" style={{ marginTop: spacing[3], textAlign: 'center', lineHeight: 21 }}>
          {narrative}
        </Text>
      </Card>

      {/* Entraînement */}
      <Card>
        <Text variant="heading">Entraînement</Text>
        <Line label="Séances" value={`${report.sessions}`} />
        <Line label="Temps total" value={report.totalSec > 0 ? fmtDur(report.totalSec) : '—'} />
        <Line label="Calories brûlées" value={report.cals > 0 ? `${Math.round(report.cals)} kcal` : '—'} />
      </Card>

      {/* Sommeil & récupération */}
      <Card>
        <Text variant="heading">Sommeil & récupération</Text>
        <Line label="Sommeil moyen" value={report.avgSleep && report.avgSleep > 0 ? `${report.avgSleep.toFixed(1)} h` : '—'} />
        <Line label="Meilleure nuit" value={report.bestNight != null ? `${report.bestNight.toFixed(1)} h` : '—'} />
        <Line label="Récupération moyenne" value={report.recovery != null ? `${report.recovery}/100` : '—'} color={report.recovery != null && report.recovery >= 70 ? colors.accentData : undefined} />
      </Card>

      {/* Nutrition & poids */}
      <Card>
        <Text variant="heading">Nutrition & poids</Text>
        <Line label="Apport moyen" value={report.avgKcal != null ? `${report.avgKcal} kcal/j` : '—'} />
        <Line label="Variation de poids" value={report.wDelta != null ? `${report.wDelta > 0 ? '+' : ''}${report.wDelta.toFixed(1)} kg` : '—'} color={report.wDelta != null && report.wDelta <= 0 ? colors.accentData : undefined} />
      </Card>

      <View style={{ alignItems: 'flex-start' }}>
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
