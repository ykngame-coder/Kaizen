import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Card, Icon, Input, Screen, SegmentedControl, Text, triggerHaptic, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';

/**
 * Generic work/rest interval timer — Tabata and HIIT are just presets on top
 * of the same engine (work seconds × rest seconds × rounds), plus a "Perso"
 * option since the three fields stay editable no matter which preset was
 * tapped. Pure utility tool, nothing is logged (Master Prompt: only log what
 * the user asked to track).
 */
const PRESETS = [
  { value: 'tabata', labelKey: 'sport.intervalTimer.presets.tabata', work: 20, rest: 10, rounds: 8 },
  { value: 'hiit', labelKey: 'sport.intervalTimer.presets.hiit', work: 30, rest: 15, rounds: 10 },
  { value: 'emom', labelKey: 'sport.intervalTimer.presets.emom', work: 40, rest: 20, rounds: 10 },
  { value: 'custom', labelKey: 'sport.intervalTimer.presets.custom', work: 30, rest: 30, rounds: 8 },
] as const;

const MIN_SEC = 1;
const MAX_SEC = 600;
const MIN_ROUNDS = 1;
const MAX_ROUNDS = 50;
const PREP_SEC = 5;

type PhaseKey = 'prep' | 'work' | 'rest';

function parseClamped(text: string, min: number, max: number): number | null {
  const n = Math.floor(Number(text));
  if (!Number.isFinite(n) || text.trim() === '') return null;
  return Math.min(max, Math.max(min, n));
}

export function IntervalTimerScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();

  const PRESET_OPTIONS = PRESETS.map((p) => ({ value: p.value, label: t(p.labelKey) }));

  const [preset, setPreset] = useState<string>('tabata');
  const [workText, setWorkText] = useState('20');
  const [restText, setRestText] = useState('10');
  const [roundsText, setRoundsText] = useState('8');
  const [screen, setScreen] = useState<'setup' | 'running' | 'done'>('setup');
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<PhaseKey>('prep');
  const [secondsLeft, setSecondsLeft] = useState(0);

  const work = parseClamped(workText, MIN_SEC, MAX_SEC);
  const rest = parseClamped(restText, MIN_SEC, MAX_SEC);
  const rounds = parseClamped(roundsText, MIN_ROUNDS, MAX_ROUNDS);
  const canStart = work !== null && rest !== null && rounds !== null;

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  const applyPreset = (value: string): void => {
    setPreset(value);
    const p = PRESETS.find((x) => x.value === value);
    if (p) {
      setWorkText(String(p.work));
      setRestText(String(p.rest));
      setRoundsText(String(p.rounds));
    }
  };

  const clearTimers = (): void => {
    if (timer.current) clearTimeout(timer.current);
    if (tick.current) clearInterval(tick.current);
  };

  const runPhase = (r: number, ph: PhaseKey): void => {
    setRound(r);
    setPhase(ph);
    triggerHaptic();

    const sec = ph === 'prep' ? PREP_SEC : ph === 'work' ? work! : rest!;
    setSecondsLeft(sec);
    tick.current = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);

    timer.current = setTimeout(() => {
      if (tick.current) clearInterval(tick.current);
      if (ph === 'prep') {
        runPhase(1, 'work');
        return;
      }
      if (ph === 'work') {
        if (r < rounds!) {
          runPhase(r, 'rest');
        } else {
          clearTimers();
          setScreen('done');
        }
        return;
      }
      // ph === 'rest' → next round's work.
      runPhase(r + 1, 'work');
    }, sec * 1000);
  };

  const start = (): void => {
    if (!canStart) return;
    setScreen('running');
    runPhase(0, 'prep');
  };

  const stop = (): void => {
    clearTimers();
    setScreen('setup');
  };

  useEffect(() => () => clearTimers(), []);

  const phaseLabel: Record<PhaseKey, string> = {
    prep: t('sport.intervalTimer.phase.prep'),
    work: t('sport.intervalTimer.phase.work'),
    rest: t('sport.intervalTimer.phase.rest'),
  };
  const phaseColor: Record<PhaseKey, string> = { prep: colors.textSubtle, work: colors.accentStrength, rest: colors.info };

  return (
    <Screen>
      <Text variant="title">{t('sport.intervalTimer.title')}</Text>
      <Text variant="caption" color="textMuted">
        {t('sport.intervalTimer.subtitle')}
      </Text>

      {screen === 'setup' ? (
        <>
          <View style={{ marginTop: spacing[2] }}>
            <Text variant="body" style={{ fontWeight: '600', marginBottom: spacing[2] }}>{t('sport.intervalTimer.presetLabel')}</Text>
            <SegmentedControl options={PRESET_OPTIONS} value={preset} onChange={applyPreset} />
          </View>

          <View style={{ flexDirection: 'row', gap: spacing[3], marginTop: spacing[4] }}>
            <View style={{ flex: 1 }}>
              <Input label={t('sport.intervalTimer.workLabel')} keyboardType="numeric" value={workText} onChangeText={setWorkText} />
            </View>
            <View style={{ flex: 1 }}>
              <Input label={t('sport.intervalTimer.restLabel')} keyboardType="numeric" value={restText} onChangeText={setRestText} />
            </View>
            <View style={{ flex: 1 }}>
              <Input label={t('sport.intervalTimer.roundsLabel')} keyboardType="numeric" value={roundsText} onChangeText={setRoundsText} />
            </View>
          </View>

          {work !== null && rest !== null && rounds !== null ? (
            <Card style={{ marginTop: spacing[3] }}>
              <Text variant="caption" color="textMuted">
                {t('sport.intervalTimer.summary', {
                  rounds,
                  work,
                  rest,
                  totalMin: Math.round((rounds * work + (rounds - 1) * rest) / 60),
                })}
              </Text>
            </Card>
          ) : null}

          <View style={{ alignItems: 'center', marginTop: spacing[6] }}>
            <Button label={t('sport.intervalTimer.start')} onPress={start} disabled={!canStart} />
          </View>
        </>
      ) : null}

      {screen === 'running' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[6] }}>
          <Text variant="caption" color="textSubtle">
            {phase === 'prep' ? t('sport.intervalTimer.preparation') : t('sport.intervalTimer.round', { round, rounds })}
          </Text>

          <View
            style={{
              width: 220,
              height: 220,
              borderRadius: radii.full,
              borderWidth: 3,
              borderColor: phaseColor[phase],
              backgroundColor: `${phaseColor[phase]}22`,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text variant="heading">{phaseLabel[phase]}</Text>
            <Text variant="display" style={{ marginTop: spacing[1] }}>{secondsLeft}</Text>
          </View>

          <Button label={t('sport.intervalTimer.stop')} variant="secondary" onPress={stop} />
        </View>
      ) : null}

      {screen === 'done' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[4] }}>
          <Icon name="fire" size={40} color={colors.warning} />
          <Text variant="heading">{t('sport.intervalTimer.done.heading')}</Text>
          <Text variant="caption" color="textMuted" style={{ textAlign: 'center' }}>
            {t('sport.intervalTimer.done.summary', { rounds, work, rest })}
          </Text>
          <Button label={t('sport.intervalTimer.done.restart')} onPress={() => setScreen('setup')} />
        </View>
      ) : null}

      <View style={{ alignItems: 'flex-start', marginTop: spacing[4] }}>
        <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
