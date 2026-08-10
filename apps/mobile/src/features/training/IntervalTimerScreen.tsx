import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, Input, Screen, SegmentedControl, Text, triggerHaptic, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';

/**
 * Generic work/rest interval timer — Tabata and HIIT are just presets on top
 * of the same engine (work seconds × rest seconds × rounds), plus a "Perso"
 * option since the three fields stay editable no matter which preset was
 * tapped. Pure utility tool, nothing is logged (Master Prompt: only log what
 * the user asked to track).
 */
const PRESETS = [
  { value: 'tabata', label: 'Tabata', work: 20, rest: 10, rounds: 8 },
  { value: 'hiit', label: 'HIIT', work: 30, rest: 15, rounds: 10 },
  { value: 'emom', label: 'EMOM', work: 40, rest: 20, rounds: 10 },
  { value: 'custom', label: 'Perso', work: 30, rest: 30, rounds: 8 },
] as const;
const PRESET_OPTIONS = PRESETS.map((p) => ({ value: p.value, label: p.label }));

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
  const router = useRouter();
  const { colors } = useTheme();

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

  const phaseLabel: Record<PhaseKey, string> = { prep: 'Prépare-toi', work: 'Travail', rest: 'Repos' };
  const phaseColor: Record<PhaseKey, string> = { prep: colors.textSubtle, work: colors.accentStrength, rest: colors.info };

  return (
    <Screen>
      <Text variant="title">Minuteur d'intervalles</Text>
      <Text variant="caption" color="textMuted">
        Tabata, HIIT, EMOM ou perso — travail / repos / rounds.
      </Text>

      {screen === 'setup' ? (
        <>
          <View style={{ marginTop: spacing[2] }}>
            <Text variant="body" style={{ fontWeight: '600', marginBottom: spacing[2] }}>Preset</Text>
            <SegmentedControl options={PRESET_OPTIONS} value={preset} onChange={applyPreset} />
          </View>

          <View style={{ flexDirection: 'row', gap: spacing[3], marginTop: spacing[4] }}>
            <View style={{ flex: 1 }}>
              <Input label="Travail (s)" keyboardType="numeric" value={workText} onChangeText={setWorkText} />
            </View>
            <View style={{ flex: 1 }}>
              <Input label="Repos (s)" keyboardType="numeric" value={restText} onChangeText={setRestText} />
            </View>
            <View style={{ flex: 1 }}>
              <Input label="Rounds" keyboardType="numeric" value={roundsText} onChangeText={setRoundsText} />
            </View>
          </View>

          {work !== null && rest !== null && rounds !== null ? (
            <Card style={{ marginTop: spacing[3] }}>
              <Text variant="caption" color="textMuted">
                {rounds} rounds · {work}s travail / {rest}s repos · durée totale ≈{' '}
                {Math.round((rounds * work + (rounds - 1) * rest) / 60)} min
              </Text>
            </Card>
          ) : null}

          <View style={{ alignItems: 'center', marginTop: spacing[6] }}>
            <Button label="Commencer" onPress={start} disabled={!canStart} />
          </View>
        </>
      ) : null}

      {screen === 'running' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[6] }}>
          <Text variant="caption" color="textSubtle">
            {phase === 'prep' ? 'Préparation' : `Round ${round} / ${rounds}`}
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

          <Button label="Arrêter" variant="secondary" onPress={stop} />
        </View>
      ) : null}

      {screen === 'done' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[4] }}>
          <Text style={{ fontSize: 40 }}>🔥</Text>
          <Text variant="heading">Séance terminée</Text>
          <Text variant="caption" color="textMuted" style={{ textAlign: 'center' }}>
            {rounds} rounds · {work}s / {rest}s
          </Text>
          <Button label="Refaire une séance" onPress={() => setScreen('setup')} />
        </View>
      ) : null}

      <View style={{ alignItems: 'flex-start', marginTop: spacing[4] }}>
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
