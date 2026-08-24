import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, Icon, Screen, Text, triggerHaptic, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { MuscleGroup } from '@supotsu/core';
import { stretchesForZone, type Stretch } from './stretchCatalog';
import { useTodayStretchRoutine } from './useStretchRoutine';

const PREP_SEC = 3;

interface Hold {
  stretch: Stretch;
  side?: 'gauche' | 'droite';
}

function flatten(stretches: Stretch[]): Hold[] {
  const out: Hold[] = [];
  for (const s of stretches) {
    if (s.sides) out.push({ stretch: s, side: 'gauche' }, { stretch: s, side: 'droite' });
    else out.push({ stretch: s });
  }
  return out;
}

/** Guided hold timer over a routine's stretches — "today" (fatigue-based) or one zone. */
export function StretchingSessionScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { mode, zone } = useLocalSearchParams<{ mode?: string; zone?: string }>();

  const today = useTodayStretchRoutine();
  const zoneStretches = useMemo(() => (zone ? stretchesForZone(zone as MuscleGroup) : []), [zone]);
  const stretches = mode === 'today' ? today.stretches : zoneStretches;
  const holds = useMemo(() => flatten(stretches), [stretches]);

  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<'prep' | 'hold'>('prep');
  const [secondsLeft, setSecondsLeft] = useState(PREP_SEC);
  const [done, setDone] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const clearTimers = (): void => {
    if (timer.current) clearTimeout(timer.current);
    if (tick.current) clearInterval(tick.current);
  };

  const run = (i: number, ph: 'prep' | 'hold'): void => {
    setIdx(i);
    setPhase(ph);
    triggerHaptic();
    const sec = ph === 'prep' ? PREP_SEC : holds[i]!.stretch.holdSec;
    setSecondsLeft(sec);
    tick.current = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    timer.current = setTimeout(() => {
      if (tick.current) clearInterval(tick.current);
      if (ph === 'prep') {
        run(i, 'hold');
        return;
      }
      if (i + 1 < holds.length) run(i + 1, 'prep');
      else {
        clearTimers();
        setDone(true);
      }
    }, sec * 1000);
  };

  useEffect(() => {
    if (holds.length === 0) return undefined;
    run(0, 'prep');
    return () => clearTimers();
    // Only (re)start when the routine itself changes.
  }, [holds.length]);

  const sideLabel: Record<'gauche' | 'droite', string> = {
    gauche: t('wellbeing.stretchingSession.sideLeft'),
    droite: t('wellbeing.stretchingSession.sideRight'),
  };

  if (holds.length === 0) {
    return (
      <Screen>
        <EmptyState icon={<Icon name="yoga" size={44} color={colors.textSubtle} />} title={t('wellbeing.stretchingSession.emptyTitle')} message={t('wellbeing.stretchingSession.emptyMessage')} actionLabel={t('common.back')} onAction={() => router.back()} />
      </Screen>
    );
  }

  if (done) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[4] }}>
          <Icon name="yoga" size={40} color={colors.primary} />
          <Text variant="heading">{t('wellbeing.stretchingSession.completedTitle')}</Text>
          <Text variant="caption" color="textMuted">{t('wellbeing.stretchingSession.completedCount', { count: holds.length })}</Text>
          <Button label={t('common.back')} onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  const current = holds[idx]!;

  return (
    <Screen>
      <Text variant="caption" color="textSubtle">{t('wellbeing.stretchingSession.progress', { current: idx + 1, total: holds.length })}</Text>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[6] }}>
        <View
          style={{
            width: 240,
            height: 240,
            borderRadius: radii.full,
            borderWidth: 3,
            borderColor: phase === 'hold' ? colors.primary : colors.textSubtle,
            backgroundColor: phase === 'hold' ? `${colors.primary}22` : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: spacing[4],
          }}
        >
          <Text variant="caption" color="textSubtle">{phase === 'prep' ? t('wellbeing.stretchingSession.prepare') : t('wellbeing.stretchingSession.hold')}</Text>
          <Text variant="heading" style={{ textAlign: 'center', marginTop: spacing[1] }}>
            {current.stretch.name}
            {current.side ? ` (${sideLabel[current.side]})` : ''}
          </Text>
          <Text variant="display" style={{ marginTop: spacing[2] }}>{secondsLeft}</Text>
        </View>
      </View>

      <View style={{ alignItems: 'flex-start' }}>
        <Button label={t('wellbeing.stretchingSession.stop')} variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
