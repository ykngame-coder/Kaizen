import React, { useEffect, useRef, useState } from 'react';
import { Animated, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Screen, SegmentedControl, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';

/**
 * Guided breathing (Neuro Recovery Suite, cahier §3.7 — relaxation, non
 * therapeutic). Several evidence-informed patterns; a circle expands on the
 * inhale and shrinks on the exhale so the user just follows it. Pure animation,
 * no audio dependency.
 */
interface Phase {
  label: string;
  sec: number;
  /** Circle scale target for this phase (inhale ⇒ big, exhale ⇒ small). */
  scale: number;
}
interface Pattern {
  key: string;
  label: string;
  caption: string;
  phases: Phase[];
}

const MIN_SCALE = 0.45;
const MAX_SCALE = 1;

const PATTERNS: Pattern[] = [
  {
    key: 'box',
    label: 'Carré',
    caption: 'Inspire 4 s · retiens 4 s · expire 4 s · retiens 4 s. Équilibrant.',
    phases: [
      { label: 'Inspire', sec: 4, scale: MAX_SCALE },
      { label: 'Retiens', sec: 4, scale: MAX_SCALE },
      { label: 'Expire', sec: 4, scale: MIN_SCALE },
      { label: 'Retiens', sec: 4, scale: MIN_SCALE },
    ],
  },
  {
    key: '478',
    label: '4-7-8',
    caption: 'Inspire 4 s · retiens 7 s · expire 8 s. Favorise l’endormissement.',
    phases: [
      { label: 'Inspire', sec: 4, scale: MAX_SCALE },
      { label: 'Retiens', sec: 7, scale: MAX_SCALE },
      { label: 'Expire', sec: 8, scale: MIN_SCALE },
    ],
  },
  {
    key: 'coherence',
    label: 'Cohérence',
    caption: 'Inspire 5 s · expire 5 s. Cohérence cardiaque (~6 respirations/min).',
    phases: [
      { label: 'Inspire', sec: 5, scale: MAX_SCALE },
      { label: 'Expire', sec: 5, scale: MIN_SCALE },
    ],
  },
];

export function BreathingScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const scale = useRef(new Animated.Value(MIN_SCALE)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [patternKey, setPatternKey] = useState<string>('coherence');
  const [running, setRunning] = useState(false);
  const [phaseIdx, setPhaseIdx] = useState(0);

  const pattern = PATTERNS.find((p) => p.key === patternKey) ?? PATTERNS[0]!;

  useEffect(() => {
    if (!running) return undefined;
    let i = 0;
    let cancelled = false;
    const step = (): void => {
      if (cancelled) return;
      const ph = pattern.phases[i % pattern.phases.length]!;
      setPhaseIdx(i % pattern.phases.length);
      Animated.timing(scale, {
        toValue: ph.scale,
        duration: ph.sec * 1000,
        useNativeDriver: true,
      }).start();
      timer.current = setTimeout(() => {
        i += 1;
        step();
      }, ph.sec * 1000);
    };
    step();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
    // Restart the cycle when the pattern changes while running.
  }, [running, patternKey, pattern, scale]);

  const toggle = (): void => {
    if (running) {
      setRunning(false);
      Animated.timing(scale, { toValue: MIN_SCALE, duration: 400, useNativeDriver: true }).start();
      setPhaseIdx(0);
    } else {
      setRunning(true);
    }
  };

  return (
    <Screen>
      <Text variant="title">Respiration guidée</Text>
      <Text variant="caption" color="textMuted">
        {pattern.caption}
      </Text>

      <View style={{ marginTop: spacing[2] }}>
        <SegmentedControl
          options={PATTERNS.map((p) => ({ value: p.key, label: p.label }))}
          value={patternKey}
          onChange={setPatternKey}
        />
      </View>

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
          <Text variant="heading">{running ? pattern.phases[phaseIdx]!.label : 'Prêt ?'}</Text>
        </View>

        <Button label={running ? 'Arrêter' : 'Commencer'} onPress={toggle} />
      </View>

      <View style={{ alignItems: 'flex-start' }}>
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
