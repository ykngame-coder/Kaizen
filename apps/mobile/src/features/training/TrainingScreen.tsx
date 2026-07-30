import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Card, Fab, ProgressRing, Screen, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { MuscleGroup } from '@supotsu/core';
import { computeMuscleStates, computeRecoveryScore } from '@supotsu/engines';
import { useActivities, useHealthMetrics, useMuscleSessions, useWorkouts } from '@/lib/data/queries';
import { formatDate } from '@/lib/format';
import { HubRow } from '@/features/navigation/HubRow';

const DAY_MS = 86_400_000;

const MUSCLE_INLINE: Partial<Record<MuscleGroup, string>> = {
  chest: 'Pectoraux', back: 'Dos', shoulders: 'Épaules', biceps: 'Biceps', triceps: 'Triceps',
  quads: 'Quadriceps', hamstrings: 'Ischios', glutes: 'Fessiers', calves: 'Mollets', core: 'Abdos',
};

const NAV: { title: string; subtitle: string; icon: string; path?: Href; soon?: boolean }[] = [
  { title: 'Calendrier', subtitle: 'Tes séances et événements', icon: '🗓', path: '/calendar' },
  { title: 'Programmes', subtitle: 'Programmes structurés et recommandés', icon: '📋', path: '/marketplace' },
  { title: 'Récupération musculaire', subtitle: 'Muscles fatigués vs prêts à travailler', icon: '💪', path: '/muscles' },
  { title: 'Records', subtitle: '1RM, meilleurs temps, distances', icon: '🏆', path: '/records' },
  { title: 'Exercices', subtitle: 'Bibliothèque, muscles, matériel', icon: '📚', path: '/exercises' },
  { title: 'Progression musculaire', subtitle: 'Évolution par groupe musculaire', icon: '📈', path: '/muscle-progress' },
];

/** hh h mm from seconds. */
function fmtDur(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
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

/** Entraînements hub (mockup #7): body state, weekly stats, sections, history. */
export function TrainingScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { data: workouts = [], isLoading } = useWorkouts();
  const { data: activities = [] } = useActivities();
  const { data: health = [] } = useHealthMetrics();
  const { data: muscleSessions = [] } = useMuscleSessions();
  const asOf = new Date().toISOString();

  const recovery = useMemo(() => {
    const r = computeRecoveryScore(health, asOf);
    return r.confidence === 'to_confirm' ? null : r.value;
  }, [health, asOf]);

  const tired = useMemo(() => {
    const states = computeMuscleStates(muscleSessions, asOf);
    return states
      .filter((s) => s.lastTrainedDaysAgo !== null && (s.state === 'fatigued' || s.state === 'worked'))
      .sort((a, b) => a.freshness - b.freshness)
      .slice(0, 3)
      .map((s) => MUSCLE_INLINE[s.muscle] ?? s.muscle);
  }, [muscleSessions, asOf]);

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

  const recent = useMemo(
    () => [...workouts].sort((a, b) => (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt)).slice(0, 6),
    [workouts],
  );

  return (
    <View style={{ flex: 1 }}>
    <Screen scroll>
      <Text variant="title">Entraînements</Text>
      <Text variant="caption" color="textMuted">
        Prêt pour votre séance ?
      </Text>

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
          </View>
        </View>
      </Card>

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

      {/* Historique */}
      <Text variant="heading" style={{ marginTop: spacing[2] }}>
        Dernières séances
      </Text>
      {isLoading ? (
        <Text variant="body" color="textMuted">
          Chargement…
        </Text>
      ) : recent.length === 0 ? (
        <Card>
          <Text variant="body" color="textMuted">
            Aucune séance enregistrée. Crée ta première séance depuis la bibliothèque d'exercices.
          </Text>
        </Card>
      ) : (
        <Card>
          {recent.map((w, i) => (
            <Pressable key={w.id} onPress={() => router.push({ pathname: '/workout/[id]', params: { id: w.id } })} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3], borderBottomWidth: i < recent.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                <View style={{ width: 34, height: 34, borderRadius: radii.md, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 16 }}>🎽</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="body">{w.name}</Text>
                  <Text variant="caption" color="textSubtle" style={{ marginTop: 1 }}>
                    {formatDate(w.completedAt ?? w.createdAt)}
                    {w.durationSec ? ` · ${fmtDur(w.durationSec)}` : ''}
                    {w.rpe ? ` · RPE ${w.rpe}` : ''}
                  </Text>
                </View>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: w.status === 'completed' ? colors.accentData : w.status === 'skipped' ? colors.error : colors.warning }} />
              </View>
            </Pressable>
          ))}
        </Card>
      )}

    </Screen>
      <Fab icon="+" accessibilityLabel="Nouvelle séance" onPress={() => router.push('/workout/new')} />
    </View>
  );
}
