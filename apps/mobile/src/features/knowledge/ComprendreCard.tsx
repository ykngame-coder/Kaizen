import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import type { Pillar } from '@supotsu/core';
import { articlesByPillar } from '@supotsu/engines';

/**
 * "Comprendre" contextualisé par pilier — pas d'écran de gestion propre par
 * hub, juste un filtre sur la bibliothèque partagée (`articlesByPillar`),
 * shared across the Sport/Sommeil/Nutrition mini-accueils (design spec
 * "Comprendre & Objectifs éclatés par pilier").
 */
export function ComprendreCard({ pillars, max = 2 }: { pillars: Pillar[]; max?: number }): React.JSX.Element | null {
  const router = useRouter();
  const { colors } = useTheme();
  const articles = useMemo(
    () => articlesByPillar().filter((g) => pillars.includes(g.pillar)).flatMap((g) => g.articles).slice(0, max),
    [pillars, max],
  );
  if (articles.length === 0) return null;

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: spacing[2] }}>
        <Text variant="heading">Comprendre</Text>
        <Pressable onPress={() => router.push('/comprendre')}>
          <Text variant="caption" color="primary">Tout voir ›</Text>
        </Pressable>
      </View>
      <View style={{ gap: spacing[2] }}>
        {articles.map((a) => (
          <Pressable
            key={a.id}
            onPress={() => router.push(`/comprendre/${a.id}`)}
            style={({ pressed }) => ({
              opacity: pressed ? 0.6 : 1,
              borderRadius: 12,
              padding: spacing[3],
              backgroundColor: colors.surfaceElevated,
            })}
          >
            <Text variant="body" style={{ fontWeight: '600' }}>{a.title}</Text>
            <Text variant="caption" color="textSubtle" style={{ marginTop: 2 }}>{a.summary}</Text>
          </Pressable>
        ))}
      </View>
    </Card>
  );
}
