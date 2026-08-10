import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Card, Fab, ProgressRing, Screen, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { MuscleGroup } from '@supotsu/core';
import { computeAcwr, computeRecoveryScore } from '@supotsu/engines';
import {
  useActivities,
  useHealthMetrics,
  useMuscleSessions,
  usePlannedWorkouts,
  useWorkouts,
} from '@/lib/data/queries';
import { formatDate } from '@/lib/format';
import { HubRow } from '@/features/navigation/HubRow';
import { DayNav, useSelectedDay } from '@/features/navigation/DayNav';
import { MuscleBody } from '@/features/muscles/MuscleBody';
import { muscleColorFor, muscleStatesFor } from '@/features/muscles/muscleColor';
import { ComprendreCard } from '@/features/knowledge/ComprendreCard';
import { ObjectifsCard } from '@/features/goals/ObjectifsCard';

const DAY_MS = 86_400_000;

const MUSCLE_INLINE: Partial<Record<MuscleGroup, string>> = {
  chest: 'Pectoraux', back: 'Dos', shoulders: 'Épaules', biceps: 'Biceps', triceps: 'Triceps',
  quads: 'Quadriceps', hamstrings: 'Ischios', glutes: 'Fessiers', calves: 'Mollets', core: 'Abdos',
};

const NAV: { title: string; subtitle: string; icon: string; path?: Href; soon?: boolean }[] = [
  { title: 'Planification', subtitle: 'Programme tes séances + prévision récup', icon: '🗓', path: '/sport/planning' },
  { title: 'Calendrier', subtitle: 'Tes séances et événements', icon: '📅', path: '/sport/calendar' },
  { title: 'Programmes', subtitle: 'Programmes structurés et recommandés', icon: '📋', path: '/profile/marketplace' },
  { title: 'Récupération musculaire', subtitle: 'Muscles fatigués vs prêts à travailler', icon: '💪', path: '/sport/muscles' },
  { title: 'Stomach Vacuum', subtitle: 'Gainage du transverse, séance guidée', icon: '🫁', path: '/sport/stomach-vacuum' },
  { title: 'Records', subtitle: '1RM, meilleurs temps, distances', icon: '🏆', path: '/sport/records' },
  { title: 'Exercices', subtitle: 'Bibliothèque, muscles, matériel', icon: '📚', path: '/sport/exercises' },
  { title: 'Progression musculaire', subtitle: 'Évolution par groupe musculaire', icon: '📈', path: '/sport/muscle-progress' },
];

/** hh h mm from seconds. */
function fmtDur(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

/** "Aujourd'hui" / "Lun. 12 août" — the planned session always falls on the selected day. */
function planLabel(plannedFor: string | undefined, todayKey: string): string {
  if (!plannedFor) return 'Date à définir';
  const key = plannedFor.slice(0, 10);
  if (key === todayKey) return "Aujourd'hui";
  return new Date(plannedFor).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** 2×2 stat tile. */
function StatTile({ icon, value, label }: { icon: string; value: string; label: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing[4] }}>
      <Text style={{ fontSize: 18 }}>{icon}</Text>
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

/** Sport hub (was Entraînements): body state, weekly stats, sections, history. */
export function SportScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { data: workouts = [], isLoading } = useWorkouts();
  const { data: activities = [] } = useActivities();
  const { data: health = [] } = useHealthMetrics();
  const { data: muscleSessions = [] } = useMuscleSessions();
  const { data: planned = [] } = usePlannedWorkouts();
  const [selectedDate, setSelectedDate] = useSelectedDay();
  const asOf = selectedDate;

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

  const muscleStates = useMemo(() => muscleStatesFor(muscleSessions, asOf), [muscleSessions, asOf]);
  const colorFor = useMemo(() => muscleColorFor(muscleStates, colors), [muscleStates, colors]);
  const tired = useMemo(
    () => muscleStates
      .filter((s) => s.lastTrainedDaysAgo !== null && (s.state === 'fatigued' || s.state === 'worked'))
      .sort((a, b) => a.freshness - b.freshness)
      .slice(0, 3)
      .map((s) => MUSCLE_INLINE[s.muscle] ?? s.muscle),
    [muscleStates],
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
      <Screen scroll>
        <Text variant="title">Sport</Text>
        <Text variant="caption" color="textMuted">
          Prêt pour votre séance ?
        </Text>
        <DayNav value={selectedDate} onChange={setSelectedDate} />

        {/* Séance du jour sélectionné */}
        <Card style={{ marginTop: spacing[3] }}>
          <View style={{ flexDirection: 'row', gap: spacing[4], alignItems: 'center' }}>
            <View style={{ width: 64, height: 64, borderRadius: radii.lg, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 28 }}>🏋️</Text>
            </View>
            <View style={{ flex: 1 }}>
              {plannedToday ? (
                <>
                  <Text variant="body" style={{ fontWeight: '700' }}>{plannedToday.name}</Text>
                  <Text variant="caption" color="textSubtle" style={{ marginTop: 2 }}>
                    {planLabel(plannedToday.plannedFor, todayKey)}
                    {plannedToday.notes ? ` · ${plannedToday.notes}` : ''}
                  </Text>
                </>
              ) : (
                <>
                  <Text variant="body" style={{ fontWeight: '700' }}>
                    {selectedDayKey === todayKey ? 'Aucune séance prévue aujourd’hui' : 'Aucune séance prévue ce jour-là'}
                  </Text>
                  <Text variant="caption" color="textSubtle" style={{ marginTop: 2 }}>
                    Choisis un focus selon ta récupération
                  </Text>
                </>
              )}
            </View>
          </View>
          <Pressable
            onPress={() => router.push(plannedToday ? '/sport/planning' : '/sport/workout/new')}
            style={({ pressed }) => ({ marginTop: spacing[3], height: 46, borderRadius: radii.xl, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.98 : 1 }] })}
          >
            <Text variant="body" style={{ fontWeight: '600' }}>{plannedToday ? 'Voir le planning ›' : 'Créer une séance ›'}</Text>
          </Pressable>
        </Card>

        {/* État du corps */}
        <Card style={{ marginTop: spacing[3] }}>
          <Text variant="heading">État du corps</Text>
          <View style={{ flexDirection: 'row', gap: spacing[4], alignItems: 'center', marginTop: spacing[3] }}>
            <ProgressRing value={recovery ?? 0} size={72} thickness={8} gradient centerLabel={recovery != null ? `${recovery}` : '—'} />
            <View style={{ flex: 1 }}>
              <Text variant="caption" color="textMuted">
                Récupération globale
              </Text>
              {tired.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[2] }}>
                  <Text variant="caption" color="textSubtle" style={{ alignSelf: 'center' }}>
                    Encore fatigués :
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
                  Tous les groupes sont rétablis 💪
                </Text>
              )}
              <View style={{ flexDirection: 'row', gap: spacing[5], marginTop: spacing[3] }}>
                <MiniStat label="Charge (ACWR)" value={acwr.ratio != null ? acwr.ratio.toFixed(2) : '—'} />
                <Pressable onPress={() => router.push({ pathname: '/health/[metric]', params: { metric: 'vo2max' } })}>
                  <MiniStat label="VO₂ Max" value="—" />
                </Pressable>
              </View>
            </View>
          </View>
        </Card>

        {/* Récupération musculaire — silhouette en grand, carte à part */}
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text variant="heading">Récupération musculaire</Text>
            <Pressable onPress={() => router.push('/sport/muscles')}>
              <Text variant="caption" color="primary">Voir ›</Text>
            </Pressable>
          </View>
          <View style={{ alignItems: 'center', marginTop: spacing[3] }}>
            <MuscleBody colorFor={colorFor} width={260} />
          </View>
        </Card>

        {/* 3 dernières activités */}
        <Text variant="heading" style={{ marginTop: spacing[2] }}>
          3 dernières activités
        </Text>
        {isLoading ? (
          <Text variant="body" color="textMuted">
            Chargement…
          </Text>
        ) : recent.length === 0 ? (
          <Card>
            <Text variant="body" color="textMuted">
              Aucune activité enregistrée. Crée ta première séance depuis la bibliothèque d'exercices.
            </Text>
          </Card>
        ) : (
          <Card>
            {recent.map((r, i) => {
              const row = (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3], borderBottomWidth: i < recent.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                  <View style={{ width: 34, height: 34, borderRadius: radii.md, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 16 }}>{r.kind === 'workout' ? '🎽' : '🏃'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="body">{r.name}</Text>
                    <Text variant="caption" color="textSubtle" style={{ marginTop: 1 }}>
                      {formatDate(r.date)}
                      {r.durationSec ? ` · ${fmtDur(r.durationSec)}` : ''}
                      {r.rpe ? ` · RPE ${r.rpe}` : ''}
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
            <Text variant="caption" color="primary">Voir tout l'historique ›</Text>
          </Pressable>
        </View>

        {/* Cette semaine */}
        <Text variant="heading" style={{ marginTop: spacing[2] }}>
          Cette semaine
        </Text>
        <View style={{ gap: spacing[3] }}>
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <StatTile icon="💪" value={`${week.sessions}`} label="Séances" />
            <StatTile icon="⏱" value={week.totalSec > 0 ? fmtDur(week.totalSec) : '—'} label="Temps total" />
          </View>
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <StatTile icon="🔥" value={week.cals > 0 ? `${Math.round(week.cals)}` : '—'} label="Calories" />
            <StatTile icon="🎯" value={week.rpe != null ? week.rpe.toFixed(1) : '—'} label="RPE moyen" />
          </View>
        </View>

        {/* Sections */}
        <View style={{ gap: spacing[2], marginTop: spacing[2] }}>
          {NAV.map((n) => (
            <HubRow key={n.title} title={n.title} subtitle={n.subtitle} icon={n.icon} soon={n.soon} onPress={n.path ? () => router.push(n.path!) : undefined} />
          ))}
        </View>

        <ComprendreCard pillars={['performance']} />
        <ObjectifsCard types={['performance', 'strength', 'endurance']} />
      </Screen>
      <Fab icon="+" accessibilityLabel="Nouvelle séance" onPress={() => router.push('/sport/workout/new')} />
    </View>
  );
}
