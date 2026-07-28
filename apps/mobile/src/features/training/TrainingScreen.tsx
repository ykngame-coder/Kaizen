import React from 'react';
import { View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Button, Card, Screen, Text } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { useWorkouts } from '@/lib/data/queries';
import { formatDate } from '@/lib/format';
import { HubRow } from '@/features/navigation/HubRow';

const NAV: { title: string; subtitle: string; icon: string; path?: Href; soon?: boolean }[] = [
  { title: 'Calendrier', subtitle: 'Tes séances et événements', icon: '🗓', path: '/calendar' },
  { title: 'Programmes', subtitle: 'Programmes structurés et recommandés', icon: '📋', path: '/marketplace' },
  { title: 'Récupération musculaire', subtitle: 'Muscles fatigués vs prêts à travailler', icon: '💪', path: '/muscles' },
  { title: 'Records', subtitle: '1RM, meilleurs temps, distances', icon: '🏆', path: '/records' },
  { title: 'Exercices', subtitle: 'Bibliothèque, tutoriels, recherche', icon: '📚', soon: true },
  { title: 'Progression musculaire', subtitle: 'Volume et charge par groupe', icon: '📈', soon: true },
];

/** Entraînements hub (architecture: Application → Entraînements). */
export function TrainingScreen(): React.JSX.Element {
  const router = useRouter();
  const { data: workouts = [], isLoading } = useWorkouts();

  return (
    <Screen scroll>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="title">Entraînements</Text>
        <Button label="+ Séance" onPress={() => router.push('/workout/new')} />
      </View>

      <View style={{ gap: spacing[2] }}>
        {NAV.map((n) => (
          <HubRow
            key={n.title}
            title={n.title}
            subtitle={n.subtitle}
            icon={n.icon}
            soon={n.soon}
            onPress={n.path ? () => router.push(n.path!) : undefined}
          />
        ))}
      </View>

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
