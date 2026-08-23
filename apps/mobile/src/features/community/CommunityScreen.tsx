import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, EmptyState, Icon, Screen, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { challengeExplanation, computeChallengeProgress } from '@supotsu/engines';
import type { Activity, Challenge } from '@supotsu/core';
import {
  useActivities,
  useChallengeLeaderboard,
  useChallenges,
  useJoinChallenge,
  useMyChallengeIds,
} from '@/lib/data/queries';

function ChallengeCard({
  challenge,
  joined,
  activities,
}: {
  challenge: Challenge;
  joined: boolean;
  activities: Activity[];
}): React.JSX.Element {
  const { t } = useTranslation();
  const join = useJoinChallenge();
  const { data: leaderboard = [] } = useChallengeLeaderboard(joined ? challenge : undefined);
  const asOf = new Date().toISOString();

  const progress = useMemo(
    () => computeChallengeProgress(challenge, activities),
    [challenge, activities],
  );
  const status = useMemo(
    () => challengeExplanation(challenge, progress, asOf),
    [challenge, progress, asOf],
  );
  const ranked = [...leaderboard].sort((a, b) => b.progress - a.progress).slice(0, 3);

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="subtitle">{challenge.title}</Text>
        <Badge
          label={challenge.metric === 'active_days' ? 'Jours actifs' : 'Activités'}
          tone="info"
        />
      </View>
      <Text variant="caption" color="textMuted">
        Objectif : {challenge.target} · {joined ? 'Tu participes' : 'Ouvert'}
      </Text>

      {joined ? (
        <>
          <Text variant="caption" color="textMuted">
            {status.explanation?.observation ? t(status.explanation.observation.key, status.explanation.observation.params) : ''}
          </Text>
          <Text variant="body">{status.explanation?.action ? t(status.explanation.action.key, status.explanation.action.params) : ''}</Text>
          {ranked.length > 0 ? (
            <View style={{ marginTop: spacing[2], gap: spacing[1] }}>
              <Text variant="label" color="textMuted">
                CLASSEMENT
              </Text>
              {ranked.map((s, i) => (
                <View key={s.userId} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="caption" color="textMuted">
                    {i + 1}. {s.userId.slice(0, 6)}…
                  </Text>
                  <Text variant="caption" color="textMuted">
                    {s.progress}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : (
        <View style={{ alignItems: 'flex-start', marginTop: spacing[1] }}>
          <Button
            label={join.isPending ? '…' : 'Rejoindre'}
            onPress={() => join.mutate(challenge.id)}
            disabled={join.isPending}
          />
        </View>
      )}
    </Card>
  );
}

/** Community: open challenges with explainable progress + leaderboard (P37). */
export function CommunityScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { data: challenges = [], isLoading } = useChallenges();
  const { data: myIds = [] } = useMyChallengeIds();
  const { data: activities = [] } = useActivities();
  const joinedSet = new Set(myIds);

  return (
    <Screen scroll>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="title">Communauté</Text>
        <Button label="+ Défi" onPress={() => router.push('/profile/challenge/new')} />
      </View>
      <Text variant="caption" style={{ color: colors.textMuted }}>
        Des défis simples et transparents : chaque classement se lit dans les faits.
      </Text>

      {isLoading ? (
        <Text variant="body" color="textMuted">
          Chargement…
        </Text>
      ) : challenges.length === 0 ? (
        <EmptyState
          icon={<Icon name="fire" size={44} color={colors.textSubtle} />}
          title="Aucun défi pour l'instant"
          message="Crée le premier défi et invite tes amis à te rejoindre."
          actionLabel="Créer un défi"
          onAction={() => router.push('/profile/challenge/new')}
        />
      ) : (
        <View style={{ gap: spacing[3] }}>
          {challenges.map((c) => (
            <ChallengeCard
              key={c.id}
              challenge={c}
              joined={joinedSet.has(c.id)}
              activities={activities}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}
