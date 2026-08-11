import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Card, Screen, Text } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { ZONE_LABEL, stretchesForZone } from './stretchCatalog';
import { useTodayStretchRoutine } from './useStretchRoutine';

const ZONES = Object.keys(ZONE_LABEL) as (keyof typeof ZONE_LABEL)[];

function totalSec(count: number, sides: number): number {
  return count * 30 + sides * 30; // matches the 30s hold used throughout the library
}

/** Étirements guidés — routine du jour (selon la fatigue musculaire) ou par zone (GOWOD/Pliability-style). */
export function StretchingScreen(): React.JSX.Element {
  const router = useRouter();
  const { stretches: todayStretches, muscles: todayMuscles, loading } = useTodayStretchRoutine();

  const todaySides = todayStretches.filter((s) => s.sides).length;
  const todayDuration = totalSec(todayStretches.length, todaySides);

  return (
    <Screen scroll>
      <Text variant="title">Étirements</Text>
      <Text variant="caption" color="textMuted">
        Routine guidée, tenue chronométrée — comme GOWOD/Pliability.
      </Text>

      <Text variant="heading" style={{ marginTop: spacing[3] }}>Routine du jour</Text>
      {loading ? (
        <Text variant="body" color="textMuted">Chargement…</Text>
      ) : todayStretches.length === 0 ? (
        <Card>
          <Text variant="body" color="textMuted">
            Pas encore de séance récente pour te proposer une routine ciblée — choisis une zone ci-dessous.
          </Text>
        </Card>
      ) : (
        <Card>
          <Text variant="body" style={{ fontWeight: '600' }}>
            {todayMuscles.map((m) => ZONE_LABEL[m]).join(', ')}
          </Text>
          <Text variant="caption" color="textMuted">
            {todayStretches.length} étirements · ≈ {Math.round(todayDuration / 60)} min
          </Text>
          <View style={{ alignItems: 'flex-start', marginTop: spacing[1] }}>
            <Button label="Commencer" onPress={() => router.push({ pathname: '/sport/stretching/session', params: { mode: 'today' } })} />
          </View>
        </Card>
      )}

      <Text variant="heading" style={{ marginTop: spacing[4] }}>Par zone</Text>
      <View style={{ gap: spacing[2] }}>
        {ZONES.map((zone) => {
          const zoneStretches = stretchesForZone(zone);
          if (zoneStretches.length === 0) return null;
          return (
            <Pressable
              key={zone}
              onPress={() => router.push({ pathname: '/sport/stretching/session', params: { zone } })}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Card>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text variant="body" style={{ fontWeight: '600' }}>{ZONE_LABEL[zone]}</Text>
                  <Badge label={`${zoneStretches.length} étirements`} tone="neutral" />
                </View>
              </Card>
            </Pressable>
          );
        })}
      </View>

      <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[4] }}>
        Étirements en douceur, jamais jusqu'à la douleur. En cas de blessure, consulte un professionnel avant de reprendre.
      </Text>
    </Screen>
  );
}
