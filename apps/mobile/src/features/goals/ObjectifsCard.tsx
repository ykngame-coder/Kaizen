import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Card, Meter, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import type { GoalType } from '@supotsu/core';
import { resolvedGoalProgress, weightTrend } from '@supotsu/engines';
import { useGoals, useHealthMetrics } from '@/lib/data/queries';

/** Assez large pour retrouver le poids qu'on avait en créant un vieil objectif. */
const WEIGHT_HISTORY_DAYS = 3650;

/**
 * Objectifs contextualisés par pilier — filtre la liste partagée (`useGoals`)
 * par type plutôt que de dupliquer l'UI de gestion de `/profile/habits`,
 * shared across the Sport/Sommeil/Nutrition mini-accueils (design spec
 * "Comprendre & Objectifs éclatés par pilier").
 */
export function ObjectifsCard({ types, max = 2 }: { types: GoalType[]; max?: number }): React.JSX.Element | null {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { data: goals = [] } = useGoals();
  const { data: metrics = [] } = useHealthMetrics();
  // La progression enregistrée reste à zéro pour un objectif sans point de
  // départ : on la recalcule sur les pesées réelles, comme l'écran Objectifs.
  const weights = useMemo(() => weightTrend(metrics, new Date().toISOString(), WEIGHT_HISTORY_DAYS), [metrics]);
  const filtered = useMemo(
    () => goals.filter((g) => types.includes(g.type) && g.status === 'active').slice(0, max),
    [goals, types, max],
  );
  if (filtered.length === 0) return null;

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: spacing[2] }}>
        <Text variant="heading">{t('sport.goals.objectifsCard.heading')}</Text>
        <Pressable onPress={() => router.push('/profile/habits')}>
          <Text variant="caption" color="primary">{t('sport.goals.objectifsCard.seeAll')}</Text>
        </Pressable>
      </View>
      <View style={{ gap: spacing[3] }}>
        {filtered.map((g) => {
          const pct = Math.round(resolvedGoalProgress(g, weights) * 100);
          return (
            <View key={g.id} style={{ gap: spacing[1] }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="body">{g.title}</Text>
                <Text variant="caption" color="textMuted">{pct}%</Text>
              </View>
              <Meter value={pct} color={colors.primary} height={6} />
            </View>
          );
        })}
      </View>
    </Card>
  );
}
