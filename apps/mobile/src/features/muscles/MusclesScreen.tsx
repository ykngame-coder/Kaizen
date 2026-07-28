import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Card, EmptyState, Meter, ProgressRing, Screen, Text, useTheme } from '@supotsu/ui';
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

/** How to describe each recovery state, in plain French. */
const STATE_LABEL: Record<MuscleState, string> = {
  rested: 'Reposé',
  fresh: 'Frais',
  worked: 'Travaillé',
  fatigued: 'Fatigué',
};

const STATE_TONE: Record<MuscleState, 'success' | 'info' | 'warning' | 'error'> = {
  rested: 'info',
  fresh: 'success',
  worked: 'warning',
  fatigued: 'error',
};

/** Join French labels: "a, b et c". */
function joinFr(labels: string[]): string {
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(', ')} et ${labels[labels.length - 1]}`;
}

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

  // Recovery colour scale: fatigued → red, worked → amber, fresh → green,
  // rested/untargeted → neutral surface. Mirrors Fitbod/Garmin body maps.
  const colorForState = (state: MuscleState): string => {
    switch (state) {
      case 'fatigued':
        return colors.error;
      case 'worked':
        return colors.warning;
      case 'fresh':
        return colors.success;
      case 'rested':
      default:
        return colors.surfaceElevated;
    }
  };

  const colorFor = (muscle: MuscleGroup): string => {
    const status = byMuscle.get(muscle);
    // Never trained in the window → neutral (rested).
    if (!status || status.lastTrainedDaysAgo === null) return colors.surfaceElevated;
    return colorForState(status.state);
  };

  const readiness = useMemo(() => overallReadiness(statuses), [statuses]);
  const readinessZones = [
    { color: colors.error, weight: 50 },
    { color: colors.warning, weight: 25 },
    { color: colors.success, weight: 25 },
  ];

  const fresh = useMemo(() => suggestNextMuscles(statuses, 3), [statuses]);
  // Ordered for the readout: most fatigued first (what needs rest).
  const ranked = useMemo(
    () => [...statuses].filter((s) => s.lastTrainedDaysAgo !== null).sort((a, b) => a.freshness - b.freshness),
    [statuses],
  );

  // Coaching block (Bevel "Zone de récupération" style): a status pill + a
  // sentence naming the muscles that recovered or still need rest.
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
      <Text variant="title">Zone de récupération</Text>
      <Text variant="caption" color="textMuted">
        Quels muscles sont fatigués et lesquels sont prêts à travailler, d'après tes séances
        des derniers jours.
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
          <Card>
            <View style={{ alignItems: 'center', gap: spacing[1] }}>
              <ProgressRing
                value={readiness}
                segments={readinessZones}
                caption="prêt"
                size={116}
              />
              <Text variant="caption" color="textMuted">
                Récupération globale
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
                marginTop: spacing[2],
              }}
            >
              {legend.map((state) => (
                <View
                  key={state}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[1] }}
                >
                  <View
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 6,
                      backgroundColor: colorForState(state),
                      borderWidth: state === 'rested' ? 1 : 0,
                      borderColor: colors.border,
                    }}
                  />
                  <Text variant="caption" color="textMuted">
                    {STATE_LABEL[state]}
                  </Text>
                </View>
              ))}
            </View>
          </Card>

          <Card>
            <View style={{ alignItems: 'flex-start' }}>
              <Badge label={coaching.pill} tone={coaching.tone} />
            </View>
            <Text variant="body" style={{ marginTop: spacing[2] }}>
              {coaching.text}
            </Text>
          </Card>

          {fresh.length > 0 && (
            <Card>
              <Text variant="heading">Muscles frais à travailler</Text>
              <Text variant="body" color="textMuted">
                Ces groupes sont les plus reposés — de bons candidats pour ta prochaine séance.
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[1] }}>
                {fresh.map((m) => (
                  <Badge key={m} label={MUSCLE_LABEL[m]} tone="success" />
                ))}
              </View>
            </Card>
          )}

          <Card>
            <Text variant="heading">Détail par muscle</Text>
            <View style={{ gap: spacing[3], marginTop: spacing[2] }}>
              {ranked.map((s) => (
                <View key={s.muscle} style={{ gap: spacing[1] }}>
                  <View
                    style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <View style={{ flex: 1, paddingRight: spacing[2] }}>
                      <Text variant="body">{MUSCLE_LABEL[s.muscle]}</Text>
                      <Text variant="caption" color="textMuted">
                        {s.lastTrainedDaysAgo === 0
                          ? "Travaillé aujourd'hui"
                          : s.lastTrainedDaysAgo === 1
                            ? 'Travaillé hier'
                            : `Travaillé il y a ${s.lastTrainedDaysAgo} jours`}
                      </Text>
                    </View>
                    <Badge label={`${STATE_LABEL[s.state]} · ${s.freshness}%`} tone={STATE_TONE[s.state]} />
                  </View>
                  <Meter value={s.freshness} color={colorForState(s.state)} height={6} />
                </View>
              ))}
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
