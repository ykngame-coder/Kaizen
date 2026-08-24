import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Card, Icon, Input, Screen, SegmentedControl, Text, triggerHaptic, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { useActivities, useAddActivity } from '@/lib/data/queries';

/**
 * Stomach vacuum (gainage transverse) — guided timer: expire à fond → rentre
 * le ventre → tiens → relâche, répété sur N séries avec repos entre chaque.
 * Completed sessions are logged as a regular Activity (type 'mobility') —
 * no new table, mirrors the "zero migration" pattern used for planned
 * sessions. Progression (record personnel) is derived from those past
 * activities rather than a dedicated records write path.
 */
const MIN_SETS = 1;
const MAX_SETS = 20;
const MIN_HOLD_SEC = 5;
const MAX_HOLD_SEC = 180;
const EXHALE_SEC = 4;
const VACUUM_SEC = 2;
const RELEASE_SEC = 2;
const REST_SEC = 15;
const NOTES_PREFIX = 'Stomach vacuum';

/** Clamps free-text numeric input to a sane range; null while invalid/empty. */
function parseClamped(text: string, min: number, max: number): number | null {
  const n = Math.floor(Number(text));
  if (!Number.isFinite(n) || text.trim() === '') return null;
  return Math.min(max, Math.max(min, n));
}

type PhaseKey = 'exhale' | 'vacuum' | 'hold' | 'release' | 'rest';
interface Phase {
  key: PhaseKey;
  label: string;
  sec: number;
  scale: number;
}

/** Parses "Stomach vacuum · N séries · tenue Ms" notes to recover the held duration. */
function parseHoldSec(notes: string | undefined): number | null {
  if (!notes?.startsWith(NOTES_PREFIX)) return null;
  const m = /tenue (\d+)s/.exec(notes);
  return m ? Number(m[1]) : null;
}

export function StomachVacuumScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { data: activities = [] } = useActivities();
  const addActivity = useAddActivity();

  const SETS_OPTIONS = [
    { value: '3', label: t('sport.stomachVacuum.sets.count', { n: 3 }) },
    { value: '5', label: t('sport.stomachVacuum.sets.count', { n: 5 }) },
    { value: '8', label: t('sport.stomachVacuum.sets.count', { n: 8 }) },
    { value: 'custom', label: t('sport.stomachVacuum.custom') },
  ];
  const HOLD_OPTIONS = [
    { value: '15', label: t('sport.stomachVacuum.hold.duration', { n: 15 }) },
    { value: '20', label: t('sport.stomachVacuum.hold.duration', { n: 20 }) },
    { value: '30', label: t('sport.stomachVacuum.hold.duration', { n: 30 }) },
    { value: 'custom', label: t('sport.stomachVacuum.custom') },
  ];

  const [setsChoice, setSetsChoice] = useState('3');
  const [holdChoice, setHoldChoice] = useState('20');
  const [customSets, setCustomSets] = useState('');
  const [customHold, setCustomHold] = useState('');
  const [screen, setScreen] = useState<'setup' | 'running' | 'done'>('setup');
  const [setIdx, setSetIdx] = useState(0);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [resting, setResting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const customSetsValue = parseClamped(customSets, MIN_SETS, MAX_SETS);
  const customHoldValue = parseClamped(customHold, MIN_HOLD_SEC, MAX_HOLD_SEC);
  const totalSets = setsChoice === 'custom' ? (customSetsValue ?? 0) : Number(setsChoice);
  const holdSec = holdChoice === 'custom' ? (customHoldValue ?? 0) : Number(holdChoice);
  const canStart = totalSets >= MIN_SETS && holdSec >= MIN_HOLD_SEC;
  const scale = useRef(new Animated.Value(1)).current;
  const startedAtRef = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  const phases: Phase[] = useMemo(
    () => [
      { key: 'exhale', label: t('sport.stomachVacuum.phase.exhale'), sec: EXHALE_SEC, scale: 1 },
      { key: 'vacuum', label: t('sport.stomachVacuum.phase.vacuum'), sec: VACUUM_SEC, scale: 0.55 },
      { key: 'hold', label: t('sport.stomachVacuum.phase.hold'), sec: holdSec, scale: 0.55 },
      { key: 'release', label: t('sport.stomachVacuum.phase.release'), sec: RELEASE_SEC, scale: 1 },
    ],
    [holdSec, t],
  );

  const personalBestSec = useMemo(
    () =>
      activities.reduce<number | null>((best, a) => {
        const v = parseHoldSec(a.notes);
        return v !== null && (best === null || v > best) ? v : best;
      }, null),
    [activities],
  );

  const clearTimers = (): void => {
    if (timer.current) clearTimeout(timer.current);
    if (tick.current) clearInterval(tick.current);
  };

  const finishSession = (): void => {
    clearTimers();
    setScreen('done');
    const totalSec =
      totalSets * (EXHALE_SEC + VACUUM_SEC + holdSec + RELEASE_SEC) + (totalSets - 1) * REST_SEC;
    void addActivity.mutateAsync({
      type: 'mobility',
      source: 'manual',
      startedAt: startedAtRef.current ?? new Date().toISOString(),
      durationSec: totalSec,
      notes: `${NOTES_PREFIX} · ${totalSets} séries · tenue ${holdSec}s`,
    });
  };

  const runPhase = (set: number, idx: number, rest: boolean): void => {
    setSetIdx(set);
    setPhaseIdx(idx);
    setResting(rest);
    triggerHaptic();

    const sec = rest ? REST_SEC : phases[idx]!.sec;
    setSecondsLeft(sec);
    tick.current = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);

    if (!rest) {
      Animated.timing(scale, { toValue: phases[idx]!.scale, duration: sec * 1000, useNativeDriver: true }).start();
    }

    timer.current = setTimeout(() => {
      if (tick.current) clearInterval(tick.current);
      if (rest) {
        runPhase(set, 0, false);
        return;
      }
      if (idx < phases.length - 1) {
        runPhase(set, idx + 1, false);
        return;
      }
      // Set complete.
      if (set + 1 < totalSets) {
        runPhase(set + 1, 0, true);
      } else {
        finishSession();
      }
    }, sec * 1000);
  };

  const start = (): void => {
    startedAtRef.current = new Date().toISOString();
    scale.setValue(1);
    setScreen('running');
    runPhase(0, 0, false);
  };

  const stop = (): void => {
    clearTimers();
    scale.setValue(1);
    setScreen('setup');
  };

  useEffect(() => () => clearTimers(), []);

  const currentPhase = phases[phaseIdx];

  return (
    <Screen>
      <Text variant="title">{t('sport.stomachVacuum.title')}</Text>
      <Text variant="caption" color="textMuted">
        {t('sport.stomachVacuum.subtitle')}
      </Text>

      {screen === 'setup' ? (
        <>
          <Card>
            <Text variant="caption" color="textMuted">
              {personalBestSec !== null
                ? t('sport.stomachVacuum.record', { sec: personalBestSec })
                : t('sport.stomachVacuum.noRecord')}
            </Text>
          </Card>

          <View style={{ marginTop: spacing[2] }}>
            <Text variant="body" style={{ fontWeight: '600', marginBottom: spacing[2] }}>{t('sport.stomachVacuum.setsLabel')}</Text>
            <SegmentedControl options={SETS_OPTIONS} value={setsChoice} onChange={setSetsChoice} />
            {setsChoice === 'custom' ? (
              <View style={{ marginTop: spacing[2] }}>
                <Input
                  keyboardType="numeric"
                  placeholder={t('sport.stomachVacuum.sets.placeholder', { min: MIN_SETS, max: MAX_SETS })}
                  value={customSets}
                  onChangeText={setCustomSets}
                />
              </View>
            ) : null}

            <Text variant="body" style={{ fontWeight: '600', marginTop: spacing[4], marginBottom: spacing[2] }}>{t('sport.stomachVacuum.holdLabel')}</Text>
            <SegmentedControl options={HOLD_OPTIONS} value={holdChoice} onChange={setHoldChoice} />
            {holdChoice === 'custom' ? (
              <View style={{ marginTop: spacing[2] }}>
                <Input
                  keyboardType="numeric"
                  placeholder={t('sport.stomachVacuum.hold.placeholder', { min: MIN_HOLD_SEC, max: MAX_HOLD_SEC })}
                  value={customHold}
                  onChangeText={setCustomHold}
                />
              </View>
            ) : null}
          </View>

          <View style={{ alignItems: 'center', marginTop: spacing[6] }}>
            <Button label={t('sport.stomachVacuum.start')} onPress={start} disabled={!canStart} />
          </View>
        </>
      ) : null}

      {screen === 'running' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[6] }}>
          <Text variant="caption" color="textSubtle">{t('sport.stomachVacuum.setCounter', { current: setIdx + 1, total: totalSets })}</Text>

          <View style={{ width: 220, height: 220, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View
              style={{
                width: 180,
                height: 180,
                borderRadius: 90,
                backgroundColor: colors.primary,
                opacity: 0.18,
                transform: [{ scale: resting ? 1 : scale }],
                position: 'absolute',
              }}
            />
            <Animated.View
              style={{
                width: 180,
                height: 180,
                borderRadius: 90,
                borderWidth: 2,
                borderColor: colors.primary,
                transform: [{ scale: resting ? 1 : scale }],
                position: 'absolute',
              }}
            />
            <View style={{ alignItems: 'center' }}>
              <Text variant="heading">{resting ? t('sport.stomachVacuum.resting') : currentPhase!.label}</Text>
              <Text variant="display" style={{ marginTop: spacing[1] }}>{secondsLeft}</Text>
            </View>
          </View>

          <Button label={t('sport.stomachVacuum.stop')} variant="secondary" onPress={stop} />
        </View>
      ) : null}

      {screen === 'done' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[4] }}>
          <Icon name="armFlex" size={40} color={colors.accentStrength} />
          <Text variant="heading">{t('sport.stomachVacuum.done.heading')}</Text>
          <Text variant="caption" color="textMuted" style={{ textAlign: 'center' }}>
            {t('sport.stomachVacuum.done.summary', { totalSets, holdSec })}
          </Text>
          <Button label={t('sport.stomachVacuum.done.restart')} onPress={() => setScreen('setup')} />
        </View>
      ) : null}

      <View style={{ alignItems: 'flex-start', marginTop: spacing[4] }}>
        <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
