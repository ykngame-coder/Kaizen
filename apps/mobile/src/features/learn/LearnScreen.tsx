import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Card, Screen, Text } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import type { Confidence, Pillar } from '@supotsu/core';
import {
  articlesByPillar,
  buildRecommendations,
  relevantArticles,
  type KnowledgeArticle,
} from '@supotsu/engines';
import { useActivities, useHealthMetrics, useWellnessCheckins } from '@/lib/data/queries';

const PILLAR_LABEL: Record<Pillar, string> = {
  sleep: 'Sommeil',
  recovery: 'Récupération',
  performance: 'Performance',
  nutrition: 'Nutrition',
  habits: 'Habitudes',
  understanding: 'Bien-être',
  decision: 'Vue d’ensemble',
};

const CONF_LABEL: Record<Confidence, { label: string; tone: 'success' | 'info' | 'warning' }> = {
  high: { label: 'Confiance élevée', tone: 'success' },
  medium: { label: 'Confiance moyenne', tone: 'info' },
  to_confirm: { label: 'À confirmer', tone: 'warning' },
};

/** Understanding pillar (Master Prompt P18): daily reco + knowledge library. */
export function LearnScreen(): React.JSX.Element {
  const router = useRouter();
  const { data: activities = [] } = useActivities();
  const { data: healthMetrics = [] } = useHealthMetrics();
  const { data: wellnessCheckins = [] } = useWellnessCheckins();
  const asOf = new Date().toISOString();

  const recs = useMemo(
    () => buildRecommendations({ activities, healthMetrics, wellnessCheckins, asOf }),
    [activities, healthMetrics, wellnessCheckins, asOf],
  );
  const top = recs[0];
  const forYou = useMemo(() => relevantArticles(recs.map((r) => r.articleId)), [recs]);
  const groups = useMemo(() => articlesByPillar(), []);

  const openArticle = (a: KnowledgeArticle): void => router.push(`/comprendre/${a.id}`);

  return (
    <Screen scroll>
      <Text variant="title">Comprendre</Text>
      <Text variant="caption" color="textMuted">
        Ce que tes chiffres veulent dire, et quoi en faire — sans jargon.
      </Text>

      {top && (
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="label" color="textMuted">
              RECOMMANDATION DU JOUR
            </Text>
            <Badge label={CONF_LABEL[top.confidence].label} tone={CONF_LABEL[top.confidence].tone} />
          </View>
          <Text variant="heading" style={{ marginTop: spacing[1] }}>
            {top.title}
          </Text>
          <Text variant="caption" color="textMuted">
            {top.explanation.observation}
          </Text>
          <Text variant="body" style={{ marginTop: spacing[1] }}>
            {top.explanation.action}
          </Text>
          {top.articleId && (
            <View style={{ alignItems: 'flex-start', marginTop: spacing[2] }}>
              <Button
                label="Comprendre pourquoi"
                variant="secondary"
                onPress={() => router.push(`/comprendre/${top.articleId}`)}
              />
            </View>
          )}
        </Card>
      )}

      {recs.length > 1 && (
        <Card>
          <Text variant="heading">Autres pistes</Text>
          <View style={{ gap: spacing[2], marginTop: spacing[1] }}>
            {recs.slice(1).map((r) => (
              <View key={r.title} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1, paddingRight: spacing[2] }}>
                  <Text variant="body">{r.title}</Text>
                  <Text variant="caption" color="textMuted" numberOfLines={1}>
                    {r.explanation.action}
                  </Text>
                </View>
                <Badge label={PILLAR_LABEL[r.pillar]} tone="info" />
              </View>
            ))}
          </View>
        </Card>
      )}

      {forYou.length > 0 && (
        <Card>
          <Text variant="heading">À lire pour toi</Text>
          <View style={{ gap: spacing[2], marginTop: spacing[1] }}>
            {forYou.map((a) => (
              <ArticleRow key={a.id} article={a} onPress={() => openArticle(a)} />
            ))}
          </View>
        </Card>
      )}

      <Text variant="heading" style={{ marginTop: spacing[2] }}>
        Bibliothèque
      </Text>
      {groups.map((g) => (
        <Card key={g.pillar}>
          <Text variant="label" color="textMuted">
            {PILLAR_LABEL[g.pillar].toUpperCase()}
          </Text>
          <View style={{ gap: spacing[2], marginTop: spacing[1] }}>
            {g.articles.map((a) => (
              <ArticleRow key={a.id} article={a} onPress={() => openArticle(a)} />
            ))}
          </View>
        </Card>
      ))}

      <Text variant="caption" color="textSubtle">
        Contenu éducatif général — ne remplace pas un avis médical.
      </Text>

      <View style={{ alignItems: 'flex-start' }}>
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

function ArticleRow({
  article,
  onPress,
}: {
  article: KnowledgeArticle;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <View style={{ flex: 1, paddingRight: spacing[2] }}>
        <Text variant="body">{article.title}</Text>
        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {article.summary}
        </Text>
      </View>
      <Button label={`${article.readMinutes} min`} variant="secondary" onPress={onPress} />
    </View>
  );
}
