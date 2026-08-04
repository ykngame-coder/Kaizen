import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, Meter, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import type { GoalType } from '@supotsu/core';
import { useGoals } from '@/lib/data/queries';

/**
 * Objectifs contextualisés par pilier — filtre la liste partagée (`useGoals`)
 * par type plutôt que de dupliquer l'UI de gestion de `/profile/goals`,
 * shared across the Sport/Sommeil/Nutrition mini-accueils (design spec
 * "Comprendre & Objectifs éclatés par pilier").
 */
export function ObjectifsCard({ types, max = 2 }: { types: GoalType[]; max?: number }): React.JSX.Element | null {
  const router = useRouter();
  const { colors } = useTheme();
  const { data: goals = [] } = useGoals();
  const filtered = useMemo(
    () => goals.filter((g) => types.includes(g.type) && g.status === 'active').slice(0, max),
    [goals, types, max],
  );
  if (filtered.length === 0) return null;

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: spacing[2] }}>
        <Text variant="heading">Objectifs</Text>
        <Pressable onPress={() => router.push('/profile/goals')}>
          <Text variant="caption" color="primary">Tout voir ›</Text>
        </Pressable>
      </View>
      <View style={{ gap: spacing[3] }}>
        {filtered.map((g) => (
          <View key={g.id} style={{ gap: spacing[1] }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="body">{g.title}</Text>
              <Text variant="caption" color="textMuted">{Math.round(g.progress * 100)}%</Text>
            </View>
            <Meter value={g.progress * 100} color={colors.primary} height={6} />
          </View>
        ))}
      </View>
    </Card>
  );
}
