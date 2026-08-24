import React, { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Card, Carousel, Fab, Icon, ProgressRing, Screen, Text, useTheme, type IconName } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { MuscleGroup } from '@supotsu/core';
import { computeAcwr, computeRecoveryScore, computeSportScore } from '@supotsu/engines';
import {
  useActivities,
  useHealthMetrics,
  useMuscleSessions,
  usePlannedWorkouts,
  useWorkouts,
} from '@/lib/data/queries';
import { formatDate } from '@/lib/format';
import { useManualHealthKitSync } from '@/features/connectors/useHealthKitAutoSync';
import { HubRow } from '@/features/navigation/HubRow';
import { DayNav, useSelectedDay } from '@/features/navigation/DayNav';
import { MuscleBody } from '@/features/muscles/MuscleBody';
import { muscleColorFor, muscleStatesFor } from '@/features/muscles/muscleColor';
import { ComprendreCard } from '@/features/knowledge/ComprendreCard';
import { ObjectifsCard } from '@/features/goals/ObjectifsCard';

const DAY_MS = 86_400_000;

const NAV_KEYS: { key: string; icon: IconName; path?: Href; soon?: boolean }[] = [
  { key: 'activities', icon: 'run', path: '/sport/activities' },
  { key: 'import', icon: 'camera', path: '/sport/workout/import' },
  { key: 'planning', icon: 'calendarClock', path: '/sport/planning' },
  { key: 'calendar', icon: 'calendar', path: '/sport/calendar' },
  { key: 'programs', icon: 'clipboardText', path: '/marketplace' },
  { key: 'muscleRecovery', icon: 'armFlex', path: '/sport/muscles' },
  { key: 'stomachVacuum', icon: 'lungs', path: '/sport/stomach-vacuum' },
  { key: 'timers', icon: 'timer', path: '/sport/timer' },
  { key: 'exercises', icon: 'bookOpen', path: '/sport/exercises' },
  { key: 'muscleProgress', icon: 'trendingUp', path: '/sport/muscle-progress' },
];

/** hh h mm from seconds. */
function fmtDur(sec: number, t: TFunction): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0
    ? t('sport.screen.duration.hoursMinutes', { h, m: String(m).padStart(2, '0') })
    : t('sport.screen.duration.minutes', { m });
}

/** "Aujourd'hui" / "Lun. 12 août" — the planned session always falls on the selected day. */
function planLabel(plannedFor: string | undefined, todayKey: string, t: TFunction): string {
  if (!plannedFor) return t('sport.screen.planLabel.tbd');
  const key = plannedFor.slice(0, 10);
  if (key === todayKey) return t('sport.screen.planLabel.today');
  return new Date(plannedFor).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** 2×2 stat tile. */
function StatTile({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing[4] }}>
      {typeof icon === 'string' ? <Text style={{ fontSize: 18 }}>{icon}</Text> : icon}
      <Text variant="subtitle" style={{ marginTop: spacing[2], letterSpacing: -0.4 }}>
        {value}
      </Text>
      <Text variant="caption" color="textSubtle" style={{ marginTop: 2 }}>
        {label}
      </Text>
    </View>
  );
}

/** Compact metric tile (Charge / VO2 Max) next to the recovery ring. */
function MiniStat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text variant="subtitle">{value}</Text>
      <Text variant="caption" color="textSubtle" style={{ marginTop: 2 }}>
        {label}
      </Text>
    </View>
  );
}

/** One Score Sport pillar (Performance / Régularité / Progression) — same filling-ring pattern as Nutrition's macro rings. */
function PillarRing({ label, value, color }: { label: string; value: number | undefined; color: string }): React.JSX.Element {
  return (
    <View style={{ alignItems: 'center' }}>
      <ProgressRing value={value ?? 0} size={64} thickness={7} color={color} centerLabel={value != null ? `${value}` : '—'} />
      <Text variant="caption" style={{ color, fontWeight: '700', marginTop: spacing[1] }}>{label}</Text>
    </View>
  );
}

/** Sport hub (was Entraînements): body state, weekly stats, sections, history. */
export function SportScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { data: workouts = [], isLoading } = useWorkouts();
  const { data: activities = [] } = useActivities();
  const { data: health = [] } = useHealthMetrics();
  const { data: muscleSessions = [] } = useMuscleSessions();
  const { data: planned = [] } = usePlannedWorkouts();
  const [selectedDate, setSelectedDate] = useSelectedDay();
  const asOf = selectedDate;

  const qc = useQueryClient();
  const syncHealth = useManualHealthKitSync();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async (): Promise<void> => { setRefreshing(true); await syncHealth(); await qc.invalidateQueries(); setRefreshing(false); };

  const todayKey = new Date().toISOString().slice(0, 10);
  const selectedDayKey = selectedDate.slice(0, 10);

  const plannedToday = useMemo(
    () => [...planned]
      .filter((w) => (w.plannedFor ?? '').slice(0, 10) === selectedDayKey)
      .sort((a, b) => (a.plannedFor ?? '').localeCompare(b.plannedFor ?? ''))[0],
    [planned, selectedDayKey],
  );

  const recovery = useMemo(() => {
    const r = computeRecoveryScore(health, asOf);
    return r.confidence === 'to_confirm' ? null : r.value;
  }, [health, asOf]);

  const sport = useMemo(() => {
    const r = computeSportScore(activities, asOf);
    return r.confidence === 'to_confirm' ? null : r;
  }, [activities, asOf]);

  const muscleStates = useMemo(() => muscleStatesFor(muscleSessions, asOf), [muscleSessions, asOf]);
  const colorFor = useMemo(() => muscleColorFor(muscleStates, colors), [muscleStates, colors]);

  const muscleLabel: Partial<Record<MuscleGroup, string>> = useMemo(
    () => ({
      chest: t('sport.screen.muscle.chest'),
      back: t('sport.screen.muscle.back'),
      shoulders: t('sport.screen.muscle.shoulders'),
      biceps: t('sport.screen.muscle.biceps'),
      triceps: t('sport.screen.muscle.triceps'),
      quads: t('sport.screen.muscle.quads'),
      hamstrings: t('sport.screen.muscle.hamstrings'),
      glutes: t('sport.screen.muscle.glutes'),
      calves: t('sport.screen.muscle.calves'),
      core: t('sport.screen.muscle.core'),
    }),
    [t],
  );

  const tired = useMemo(
    () => muscleStates
      .filter((s) => s.lastTrainedDaysAgo !== null && (s.state === 'fatigued' || s.state === 'worked'))
      .sort((a, b) => a.freshness - b.freshness)
      .slice(0, 3)
      .map((s) => muscleLabel[s.muscle] ?? s.muscle),
    [muscleStates, muscleLabel],
  );

  const NAV = useMemo(
    () =>
      NAV_KEYS.map((n) => ({
        ...n,
        title: t(`sport.screen.nav.${n.key}.title`),
        subtitle: t(`sport.screen.nav.${n.key}.subtitle`),
      })),
    [t],
  );

  const acwr = useMemo(() => computeAcwr(activities, asOf), [activities, asOf]);

  const week = useMemo(() => {
    const since = new Date(asOf).getTime() - 7 * DAY_MS;
    const wk = workouts.filter((w) => w.status === 'completed' && w.completedAt && new Date(w.completedAt).getTime() >= since);
    const acts = activities.filter((a) => new Date(a.startedAt).getTime() >= since);
    const totalSec = wk.reduce((s, w) => s + (w.durationSec ?? 0), 0) + acts.reduce((s, a) => s + a.durationSec, 0);
    const cals = acts.reduce((s, a) => s + (a.calories ?? 0), 0);
    const rpes = wk.map((w) => w.rpe).filter((r): r is number => r != null);
    const rpe = rpes.length ? rpes.reduce((s, r) => s + r, 0) / rpes.length : null;
    return { sessions: wk.length + acts.length, totalSec, cals, rpe };
  }, [workouts, activities, asOf]);

  /** 3 most recent activities — workouts and raw activities merged, most recent first. */
  const recent = useMemo(() => {
    const w = workouts
      .filter((x) => x.status === 'completed' && x.completedAt)
      .map((x) => ({ kind: 'workout' as const, id: x.id, date: x.completedAt!, name: x.name, durationSec: x.durationSec, rpe: x.rpe, status: x.status }));
    const a = activities.map((x) => ({ kind: 'activity' as const, id: x.id, date: x.startedAt, name: x.type, durationSec: x.durationSec, rpe: undefined, status: undefined }));
    return [...w, ...a].sort((x, y) => y.date.localeCompare(x.date)).slice(0, 3);
  }, [workouts, activities]);

  return (
    <View style={{ flex: 1 }}>
      <Screen scroll onRefresh={onRefresh} refreshing={refreshing}>
        <View style={{ position: 'relative' }}>
          <View style={{ alignItems: 'center' }}>
            <Text variant="title">{t('sport.screen.title')}</Text>
            <Text variant="caption" color="textMuted">
              {t('sport.screen.subtitle')}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/sport/exercises')}
            accessibilityLabel={t('sport.screen.searchExercise')}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, position: 'absolute', right: 0, top: 0 })}
          >
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="search" size={16} color={colors.text} />
            </View>
          </Pressable>
        </View>
        <DayNav value={selectedDate} onChange={setSelectedDate} />

        {/* Séance du jour ↔ Score Sport ↔ État du corps ↔ Récupération musculaire */}
        <Carousel
          data={[
            'seance' as const,
            'score' as const,
            'corps' as const,
            'muscles' as const,
          ]}
          keyExtractor={(k) => k}
          peek={20}
          renderItem={(page) => {
            if (page === 'seance') {
              return (
                <Card>
                  <View style={{ flexDirection: 'row', gap: spacing[4], alignItems: 'center' }}>
                    <View style={{ width: 64, height: 64, borderRadius: radii.lg, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="dumbbell" size={28} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      {plannedToday ? (
                        <>
                          <Text variant="body" style={{ fontWeight: '700' }}>{plannedToday.name}</Text>
                          <Text variant="caption" color="textSubtle" style={{ marginTop: 2 }}>
                            {planLabel(plannedToday.plannedFor, todayKey, t)}
                            {plannedToday.notes ? ` · ${plannedToday.notes}` : ''}
                          </Text>
                        </>
                      ) : (
                        <>
                          <Text variant="body" style={{ fontWeight: '700' }}>
                            {selectedDayKey === todayKey ? t('sport.screen.session.noneToday') : t('sport.screen.session.noneThatDay')}
                          </Text>
                          <Text variant="caption" color="textSubtle" style={{ marginTop: 2 }}>
                            {t('sport.screen.session.chooseFocus')}
                          </Text>
                        </>
                      )}
                    </View>
                  </View>
                  <Pressable
                    onPress={() => router.push(plannedToday ? '/sport/planning' : '/sport/workout/new')}
                    style={({ pressed }) => ({ marginTop: spacing[3], height: 46, borderRadius: radii.xl, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.98 : 1 }] })}
                  >
                    <Text variant="body" style={{ fontWeight: '600' }}>{plannedToday ? t('sport.screen.session.viewPlanning') : t('sport.screen.session.createSession')}</Text>
                  </Pressable>
                </Card>
              );
            }
            if (page === 'score') {
              return (
                <Card>
                  <Text variant="heading">{t('sport.screen.score.heading')}</Text>
                  <View style={{ flexDirection: 'row', gap: spacing[4], alignItems: 'center', marginTop: spacing[3] }}>
                    <ProgressRing value={sport?.value ?? 0} size={72} thickness={8} gradient centerLabel={sport ? `${sport.value}` : '—'} />
                    <Text variant="caption" color="textMuted" style={{ flex: 1 }}>
                      {t('sport.screen.score.description')}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: spacing[4] }}>
                    <PillarRing label={t('sport.screen.score.performance')} value={sport?.breakdown.performance} color={colors.accentData} />
                    <PillarRing label={t('sport.screen.score.regularity')} value={sport?.breakdown.regularity} color={colors.warning} />
                    <PillarRing label={t('sport.screen.score.progression')} value={sport?.breakdown.progression} color={colors.accentMobility} />
                  </View>
                </Card>
              );
            }
            if (page === 'corps') {
              return (
                <Card>
                  <Text variant="heading">{t('sport.screen.body.heading')}</Text>
                  <View style={{ flexDirection: 'row', gap: spacing[4], alignItems: 'center', marginTop: spacing[3] }}>
                    <ProgressRing value={recovery ?? 0} size={72} thickness={8} gradient centerLabel={recovery != null ? `${recovery}` : '—'} />
                    <View style={{ flex: 1 }}>
                      <Text variant="caption" color="textMuted">
                        {t('sport.screen.body.globalRecovery')}
                      </Text>
                      {tired.length > 0 ? (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[2] }}>
                          <Text variant="caption" color="textSubtle" style={{ alignSelf: 'center' }}>
                            {t('sport.screen.body.stillTired')}
                          </Text>
                          {tired.map((m) => (
                            <View key={m} style={{ borderRadius: radii.full, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: 'rgba(255,139,94,0.14)', borderWidth: 1, borderColor: 'rgba(255,139,94,0.3)' }}>
                              <Text variant="caption" style={{ color: colors.accentStrength, fontWeight: '600' }}>
                                {m}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <Text variant="body" color="accentData" style={{ marginTop: spacing[2], fontWeight: '600' }}>
                          {t('sport.screen.body.allRecovered')}
                        </Text>
                      )}
                      <View style={{ flexDirection: 'row', gap: spacing[5], marginTop: spacing[3] }}>
                        <MiniStat label={t('sport.screen.body.load')} value={acwr.ratio != null ? acwr.ratio.toFixed(2) : '—'} />
                        <Pressable onPress={() => router.push({ pathname: '/health/[metric]', params: { metric: 'vo2max' } })}>
                          <MiniStat label={t('sport.screen.body.vo2max')} value="—" />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                </Card>
              );
            }
            return (
              <Card>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <Text variant="heading">{t('sport.screen.muscleRecovery.heading')}</Text>
                  <Pressable onPress={() => router.push('/sport/muscles')}>
                    <Text variant="caption" color="primary">{t('sport.screen.muscleRecovery.viewAll')}</Text>
                  </Pressable>
                </View>
                <View style={{ alignItems: 'center', marginTop: spacing[3] }}>
                  <MuscleBody colorFor={colorFor} width={260} />
                </View>
              </Card>
            );
          }}
        />

        {/* 3 dernières activités */}
        <Text variant="heading" style={{ marginTop: spacing[2] }}>
          {t('sport.screen.recent.heading')}
        </Text>
        {isLoading ? (
          <Text variant="body" color="textMuted">
            {t('common.loading')}
          </Text>
        ) : recent.length === 0 ? (
          <Card>
            <Text variant="body" color="textMuted">
              {t('sport.screen.recent.empty')}
            </Text>
          </Card>
        ) : (
          <Card>
            {recent.map((r, i) => {
              const row = (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3], borderBottomWidth: i < recent.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                  <View style={{ width: 34, height: 34, borderRadius: radii.md, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={r.kind === 'workout' ? 'tshirt' : 'run'} size={16} color={colors.text} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="body">{r.name}</Text>
                    <Text variant="caption" color="textSubtle" style={{ marginTop: 1 }}>
                      {formatDate(r.date)}
                      {r.durationSec ? ` · ${fmtDur(r.durationSec, t)}` : ''}
                      {r.rpe ? ` · ${t('sport.screen.recent.rpe', { rpe: r.rpe })}` : ''}
                    </Text>
                  </View>
                  {r.kind === 'workout' ? (
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accentData }} />
                  ) : null}
                </View>
              );
              return r.kind === 'workout' ? (
                <Pressable key={r.id} onPress={() => router.push({ pathname: '/sport/workout/[id]', params: { id: r.id } })} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                  {row}
                </Pressable>
              ) : (
                <View key={r.id}>{row}</View>
              );
            })}
          </Card>
        )}
        <View style={{ alignItems: 'flex-start' }}>
          <Pressable onPress={() => router.push('/sport/activities')}>
            <Text variant="caption" color="primary">{t('sport.screen.recent.viewAllHistory')}</Text>
          </Pressable>
        </View>

        {/* Cette semaine */}
        <Text variant="heading" style={{ marginTop: spacing[2] }}>
          {t('sport.screen.week.heading')}
        </Text>
        <View style={{ gap: spacing[3] }}>
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <StatTile icon={<Icon name="armFlex" size={18} color={colors.accentStrength} />} value={`${week.sessions}`} label={t('sport.screen.week.sessions')} />
            <StatTile icon={<Icon name="timer" size={18} color={colors.info} />} value={week.totalSec > 0 ? fmtDur(week.totalSec, t) : '—'} label={t('sport.screen.week.totalTime')} />
          </View>
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <StatTile icon={<Icon name="fire" size={18} color={colors.warning} />} value={week.cals > 0 ? `${Math.round(week.cals)}` : '—'} label={t('sport.screen.week.calories')} />
            <StatTile icon={<Icon name="target" size={18} color={colors.accentData} />} value={week.rpe != null ? week.rpe.toFixed(1) : '—'} label={t('sport.screen.week.avgRpe')} />
          </View>
        </View>

        {/* Sections */}
        <View style={{ gap: spacing[2], marginTop: spacing[2] }}>
          {NAV.map((n) => (
            <HubRow key={n.title} title={n.title} subtitle={n.subtitle} icon={<Icon name={n.icon} size={20} color={colors.text} />} soon={n.soon} onPress={n.path ? () => router.push(n.path!) : undefined} />
          ))}
        </View>

        <ComprendreCard pillars={['performance']} />
        <ObjectifsCard types={['performance', 'strength', 'endurance']} />
      </Screen>
      <Fab icon="+" accessibilityLabel={t('sport.screen.newSession')} onPress={() => router.push('/sport/workout/new')} />
    </View>
  );
}
