import React, { useEffect, useRef, useState } from 'react';
import { Animated, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, Screen, SegmentedControl, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';

/**
 * Visual bilateral stimulation (Neuro Recovery Suite, cahier §3.7). A target
 * sweeps left↔right; the user follows it with their eyes to help wind down.
 *
 * IMPORTANT (compliance, cahier §3.7/§4.2): this is a relaxation tool, NOT EMDR
 * therapy. The distinction is shown before use and never presented as
 * therapeutic. Purely visual — no audio dependency, no assets.
 */
const DOT_SIZE = 32;
const H_PADDING = spacing[6];

const SPEEDS = [
  { value: 'slow', label: 'Lent', sweepMs: 2200 },
  { value: 'medium', label: 'Moyen', sweepMs: 1400 },
  { value: 'fast', label: 'Rapide', sweepMs: 900 },
] as const;

export function BilateralScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const pos = useRef(new Animated.Value(0)).current;
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState<string>('slow');

  const sweepMs = SPEEDS.find((s) => s.value === speed)?.sweepMs ?? 1400;
  const travel = Math.max(120, width - H_PADDING * 2 - DOT_SIZE);

  useEffect(() => {
    if (!running) {
      pos.stopAnimation();
      Animated.timing(pos, { toValue: 0.5, duration: 300, useNativeDriver: true }).start();
      return undefined;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pos, { toValue: 1, duration: sweepMs, useNativeDriver: true }),
        Animated.timing(pos, { toValue: 0, duration: sweepMs, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [running, sweepMs, pos]);

  const translateX = pos.interpolate({ inputRange: [0, 1], outputRange: [0, travel] });

  return (
    <Screen scroll>
      <Text variant="title">Stimulation bilatérale</Text>
      <Text variant="caption" color="textMuted">
        Suis le point des yeux, tête immobile, en respirant lentement. Un outil de détente avant le
        sommeil.
      </Text>

      <Card>
        <Text variant="label" color="warning">
          ⚠️ CE N’EST PAS UNE THÉRAPIE EMDR
        </Text>
        <Text variant="caption" color="textMuted" style={{ marginTop: spacing[1] }}>
          L’EMDR est une psychothérapie pratiquée par un professionnel de santé formé. La
          stimulation bilatérale ci-dessous est un simple outil de relaxation, sans visée
          thérapeutique. En cas de difficulté psychologique, consulte un professionnel.
        </Text>
      </Card>

      <View style={{ marginTop: spacing[2] }}>
        <SegmentedControl
          options={SPEEDS.map((s) => ({ value: s.value, label: s.label }))}
          value={speed}
          onChange={setSpeed}
        />
      </View>

      <View
        style={{
          height: 140,
          justifyContent: 'center',
          marginVertical: spacing[6],
          paddingHorizontal: H_PADDING,
        }}
      >
        <View style={{ height: 2, backgroundColor: colors.border, borderRadius: 1 }} />
        <Animated.View
          style={{
            position: 'absolute',
            left: H_PADDING,
            width: DOT_SIZE,
            height: DOT_SIZE,
            borderRadius: DOT_SIZE / 2,
            backgroundColor: colors.primary,
            transform: [{ translateX }],
          }}
        />
      </View>

      <View style={{ alignItems: 'center' }}>
        <Button
          label={running ? 'Arrêter' : 'Commencer'}
          onPress={() => setRunning((r) => !r)}
        />
      </View>

      <View style={{ alignItems: 'flex-start', marginTop: spacing[4] }}>
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
