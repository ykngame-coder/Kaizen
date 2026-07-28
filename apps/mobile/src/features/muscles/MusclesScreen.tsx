import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Card, EmptyState, Meter, Screen, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import type { MuscleGroup } from '@supotsu/core';
import {
  computeMuscleStates,
  overallReadiness,
  suggestNextMuscles,
  type MuscleState,
  type MuscleStatus,
} from '@supotsu/engines';
import { useMuscleSessions } from '@/lib/data/queries';
import { BodyMap } from './BodyMap';

/** French display names for each muscle group. */
const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  chest: 'Pectoraux',
  back: 'Dos',
  shoulders: 'Épaules',
  biceps: 'Biceps',
  triceps: 'Triceps',
  quads: 'Quadriceps',
  hamstrings: 'Ischios',
  glutes: 'Fessiers',
  calves: 'Mollets',
  core: 'Abdos / gainage',
  full_body: 'Corps entier',
};

/** Lower-case names for inline sentences ("tes pectoraux et tes épaules"). */
const MUSCLE_INLINE: Record<MuscleGroup, string> = {
  chest: 'pectoraux',
  back: 'dos',
  shoulders: 'épaules',
  biceps: 'biceps',
  triceps: 'triceps',
  quads: 'quadriceps',
  hamstrings: 'ischios',
  glutes: 'fessiers',
  calves: 'mollets',
  core: 'abdos',
  full_body: 'corps entier',
};

/** Recovery states, in the mockup's vocabulary (#5). */
const STATE_LABEL: Record<MuscleState, string> = {
  fatigued: 'Fatigué',
  worked: 'Modéré',
  fresh: 'Bon',
  rested: 'Prêt',
};
const STATE_TONE: Record<MuscleState, 'success' | 'info' | 'warning' | 'error'> = {
  fatigued: 'error',
  worked: 'warning',
  fresh: 'success',
  rested: 'info',
};

/** Join French labels: "a, b et c". */
function joinFr(labels: string[]): string {
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(', ')} et ${labels[labels.length - 1]}`;
}

/** Muscle recovery (#5): overall state on a body map, then a per-group readout. */
export function MusclesScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { data: sessions = [], isLoading } = useMuscleSessions();

  const statuses = useMemo(
    () => computeMuscleStates(sessions, new Date().toISOString()),
    [sessions],
  );
  const byMuscle = useMemo(
    () => new Map<MuscleGroup, MuscleStatus>(statuses.map((s) => [s.muscle, s])),
    [statuses],
  );

  const stateColor = (state: MuscleState): string => colors[STATE_TONE[state]];
  const colorFor = (muscle: MuscleGroup): string => {
    const status = byMuscle.get(muscle);
    // Never trained in the window → neutral (nothing to recover).
    if (!status || status.lastTrainedDaysAgo === null) return colors.surfaceElevated;
    return stateColor(status.state);
  };

  const readiness = useMemo(() => overallReadiness(statuses), [statuses]);
  const fresh = useMemo(() => suggestNextMuscles(statuses, 3), [statuses]);
  const ranked = useMemo(
    () =>
      [...statuses]
        .filter((s) => s.lastTrainedDaysAgo !== null)
        .sort((a, b) => a.freshness - b.freshness),
    [statuses],
  );

  const stillTired = ranked.filter((s) => s.state === 'fatigued' || s.state === 'worked');
  const coaching = useMemo(() => {
    if (stillTired.length > 0) {
      const names = joinFr(stillTired.slice(0, 3).map((s) => MUSCLE_INLINE[s.muscle]));
      const suggestion = joinFr(fresh.map((m) => MUSCLE_INLINE[m]));
      return {
        pill: 'RÉCUPÉRATION EN COURS',
        tone: 'warning' as const,
        text: `Tes ${names} récupèrent encore. Pour aujourd'hui, privilégie plutôt ${suggestion}.`,
      };
    }
    return {
      pill: "PRÊT À S'ENTRAÎNER",
      tone: 'success' as const,
      text: 'Tous tes groupes musculaires sont rétablis. C’est le moment idéal pour une grosse séance !',
    };
  }, [stillTired, fresh]);

  const legend: MuscleState[] = ['fatigued', 'worked', 'fresh', 'rested'];

  return (
    <Screen scroll>
      <Text variant="title">Récupération</Text>
      <Text variant="caption" color="textMuted">
        Quels muscles sont fatigués et lesquels sont prêts, d'après tes séances récentes.
      </Text>

      {isLoading ? (
        <Text variant="body" color="textMuted">
          Chargement…
        </Text>
      ) : ranked.length === 0 ? (
        <EmptyState
          icon="💪"
          title="Aucune séance récente"
          message="Enregistre une séance de musculation avec ses exercices pour voir tes muscles travaillés et au repos."
          actionLabel="Créer une séance"
          onAction={() => router.push('/workout/new')}
        />
      ) : (
        <>
          {/* État global — body map + legend */}
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text variant="heading">État global</Text>
              <Text variant="subtitle" color="accentData">
                {readiness}%
              </Text>
            </View>

            <View style={{ alignItems: 'center', marginTop: spacing[2] }}>
              <BodyMap colorFor={colorFor} />
            </View>

            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: spacing[3],
                justifyContent: 'center',
                marginTop: spacing[3],
              }}
            >
              {legend.map((state) => (
                <View
                  key={state}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[1] }}
                >
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: stateColor(state) }} />
                  <Text variant="caption" color="textMuted">
                    {STATE_LABEL[state]}
                  </Text>
                </View>
              ))}
            </View>
          </Card>

          {/* Groupes musculaires — name + coloured status */}
          <Card>
            <Text variant="heading">Groupes musculaires</Text>
            <View style={{ gap: spacing[3], marginTop: spacing[3] }}>
              {ranked.map((s) => (
                <View key={s.muscle} style={{ gap: spacing[1] }}>
                  <View
                    style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <Text variant="body">{MUSCLE_LABEL[s.muscle]}</Text>
                    <Text variant="subtitle" style={{ color: stateColor(s.state) }}>
                      {STATE_LABEL[s.state]}
                    </Text>
                  </View>
                  <Meter value={s.freshness} color={stateColor(s.state)} height={6} />
                </View>
              ))}
            </View>
          </Card>

          {/* Coaching */}
          <Card>
            <View style={{ alignItems: 'flex-start' }}>
              <Badge label={coaching.pill} tone={coaching.tone} />
            </View>
            <Text variant="body" style={{ marginTop: spacing[2] }}>
              {coaching.text}
            </Text>
            <View style={{ alignItems: 'flex-start', marginTop: spacing[3] }}>
              <Button label="Planifier une séance" onPress={() => router.push('/workout/new')} />
            </View>
          </Card>
        </>
      )}

      <View style={{ alignItems: 'flex-start' }}>
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
