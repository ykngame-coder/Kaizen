import React, { useEffect, useRef, useState } from 'react';
import { Animated, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Screen, SegmentedControl, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';

/**
 * Guided breathing (Neuro Recovery Suite, cahier §3.7 — relaxation, non
 * therapeutic). Several evidence-informed patterns; a circle expands on the
 * inhale and shrinks on the exhale so the user just follows it. Pure animation,
 * no audio dependency.
 */
interface Phase {
  labelKey: string;
  sec: number;
  /** Circle scale target for this phase (inhale ⇒ big, exhale ⇒ small). */
  scale: number;
}
interface Pattern {
  key: string;
  labelKey: string;
  captionKey: string;
  phases: Phase[];
}

const MIN_SCALE = 0.45;
const MAX_SCALE = 1;

const PATTERNS: Pattern[] = [
  {
    key: 'box',
    labelKey: 'wellbeing.breathing.pattern.box.label',
    captionKey: 'wellbeing.breathing.pattern.box.caption',
    phases: [
      { labelKey: 'wellbeing.breathing.phase.inhale', sec: 4, scale: MAX_SCALE },
      { labelKey: 'wellbeing.breathing.phase.hold', sec: 4, scale: MAX_SCALE },
      { labelKey: 'wellbeing.breathing.phase.exhale', sec: 4, scale: MIN_SCALE },
      { labelKey: 'wellbeing.breathing.phase.hold', sec: 4, scale: MIN_SCALE },
    ],
  },
  {
    key: '478',
    labelKey: 'wellbeing.breathing.pattern.fourSevenEight.label',
    captionKey: 'wellbeing.breathing.pattern.fourSevenEight.caption',
    phases: [
      { labelKey: 'wellbeing.breathing.phase.inhale', sec: 4, scale: MAX_SCALE },
      { labelKey: 'wellbeing.breathing.phase.hold', sec: 7, scale: MAX_SCALE },
      { labelKey: 'wellbeing.breathing.phase.exhale', sec: 8, scale: MIN_SCALE },
    ],
  },
  {
    key: 'coherence',
    labelKey: 'wellbeing.breathing.pattern.coherence.label',
    captionKey: 'wellbeing.breathing.pattern.coherence.caption',
    phases: [
      { labelKey: 'wellbeing.breathing.phase.inhale', sec: 5, scale: MAX_SCALE },
      { labelKey: 'wellbeing.breathing.phase.exhale', sec: 5, scale: MIN_SCALE },
    ],
  },
];

export function BreathingScreen(): React.JSX.Element {
  const { t } = useTranslation();
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
      <Text variant="title">{t('wellbeing.breathing.title')}</Text>
      <Text variant="caption" color="textMuted">
        {t(pattern.captionKey)}
      </Text>

      <View style={{ marginTop: spacing[2] }}>
        <SegmentedControl
          options={PATTERNS.map((p) => ({ value: p.key, label: t(p.labelKey) }))}
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
          <Text variant="heading">
            {running ? t(pattern.phases[phaseIdx]!.labelKey) : t('wellbeing.breathing.ready')}
          </Text>
        </View>

        <Button
          label={running ? t('wellbeing.breathing.stop') : t('wellbeing.breathing.start')}
          onPress={toggle}
        />
      </View>

      <View style={{ alignItems: 'flex-start' }}>
        <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
