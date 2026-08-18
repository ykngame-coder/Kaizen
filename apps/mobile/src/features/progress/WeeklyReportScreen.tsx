import React, { useMemo, useState } from 'react';
import { Share, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, Icon, ProgressRing, Screen, Sparkline, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { averageSleepHours, computeRecoveryScore, recoveryBand, sleepTrend, sumDay } from '@supotsu/engines';
import { useActivities, useHabitLogs, useHabits, useHealthMetrics, useNutritionEntries, useRecords } from '@/lib/data/queries';
import { useAuth } from '@/features/auth/AuthProvider';
import { createDataRepository, exportUserData } from '@/lib/data/repository';
import { formatDate } from '@/lib/format';

const DAY_MS = 86_400_000;
const FR_MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const D_SHORT = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const shortDate = (d: Date): string => `${d.getDate()} ${FR_MONTHS[d.getMonth()]}`;
const dayKey = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const mean = (xs: number[]): number => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
function fmtDur(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }): React.JSX.Element {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: spacing[3] }}>
      <Text variant="heading">{children}</Text>
      {right}
    </View>
  );
}
function Kpi({ label, value, delta, tone }: { label: string; value: string; delta?: string; tone?: 'up' | 'down' }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ flexGrow: 1, flexBasis: '45%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing[3] }}>
      <Text variant="caption" color="textSubtle">{label}</Text>
      <Text variant="subtitle" style={{ marginTop: spacing[1], letterSpacing: -0.4 }}>{value}</Text>
      {delta ? <Text variant="caption" style={{ marginTop: 2, fontWeight: '600', color: tone === 'down' ? colors.error : colors.accentData }}>{delta}</Text> : null}
    </View>
  );
}
function KV({ label, value, color, last }: { label: string; value: string; color?: string; last?: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing[2], borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border }}>
      <Text variant="body" color="textMuted">{label}</Text>
      <Text variant="body" style={{ fontWeight: '700', color: color ?? colors.text }}>{value}</Text>
    </View>
  );
}

/** Rapport hebdomadaire (mockup #20) — real 7-day aggregates, daily breakdowns, plan. */
export function WeeklyReportScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { data: activities = [] } = useActivities();
  const { data: health = [] } = useHealthMetrics();
  const { data: nutrition = [] } = useNutritionEntries();
  const { data: habits = [] } = useHabits();
  const { data: habitLogs = [] } = useHabitLogs();
  const { data: records = [] } = useRecords();
  const now = useMemo(() => new Date(), []);
  const asOf = useMemo(() => now.toISOString(), [now]);
  const since = now.getTime() - 7 * DAY_MS;
  const prevSince = now.getTime() - 14 * DAY_MS;
  const [exporting, setExporting] = useState(false);

  const r = useMemo(() => {
    const acts = activities.filter((a) => new Date(a.startedAt).getTime() >= since);
    const prevActs = activities.filter((a) => { const t = new Date(a.startedAt).getTime(); return t >= prevSince && t < since; });
    const totalSec = acts.reduce((s, a) => s + a.durationSec, 0);
    const cals = acts.reduce((s, a) => s + (a.calories ?? 0), 0);

    // Per-day recovery, sleep, kcal (Mon..Sun of the last 7 days).
    const recByDay: (number | null)[] = [];
    const sleepByDay: (number | null)[] = [];
    const kcalByDay: number[] = [];
    const labels: string[] = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(now.getTime() - i * DAY_MS);
      labels.push(D_SHORT[d.getDay()]!);
      const rec = computeRecoveryScore(health, d.toISOString());
      recByDay.push(rec.confidence !== 'to_confirm' ? rec.value : null);
      const nights = sleepTrend(health, d.toISOString(), 1);
      sleepByDay.push(nights.at(-1)?.hours ?? null);
      kcalByDay.push(sumDay(nutrition, d.toISOString()).kcal);
    }
    const recVals = recByDay.filter((x): x is number => x !== null);
    const avgRec = recVals.length ? Math.round(mean(recVals)) : null;
    const avgRecPrev = (() => {
      const vals: number[] = [];
      for (let i = 13; i >= 7; i -= 1) { const rr = computeRecoveryScore(health, new Date(now.getTime() - i * DAY_MS).toISOString()); if (rr.confidence !== 'to_confirm') vals.push(rr.value); }
      return vals.length ? Math.round(mean(vals)) : null;
    })();

    const avgSleep = averageSleepHours(health, asOf, 7);
    const avgSleepPrev = averageSleepHours(health, new Date(since).toISOString(), 7);
    const hrvVals = health.filter((m) => m.type === 'hrv' && new Date(m.measuredAt).getTime() >= since).map((m) => m.value);
    const hydration = kcalByDay.length ? [0, 1, 2, 3, 4, 5, 6].reduce((s, i) => s + sumDay(nutrition, new Date(now.getTime() - (6 - i) * DAY_MS).toISOString()).hydrationMl, 0) : 0;

    // Habits this week
    const activeHabits = habits.filter((h) => !h.archivedAt);
    const weekLogDays = new Set<string>();
    let validated = 0;
    for (const l of habitLogs) { const t = new Date(l.completedAt).getTime(); if (t >= since) { validated += 1; weekLogDays.add(dayKey(new Date(l.completedAt))); } }
    const habitDots = labels.map((lab, i) => ({ label: lab, done: weekLogDays.has(dayKey(new Date(now.getTime() - (6 - i) * DAY_MS))) }));
    const target = activeHabits.length * 7;

    const weights = health.filter((m) => m.type === 'weight').sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
    const wLast = weights.at(-1)?.value;
    const wRef = weights.find((m) => new Date(m.measuredAt).getTime() >= since)?.value;
    const wDelta = wLast != null && wRef != null ? wLast - wRef : null;

    // Objectives (derived, real)
    const objectives = [
      { label: 'Activité cette semaine', sub: `${acts.length} séance(s)`, ok: acts.length >= 3, val: `${acts.length}/3` },
      { label: 'Sommeil ≥ 7 h 45', sub: avgSleep ? `${avgSleep.toFixed(1)} h en moyenne` : 'pas de donnée', ok: !!avgSleep && avgSleep >= 7.75, val: avgSleep ? `${Math.round((avgSleep / 7.75) * 100)} %` : '—' },
      { label: 'Récupération ≥ 70', sub: avgRec != null ? `${avgRec} en moyenne` : 'pas de donnée', ok: avgRec != null && avgRec >= 70, val: avgRec != null ? `${avgRec}` : '—' },
      { label: 'Habitudes suivies', sub: `${validated} validation(s)`, ok: target > 0 && validated >= target * 0.7, val: target > 0 ? `${Math.round((validated / target) * 100)} %` : '—' },
    ];

    return {
      sessions: acts.length, sessionsDelta: acts.length - prevActs.length, totalSec, cals,
      recByDay, sleepByDay, kcalByDay, labels, avgRec, avgRecPrev,
      avgSleep, avgSleepPrev, avgHrv: hrvVals.length ? Math.round(mean(hrvVals)) : null,
      hydration, validated, target, streakDots: habitDots, activeHabits: activeHabits.length,
      wDelta, objectives, trainingSeries: labels.map((_, i) => acts.filter((a) => dayKey(new Date(a.startedAt)) === dayKey(new Date(now.getTime() - (6 - i) * DAY_MS))).reduce((s, a) => s + a.durationSec / 60, 0)),
    };
  }, [activities, health, nutrition, habits, habitLogs, now, since, prevSince, asOf]);

  const onExport = async (): Promise<void> => {
    if (!user) return;
    setExporting(true);
    try { const data = await exportUserData(createDataRepository(), user.id); await Share.share({ message: JSON.stringify(data, null, 2) }); } catch { /* ignore */ } finally { setExporting(false); }
  };

  const recDelta = r.avgRec != null && r.avgRecPrev != null ? r.avgRec - r.avgRecPrev : null;
  const weekRecords = records.filter((rec) => new Date(rec.achievedAt).getTime() >= since);
  const kcalMax = Math.max(1, ...r.kcalByDay);

  return (
    <Screen scroll>
      <Text variant="title">Rapport hebdomadaire</Text>
      <Text variant="caption" color="textSubtle">Du {shortDate(new Date(since))} au {shortDate(now)}</Text>

      {/* Bilan */}
      <Card>
        <Text variant="label" color="textSubtle" style={{ letterSpacing: 1.2 }}>BILAN DE LA SEMAINE</Text>
        <View style={{ flexDirection: 'row', gap: spacing[5], alignItems: 'center', marginTop: spacing[3] }}>
          <ProgressRing value={r.avgRec ?? 0} size={112} thickness={11} gradient centerLabel={r.avgRec != null ? `${r.avgRec}` : '—'} caption="Forme moy." />
          <View style={{ flex: 1 }}>
            {recDelta != null ? <Text variant="body" style={{ fontWeight: '700', color: recDelta >= 0 ? colors.accentData : colors.error }}>{recDelta >= 0 ? '▲ +' : '▼ '}{Math.abs(recDelta)} pts vs semaine passée</Text> : null}
            <Text variant="body" color="textMuted" style={{ marginTop: spacing[2], lineHeight: 21 }}>
              {r.sessions > 0 ? `${r.sessions} séance${r.sessions > 1 ? 's' : ''} (${fmtDur(r.totalSec)}). ` : 'Aucune séance enregistrée. '}
              {r.avgRec != null ? `Récupération ${recoveryBand(r.avgRec)}.` : ''}
            </Text>
          </View>
        </View>
      </Card>

      {/* Chiffres clés */}
      <View>
        <SectionTitle>Les chiffres clés</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] }}>
          <Kpi label="Entraînements" value={`${r.sessions}`} delta={r.sessionsDelta !== 0 ? `${r.sessionsDelta > 0 ? '▲ +' : '▼ '}${Math.abs(r.sessionsDelta)}` : 'stable'} tone={r.sessionsDelta >= 0 ? 'up' : 'down'} />
          <Kpi label="Temps d'entraîn." value={r.totalSec > 0 ? fmtDur(r.totalSec) : '—'} />
          <Kpi label="Sommeil moyen" value={r.avgSleep ? `${r.avgSleep.toFixed(1)} h` : '—'} delta={r.avgSleep && r.avgSleepPrev ? `${r.avgSleep >= r.avgSleepPrev ? '▲' : '▼'} ${Math.abs(Math.round((r.avgSleep - r.avgSleepPrev) * 60))} min` : undefined} tone={r.avgSleep && r.avgSleepPrev && r.avgSleep >= r.avgSleepPrev ? 'up' : 'down'} />
          <Kpi label="Recovery moyen" value={r.avgRec != null ? `${r.avgRec}` : '—'} />
          <Kpi label="HRV moyen" value={r.avgHrv != null ? `${r.avgHrv} ms` : '—'} />
          <Kpi label="Hydratation" value={r.hydration > 0 ? `${(r.hydration / 1000).toFixed(1)} L` : '—'} />
          <Kpi label="Calories brûlées" value={r.cals > 0 ? `${Math.round(r.cals)}` : '—'} />
          <Kpi label="Variation poids" value={r.wDelta != null ? `${r.wDelta > 0 ? '+' : ''}${r.wDelta.toFixed(1)} kg` : '—'} />
        </View>
      </View>

      {/* Performances */}
      {r.trainingSeries.some((v) => v > 0) ? (
        <Card>
          <SectionTitle right={<Text variant="caption" color="textSubtle">charge / jour</Text>}>Performances</SectionTitle>
          <Sparkline values={r.trainingSeries} width={300} height={80} color={colors.primary} />
        </Card>
      ) : null}

      {/* Récupération par jour */}
      <Card>
        <SectionTitle>Récupération</SectionTitle>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {r.recByDay.map((v, i) => {
            const h = v != null ? Math.max(4, (v / 100) * 60) : 4;
            const c = v == null ? colors.surfaceElevated : v >= 75 ? colors.accentData : v >= 55 ? colors.warning : colors.error;
            return (
              <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                <Text variant="caption" color="textSubtle">{r.labels[i]}</Text>
                <View style={{ height: 60, width: '100%', borderRadius: 8, backgroundColor: colors.surfaceElevated, justifyContent: 'flex-end', overflow: 'hidden' }}>
                  <View style={{ height: h, backgroundColor: c, borderRadius: 8 }} />
                </View>
                <Text variant="caption" color="textSubtle">{v != null ? v : '—'}</Text>
              </View>
            );
          })}
        </View>
      </Card>

      {/* Nutrition par jour */}
      {r.kcalByDay.some((v) => v > 0) ? (
        <Card>
          <SectionTitle>Nutrition</SectionTitle>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 80 }}>
            {r.kcalByDay.map((v, i) => (<View key={i} style={{ flex: 1, height: Math.max(4, (v / kcalMax) * 80), borderRadius: 4, backgroundColor: v > 0 ? colors.warning : colors.surfaceElevated }} />))}
          </View>
        </Card>
      ) : null}

      {/* Habitudes */}
      {r.activeHabits > 0 ? (
        <Card>
          <SectionTitle>Habitudes</SectionTitle>
          <KV label="Validées" value={`${r.validated} / ${r.target}`} />
          <KV label="Taux de réussite" value={r.target > 0 ? `${Math.round((r.validated / r.target) * 100)} %` : '—'} last />
          <View style={{ flexDirection: 'row', gap: 6, marginTop: spacing[3] }}>
            {r.streakDots.map((d, i) => (
              <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                <Text variant="caption" color="textSubtle">{d.label}</Text>
                <View style={{ height: 30, width: '100%', borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: d.done ? 'rgba(43,227,139,0.18)' : colors.surfaceElevated }}>{d.done ? <Text style={{ color: colors.accentData, fontSize: 12 }}>✓</Text> : null}</View>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      {/* Objectifs */}
      <Card>
        <SectionTitle>Objectifs</SectionTitle>
        {r.objectives.map((o, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3], borderBottomWidth: i < r.objectives.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
            <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: o.ok ? 'rgba(43,227,139,0.16)' : 'rgba(245,183,66,0.16)' }}><Text style={{ color: o.ok ? colors.accentData : colors.warning, fontSize: 13 }}>{o.ok ? '✓' : '~'}</Text></View>
            <View style={{ flex: 1 }}><Text variant="body">{o.label}</Text><Text variant="caption" color="textSubtle">{o.sub}</Text></View>
            <Text variant="body" style={{ fontWeight: '700', color: o.ok ? colors.accentData : colors.warning }}>{o.val}</Text>
          </View>
        ))}
      </Card>

      {/* Records de la semaine */}
      {weekRecords.length > 0 ? (
        <Card>
          <SectionTitle>Records de la semaine</SectionTitle>
          <View style={{ gap: spacing[2] }}>
            {weekRecords.slice(0, 5).map((rec) => (
              <View key={rec.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text variant="body" style={{ flex: 1 }}>{rec.label}</Text>
                <Text variant="body" style={{ fontWeight: '700' }}>{rec.value} {rec.unit}</Text>
                <Text variant="caption" color="textSubtle" style={{ marginLeft: spacing[2] }}>{formatDate(rec.achievedAt)}</Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      {/* Analyse */}
      <View style={{ borderRadius: radii.xl, borderWidth: 1, borderColor: 'rgba(45,127,249,0.25)', backgroundColor: 'rgba(45,127,249,0.08)', padding: spacing[5] }}>
        <View style={{ flexDirection: 'row', gap: spacing[2], alignItems: 'center' }}><Icon name="brain" size={20} color={colors.info} /><Text variant="heading">Analyse Kaizen</Text></View>
        <Text variant="body" color="textMuted" style={{ marginTop: spacing[2], lineHeight: 22 }}>
          {r.avgRec != null && r.avgRecPrev != null && r.avgRec >= r.avgRecPrev ? 'Ta récupération s’est améliorée cette semaine. ' : ''}
          {r.avgSleep && r.avgSleep < 7.5 ? 'Le sommeil reste ton principal axe d’amélioration. ' : r.avgSleep ? 'Ton sommeil est solide. ' : ''}
          {r.wDelta != null && r.wDelta <= 0 ? 'Ta perte de poids est cohérente avec ton objectif.' : ''}
        </Text>
      </View>

      {/* Plan recommandé */}
      <Card>
        <SectionTitle>Plan · semaine prochaine</SectionTitle>
        {[
          { i: '🏋️', t: `${Math.max(3, r.sessions)} séances d'entraînement` },
          { i: '😴', t: r.avgSleep && r.avgSleep < 7.75 ? 'Viser 7 h 45 de sommeil' : 'Maintenir ton rythme de sommeil' },
          { i: '💧', t: 'Rester au-dessus de ta cible d’hydratation' },
          { i: '🧘', t: 'Ajouter une séance de mobilité' },
        ].map((p, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[2] }}>
            <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 15 }}>{p.i}</Text></View>
            <Text variant="body" style={{ flex: 1 }}>{p.t}</Text>
          </View>
        ))}
      </Card>

      {/* Export */}
      <View style={{ flexDirection: 'row', gap: spacing[2] }}>
        <Button label={exporting ? 'Export…' : 'Exporter / partager'} onPress={onExport} disabled={exporting || !user} />
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
