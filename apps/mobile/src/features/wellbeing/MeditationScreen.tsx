import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Card, Screen, Text } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { MEDITATION_CATALOG, MEDITATION_CATEGORIES } from './meditationCatalog';

function fmtDuration(sec: number): string {
  const m = Math.round(sec / 60);
  return `${m} min`;
}

/** Méditation guidée — catalogue par catégorie (Neuro Recovery Suite). */
export function MeditationScreen(): React.JSX.Element {
  const router = useRouter();

  return (
    <Screen scroll>
      <Text variant="title">Méditation guidée</Text>
      <Text variant="caption" color="textMuted">
        Séances audio narrées, par thème.
      </Text>

      {MEDITATION_CATEGORIES.map((cat) => {
        const sessions = MEDITATION_CATALOG.filter((s) => s.category === cat.key);
        return (
          <View key={cat.key} style={{ marginTop: spacing[4] }}>
            <Text variant="heading">{cat.icon} {cat.label}</Text>
            <View style={{ gap: spacing[2], marginTop: spacing[2] }}>
              {sessions.map((s) => {
                const card = (
                  <Card style={{ opacity: s.available ? 1 : 0.6 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text variant="body" style={{ fontWeight: '600' }}>{s.title}</Text>
                      {s.available ? (
                        <Text variant="caption" color="textSubtle">{fmtDuration(s.durationSec)}</Text>
                      ) : (
                        <Badge label="Bientôt disponible" tone="neutral" />
                      )}
                    </View>
                  </Card>
                );
                if (!s.available) return <View key={s.id}>{card}</View>;
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => router.push({ pathname: '/sommeil/meditation/[id]', params: { id: s.id } })}
                    style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                  >
                    {card}
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}

      <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[4] }}>
        Ces séances sont fournies par l'équipe Kaizen Supotsu — pas de conseil médical, un simple temps pour toi.
      </Text>
    </Screen>
  );
}
