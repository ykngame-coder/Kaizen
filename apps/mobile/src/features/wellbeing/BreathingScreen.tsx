import React, { useEffect, useRef, useState } from 'react';
import { Animated, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Screen, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';

/** Box breathing 4-4-4-4 (Master Prompt P14 respiration). */
const PHASES = [
  { label: 'Inspire', scale: 1 },
  { label: 'Retiens', scale: 1 },
  { label: 'Expire', scale: 0.45 },
  { label: 'Retiens', scale: 0.45 },
] as const;
const PHASE_MS = 4000;
const MIN_SCALE = 0.45;

export function BreathingScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const scale = useRef(new Animated.Value(MIN_SCALE)).current;
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!running) return undefined;
    let i = 0;
    const advance = (): void => {
      const target = PHASES[i % PHASES.length];
      setPhase(i % PHASES.length);
      Animated.timing(scale, {
        toValue: target.scale,
        duration: PHASE_MS,
        useNativeDriver: true,
      }).start();
      i += 1;
    };
    advance();
    const id = setInterval(advance, PHASE_MS);
    return () => clearInterval(id);
  }, [running, phase, scale]);

  const toggle = (): void => {
    if (running) {
      setRunning(false);
      Animated.timing(scale, { toValue: MIN_SCALE, duration: 400, useNativeDriver: true }).start();
      setPhase(0);
    } else {
      setRunning(true);
    }
  };

  return (
    <Screen>
      <Text variant="title">Respiration en carré</Text>
      <Text variant="caption" color="textMuted">
        Inspire 4 s · retiens 4 s · expire 4 s · retiens 4 s. Suis le cercle.
      </Text>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[6] }}>
        <View style={{ width: 240, height: 240, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View
            style={{
              width: 200,
              height: 200,
              borderRadius: 100,
              backgroundColor: colors.primary,
              opacity: 0.18,
              transform: [{ scale }],
              position: 'absolute',
            }}
          />
          <Animated.View
            style={{
              width: 200,
              height: 200,
              borderRadius: 100,
              borderWidth: 2,
              borderColor: colors.primary,
              transform: [{ scale }],
              position: 'absolute',
            }}
          />
          <Text variant="heading">{running ? PHASES[phase].label : 'Prêt ?'}</Text>
        </View>

        <Button label={running ? 'Arrêter' : 'Commencer'} onPress={toggle} />
      </View>

      <View style={{ alignItems: 'flex-start' }}>
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
