import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Button, Card, Screen, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { useWorkouts } from '@/lib/data/queries';
import { formatDate } from '@/lib/format';

const NAV: { title: string; subtitle: string; path: Href }[] = [
  { title: 'Mes records', subtitle: '1RM, meilleurs temps, distances — importés de Garmin.', path: '/records' },
  { title: 'Carte musculaire', subtitle: 'Quels muscles sont fatigués et lesquels sont prêts.', path: '/muscles' },
  { title: "Charge d'entraînement", subtitle: 'Ton ratio charge aiguë / chronique.', path: '/load' },
  { title: 'Programmes de coachs', subtitle: 'Suis un programme structuré et recommandé.', path: '/marketplace' },
];

/** A tappable navigation row inside a card, with a chevron. */
function NavRow({ title, subtitle, onPress }: { title: string; subtitle: string; onPress: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1, paddingRight: spacing[2] }}>
            <Text variant="heading">{title}</Text>
            <Text variant="caption" color="textMuted">
              {subtitle}
            </Text>
          </View>
          <Text variant="subtitle" style={{ color: colors.textSubtle }}>
            ›
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}

/** Training home: workout history + entry point to log a session (P36, P20.3). */
export function TrainingScreen(): React.JSX.Element {
  const router = useRouter();
  const { data: workouts = [], isLoading } = useWorkouts();

  return (
    <Screen scroll>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="title">Entraînement</Text>
        <Button label="+ Séance" onPress={() => router.push('/workout/new')} />
      </View>

      {NAV.map((n) => (
        <NavRow key={n.title} title={n.title} subtitle={n.subtitle} onPress={() => router.push(n.path)} />
      ))}

      <Text variant="heading">Historique</Text>
      {isLoading ? (
        <Text variant="body" color="textMuted">
          Chargement…
        </Text>
      ) : workouts.length === 0 ? (
        <Card>
          <Text variant="body" color="textMuted">
            Aucune séance enregistrée. Crée ta première séance depuis la bibliothèque d'exercices.
          </Text>
        </Card>
      ) : (
        <View style={{ gap: spacing[2] }}>
          {workouts.map((w) => (
            <Card key={w.id}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Text variant="subtitle">{w.name}</Text>
                <Text variant="caption" color="textMuted">
                  {formatDate(w.completedAt ?? w.createdAt)}
                </Text>
              </View>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
