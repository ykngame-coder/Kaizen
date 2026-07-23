import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Badge, Button, EmptyState, Screen, Text } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import type { Pillar } from '@supotsu/core';
import { getArticle } from '@supotsu/engines';

const PILLAR_LABEL: Record<Pillar, string> = {
  sleep: 'Sommeil',
  recovery: 'Récupération',
  performance: 'Performance',
  nutrition: 'Nutrition',
  habits: 'Habitudes',
  understanding: 'Bien-être',
  decision: 'Vue d’ensemble',
};

/** A knowledge article (Master Prompt P18 — "Comprendre"). */
export function ArticleScreen(): React.JSX.Element {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const article = typeof id === 'string' ? getArticle(id) : undefined;

  if (!article) {
    return (
      <Screen scroll>
        <EmptyState icon="📄" title="Article introuvable" message="Ce contenu n’existe pas ou plus." />
        <View style={{ alignItems: 'flex-start' }}>
          <Button label="Retour" variant="secondary" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={{ flexDirection: 'row', gap: spacing[2], alignItems: 'center' }}>
        <Badge label={PILLAR_LABEL[article.pillar]} tone="info" />
        <Text variant="caption" color="textMuted">
          {article.readMinutes} min de lecture
        </Text>
      </View>
      <Text variant="title">{article.title}</Text>
      <Text variant="body" color="textMuted">
        {article.summary}
      </Text>

      <View style={{ gap: spacing[3], marginTop: spacing[2] }}>
        {article.body.map((paragraph, i) => (
          <Text key={i} variant="body">
            {paragraph}
          </Text>
        ))}
      </View>

      <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[2] }}>
        Contenu éducatif général — ne remplace pas un avis médical.
      </Text>

      <View style={{ alignItems: 'flex-start' }}>
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
