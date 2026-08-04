import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { useHealthMetrics } from '@/lib/data/queries';

const DAY_MS = 86_400_000;

/** Weight widget: latest value, weekly delta, and a mini weekly bar chart. */
export function WeightWidget(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { data: health = [] } = useHealthMetrics();

  const { latest, delta, bars } = useMemo(() => {
    const sorted = health
      .filter((m) => m.type === 'weight')
      .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
    const last = sorted[sorted.length - 1];
    if (!last) return { latest: undefined, delta: undefined, bars: [] as number[] };
    const weekStart = new Date(last.measuredAt).getTime() - 7 * DAY_MS;
    const inWeek = sorted.filter((m) => new Date(m.measuredAt).getTime() >= weekStart);
    const first = inWeek[0];
    const d = first && first !== last ? last.value - first.value : undefined;
    return {
      latest: last.value,
      delta: d,
      bars: sorted.slice(-7).map((m) => m.value),
    };
  }, [health]);

  const min = bars.length > 0 ? Math.min(...bars) : 0;
  const max = bars.length > 0 ? Math.max(...bars) : 1;
  const span = max - min || 1;

  return (
    <Pressable onPress={() => router.push('/profile/analytics')} style={{ flex: 1 }}>
      <Card>
        {latest === undefined ? (
          <View style={{ gap: spacing[1] }}>
            <Text variant="heading">Poids</Text>
            <Text variant="caption" color="textMuted">
              Pas encore de pesée. Connecte une balance ou importe tes données.
            </Text>
          </View>
        ) : (
          <>
            <Text variant="data">{latest.toFixed(1)} kg</Text>
            {delta !== undefined && (
              <Text variant="caption" color={delta <= 0 ? 'success' : 'textMuted'}>
                {delta > 0 ? '+' : ''}
                {delta.toFixed(1)} kg cette semaine
              </Text>
            )}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-end',
                gap: spacing[1],
                height: 40,
                marginTop: spacing[2],
              }}
            >
              {bars.map((v, i) => {
                const h = 10 + ((v - min) / span) * 28;
                const recent = i >= bars.length - 2;
                return (
                  <View
                    key={i}
                    style={{
                      flex: 1,
                      height: h,
                      borderRadius: 3,
                      backgroundColor: recent ? colors.accentLime : colors.surfaceElevated,
                    }}
                  />
                );
              })}
            </View>
          </>
        )}
      </Card>
    </Pressable>
  );
}
