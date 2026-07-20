import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, KPICard, Screen, Text } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { useActivities } from '@/lib/data/queries';
import { activityLabel, formatDate, formatDistance, formatDuration } from '@/lib/format';

/** Activities history + weekly stats (Master Prompt P3, MVP P20.3). */
export function ActivitiesScreen(): React.JSX.Element {
  const router = useRouter();
  const { data: activities = [], isLoading } = useActivities();

  const weekly = useMemo(() => {
    const weekAgo = Date.now() - 7 * 86_400_000;
    const recent = activities.filter((a) => new Date(a.startedAt).getTime() >= weekAgo);
    return {
      count: recent.length,
      durationSec: recent.reduce((s, a) => s + a.durationSec, 0),
      distanceM: recent.reduce((s, a) => s + (a.distanceM ?? 0), 0),
    };
  }, [activities]);

  return (
    <Screen scroll>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="title">Activités</Text>
        <Button label="+ Ajouter" onPress={() => router.push('/activity/new')} />
      </View>

      <View style={{ flexDirection: 'row', gap: spacing[4] }}>
        <View style={{ flex: 1 }}>
          <KPICard label="Cette semaine" value={String(weekly.count)} unit="act." />
        </View>
        <View style={{ flex: 1 }}>
          <KPICard label="Temps 7j" value={formatDuration(weekly.durationSec)} />
        </View>
      </View>

      {isLoading ? (
        <Text variant="body" color="textMuted">
          Chargement…
        </Text>
      ) : activities.length === 0 ? (
        <Card>
          <Text variant="heading">Aucune activité</Text>
          <Text variant="body" color="textMuted">
            Ajoute ta première activité pour commencer à suivre ta progression et calibrer ton score
            Supotsu.
          </Text>
        </Card>
      ) : (
        <View style={{ gap: spacing[2] }}>
          {activities.map((a) => {
            const distance = formatDistance(a.distanceM);
            return (
              <Card key={a.id}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text variant="subtitle">{activityLabel(a.type)}</Text>
                  <Text variant="caption" color="textMuted">
                    {formatDate(a.startedAt)}
                  </Text>
                </View>
                <Text variant="body" color="textMuted">
                  {formatDuration(a.durationSec)}
                  {distance ? ` · ${distance}` : ''}
                  {a.intensity ? ` · ${a.intensity}` : ''}
                </Text>
              </Card>
            );
          })}
        </View>
      )}
    </Screen>
  );
}
