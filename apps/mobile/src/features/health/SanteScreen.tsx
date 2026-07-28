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

/** Santé hub (architecture: Application → Santé). Groups every health signal. */
export function SanteScreen(): React.JSX.Element {
  const router = useRouter();

  const sections: Section[] = [
    { title: 'Sommeil', subtitle: 'Score, phases, coucher optimal', icon: '😴', path: '/sleep' },
    { title: 'Récupération', subtitle: 'VFC, FC repos, stress combinés', icon: '♥', path: '/analytics' },
    { title: "Charge d'entraînement", subtitle: 'Ratio aigu/chronique', icon: '⚡', path: '/load' },
    { title: 'Nutrition', subtitle: 'Calories, macros, journal, scanner', icon: '◍', path: '/nutrition' },
    { title: 'Habitudes', subtitle: 'Suivi quotidien et bien-être', icon: '✓', path: '/wellness' },
    { title: 'Respiration', subtitle: 'Cohérence cardiaque, 4-7-8', icon: '🌬', path: '/breathing' },
    { title: 'Corps', subtitle: 'Poids, masse grasse, IMC, mensurations', icon: '⚖', soon: true },
    { title: 'VO₂ Max', subtitle: 'Capacité cardio-respiratoire', icon: '🫁', soon: true },
    { title: 'HRV (VFC)', subtitle: 'Variabilité cardiaque détaillée', icon: '📈', soon: true },
    { title: 'Stress', subtitle: 'Niveau de stress sur la journée', icon: '🧠', soon: true },
    { title: 'Fréquence cardiaque', subtitle: 'FC repos et continue', icon: '💓', soon: true },
  ];

  return (
    <Screen scroll>
      <Text variant="title">Santé</Text>
      <Text variant="caption" color="textMuted">
        Tous tes signaux physiologiques, au même endroit.
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
