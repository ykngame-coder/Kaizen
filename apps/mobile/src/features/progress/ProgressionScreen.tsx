import React from 'react';
import { View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Screen, Text } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { HubRow } from '@/features/navigation/HubRow';

interface Section {
  title: string;
  subtitle: string;
  icon: string;
  path?: Href;
  soon?: boolean;
}

/** Progression hub (architecture: Application → Progression). */
export function ProgressionScreen(): React.JSX.Element {
  const router = useRouter();

  const sections: Section[] = [
    { title: 'Statistiques', subtitle: 'Vue d’ensemble sur la période', icon: '📊', path: '/analytics' },
    { title: 'Tendances & corrélations', subtitle: 'Ce qui influence ta forme (IA)', icon: '📈', path: '/analytics' },
    { title: 'Objectifs', subtitle: 'Cibles mesurables et progression', icon: '🎯', path: '/goals' },
    { title: 'Records', subtitle: '1RM, meilleurs temps, distances', icon: '🏆', path: '/records' },
    { title: 'Badges', subtitle: 'Récompenses gagnées sur tes données', icon: '🏅', path: '/' },
    { title: 'Comparaisons', subtitle: 'Périodes et références', icon: '⚖', soon: true },
    { title: 'Photos d’évolution', subtitle: 'Avant / après dans le temps', icon: '📷', soon: true },
    { title: 'Rapports PDF', subtitle: 'Bilan hebdo/mensuel exportable', icon: '📄', soon: true },
  ];

  return (
    <Screen scroll>
      <Text variant="title">Progression</Text>
      <Text variant="caption" color="textMuted">
        Tes tendances, tes records et tes objectifs dans le temps.
      </Text>
      <View style={{ gap: spacing[2], marginTop: spacing[2] }}>
        {sections.map((s) => (
          <HubRow
            key={s.title}
            title={s.title}
            subtitle={s.subtitle}
            icon={s.icon}
            soon={s.soon}
            onPress={s.path ? () => router.push(s.path!) : undefined}
          />
        ))}
      </View>
    </Screen>
  );
}
