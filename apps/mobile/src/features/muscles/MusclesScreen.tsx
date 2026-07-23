import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Card, EmptyState, Screen, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import type { MuscleGroup } from '@supotsu/core';
import {
  computeMuscleStates,
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

  const fresh = useMemo(() => suggestNextMuscles(statuses, 3), [statuses]);
  // Ordered for the readout: most fatigued first (what needs rest).
  const ranked = useMemo(
    () => [...statuses].filter((s) => s.lastTrainedDaysAgo !== null).sort((a, b) => a.freshness - b.freshness),
    [statuses],
  );

  const legend: { state: MuscleState }[] = [
    { state: 'fatigued' },
    { state: 'worked' },
    { state: 'fresh' },
    { state: 'rested' },
  ];

  return (
    <Screen scroll>
      <Text variant="title">Carte musculaire</Text>
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
            <View style={{ alignItems: 'center' }}>
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
              {legend.map(({ state }) => (
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
            <View style={{ gap: spacing[2], marginTop: spacing[1] }}>
              {ranked.map((s) => (
                <View
                  key={s.muscle}
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
