import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, Input, Screen, SegmentedControl, Text, triggerHaptic, useTheme } from '@supotsu/ui';
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
const SETS_OPTIONS = [
  { value: '3', label: '3 séries' },
  { value: '5', label: '5 séries' },
  { value: '8', label: '8 séries' },
  { value: 'custom', label: 'Perso' },
];
const HOLD_OPTIONS = [
  { value: '15', label: '15 s' },
  { value: '20', label: '20 s' },
  { value: '30', label: '30 s' },
  { value: 'custom', label: 'Perso' },
];
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
  const router = useRouter();
  const { colors } = useTheme();
  const { data: activities = [] } = useActivities();
  const addActivity = useAddActivity();

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
      { key: 'exhale', label: 'Expire à fond', sec: EXHALE_SEC, scale: 1 },
      { key: 'vacuum', label: 'Rentre le ventre', sec: VACUUM_SEC, scale: 0.55 },
      { key: 'hold', label: 'Tiens', sec: holdSec, scale: 0.55 },
      { key: 'release', label: 'Relâche', sec: RELEASE_SEC, scale: 1 },
    ],
    [holdSec],
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
      <Text variant="title">Stomach Vacuum</Text>
      <Text variant="caption" color="textMuted">
        Gainage du transverse — expire, rentre le ventre, tiens, relâche.
      </Text>

      {screen === 'setup' ? (
        <>
          <Card>
            <Text variant="caption" color="textMuted">
              {personalBestSec !== null ? `Ton record : ${personalBestSec}s de tenue` : 'Pas encore de séance enregistrée — à toi de jouer.'}
            </Text>
          </Card>

          <View style={{ marginTop: spacing[2] }}>
            <Text variant="body" style={{ fontWeight: '600', marginBottom: spacing[2] }}>Séries</Text>
            <SegmentedControl options={SETS_OPTIONS} value={setsChoice} onChange={setSetsChoice} />
            {setsChoice === 'custom' ? (
              <View style={{ marginTop: spacing[2] }}>
                <Input
                  keyboardType="numeric"
                  placeholder={`Entre ${MIN_SETS} et ${MAX_SETS}`}
                  value={customSets}
                  onChangeText={setCustomSets}
                />
              </View>
            ) : null}

            <Text variant="body" style={{ fontWeight: '600', marginTop: spacing[4], marginBottom: spacing[2] }}>Durée de tenue</Text>
            <SegmentedControl options={HOLD_OPTIONS} value={holdChoice} onChange={setHoldChoice} />
            {holdChoice === 'custom' ? (
              <View style={{ marginTop: spacing[2] }}>
                <Input
                  keyboardType="numeric"
                  placeholder={`En secondes, entre ${MIN_HOLD_SEC} et ${MAX_HOLD_SEC}`}
                  value={customHold}
                  onChangeText={setCustomHold}
                />
              </View>
            ) : null}
          </View>

          <View style={{ alignItems: 'center', marginTop: spacing[6] }}>
            <Button label="Commencer" onPress={start} disabled={!canStart} />
          </View>
        </>
      ) : null}

      {screen === 'running' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[6] }}>
          <Text variant="caption" color="textSubtle">Série {setIdx + 1} / {totalSets}</Text>

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
              <Text variant="heading">{resting ? 'Repos' : currentPhase!.label}</Text>
              <Text variant="display" style={{ marginTop: spacing[1] }}>{secondsLeft}</Text>
            </View>
          </View>

          <Button label="Arrêter" variant="secondary" onPress={stop} />
        </View>
      ) : null}

      {screen === 'done' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[4] }}>
          <Text style={{ fontSize: 40 }}>💪</Text>
          <Text variant="heading">Séance enregistrée</Text>
          <Text variant="caption" color="textMuted" style={{ textAlign: 'center' }}>
            {totalSets} séries · tenue {holdSec}s — ajoutée à ton historique d'activités.
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
