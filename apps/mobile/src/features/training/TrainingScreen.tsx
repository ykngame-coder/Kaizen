import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, Screen, Text } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { useWorkouts } from '@/lib/data/queries';
import { formatDate } from '@/lib/format';

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

      <Card>
        <Text variant="heading">Programmes de coachs</Text>
        <Text variant="body" color="textMuted">
          Suis un programme structuré, recommandé selon ce que tu pratiques.
        </Text>
        <View style={{ alignItems: 'flex-start' }}>
          <Button label="Explorer le marketplace" onPress={() => router.push('/marketplace')} />
        </View>
      </Card>

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
