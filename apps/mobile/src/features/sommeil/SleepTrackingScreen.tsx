import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, Screen, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { analyzeSleep, isLightSleep, type MovementEpoch } from '@supotsu/engines';
import type { Confidence } from '@supotsu/core';
import { nightTrackingAvailable, startNightTracking } from './nightTracker';
import { useAddSleepSession } from '@/lib/data/queries';
import { formatClock, usePreferences } from '@/lib/preferences';
import alarmSound from '../../../assets/audio/alarm.wav';

const EPOCH_SEC = 60;
const ALARM_CHECK_MS = 20_000;
const BACKGROUND_GAP_WARN_SEC = 30;

type Phase = 'idle' | 'tracking' | 'ringing' | 'summary';

interface Summary {
  confidence: Confidence;
  deepMin: number;
  lightMin: number;
  awakeMin: number;
  asleepMin: number;
  inserted: boolean;
}

const CONFIDENCE_KEY: Record<Confidence, string> = { high: 'high', medium: 'medium', to_confirm: 'toConfirm' };
const CONFIDENCE_TONE: Record<Confidence, 'success' | 'warning' | 'error'> = { high: 'success', medium: 'warning', to_confirm: 'error' };

function computeAlarmTarget(hour: number, minute: number, from: Date): Date {
  const target = new Date(from);
  target.setHours(hour, minute, 0, 0);
  if (target.getTime() <= from.getTime()) target.setDate(target.getDate() + 1);
  return target;
}

function fmtElapsed(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}

/**
 * Mode nuit : suivi du sommeil par l'accéléromètre (téléphone posé sur le
 * lit), écran très sombre + réveil intelligent dans une fenêtre choisie.
 * Doit rester au premier PLAN, écran verrouillé — iOS bride les capteurs en
 * arrière-plan (voir l'avertissement affiché si l'app est mise en
 * arrière-plan pendant le suivi). 100% local : rien n'est envoyé nulle part.
 */
export function SleepTrackingScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { preferences } = usePreferences();
  const addSleepSession = useAddSleepSession();
  const alarmPlayer = useAudioPlayer(alarmSound);

  const [phase, setPhase] = useState<Phase>('idle');
  const [now, setNow] = useState(() => new Date());
  const [backgroundWarning, setBackgroundWarning] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);

  const inBedStartRef = useRef<string | null>(null);
  const epochsRef = useRef<MovementEpoch[]>([]);
  const stopTrackingRef = useRef<(() => void) | null>(null);
  const alarmTargetRef = useRef<Date | null>(null);
  const backgroundedAtRef = useRef<number | null>(null);
  const rampTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hapticsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const snoozeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // deactivateKeepAwake() throws if the wake lock was never activated (e.g.
  // the screen is opened and left without starting tracking) — only call it
  // once activateKeepAwakeAsync() has actually succeeded.
  const keepAwakeActiveRef = useRef(false);
  const releaseKeepAwake = (): void => {
    if (!keepAwakeActiveRef.current) return;
    keepAwakeActiveRef.current = false;
    deactivateKeepAwake();
  };

  // Clock tick while tracking/ringing — elapsed time + current time display.
  useEffect(() => {
    if (phase === 'idle' || phase === 'summary') return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(
    () => () => {
      stopTrackingRef.current?.();
      releaseKeepAwake();
      if (rampTimerRef.current) clearInterval(rampTimerRef.current);
      if (hapticsTimerRef.current) clearInterval(hapticsTimerRef.current);
      if (snoozeTimerRef.current) clearTimeout(snoozeTimerRef.current);
    },
    [],
  );

  // Detects an app-backgrounded gap during tracking — iOS throttles sensors
  // off-screen, so a real gap means part of the night has no data. Surfaced
  // honestly instead of silently producing a night with an unexplained hole.
  useEffect(() => {
    if (phase !== 'tracking') return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        backgroundedAtRef.current = Date.now();
      } else if (state === 'active' && backgroundedAtRef.current) {
        const gapSec = (Date.now() - backgroundedAtRef.current) / 1000;
        backgroundedAtRef.current = null;
        if (gapSec > BACKGROUND_GAP_WARN_SEC) setBackgroundWarning(true);
      }
    });
    return () => sub.remove();
  }, [phase]);

  const finishTracking = useCallback(
    async (endedAt: string) => {
      stopTrackingRef.current?.();
      stopTrackingRef.current = null;
      const inBedStart = inBedStartRef.current;
      if (!inBedStart) return;
      const { session, confidence } = analyzeSleep(epochsRef.current, inBedStart, endedAt);
      const result = await addSleepSession.mutateAsync(session);
      setSummary({
        confidence,
        deepMin: result.session.deepMin,
        lightMin: result.session.lightMin,
        awakeMin: result.session.awakeMin,
        asleepMin: result.session.asleepMin,
        inserted: result.inserted,
      });
    },
    [addSleepSession],
  );

  const startRingtone = useCallback(() => {
    const rampSec = preferences.sleepAlarm?.volumeRampSec ?? 30;
    alarmPlayer.loop = true;
    alarmPlayer.volume = rampSec > 0 ? 0 : 1;
    alarmPlayer.play();
    if (rampSec > 0) {
      const steps = Math.max(1, Math.round(rampSec));
      let i = 0;
      rampTimerRef.current = setInterval(() => {
        i += 1;
        alarmPlayer.volume = Math.min(1, i / steps);
        if (i >= steps && rampTimerRef.current) {
          clearInterval(rampTimerRef.current);
          rampTimerRef.current = null;
        }
      }, 1000);
    }
    if (preferences.sleepAlarm?.vibration !== false) {
      hapticsTimerRef.current = setInterval(() => {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }, 1500);
    }
  }, [alarmPlayer, preferences.sleepAlarm]);

  const stopRingtone = useCallback(() => {
    alarmPlayer.pause();
    alarmPlayer.volume = 1;
    if (rampTimerRef.current) {
      clearInterval(rampTimerRef.current);
      rampTimerRef.current = null;
    }
    if (hapticsTimerRef.current) {
      clearInterval(hapticsTimerRef.current);
      hapticsTimerRef.current = null;
    }
  }, [alarmPlayer]);

  const triggerAlarm = useCallback(() => {
    setPhase('ringing');
    void finishTracking(new Date().toISOString());
    startRingtone();
  }, [finishTracking, startRingtone]);

  // Alarm window check — within [target - fenêtre, target], ring as soon as
  // isLightSleep says so; past target, ring regardless (simple-alarm floor —
  // also what a 0-min window means, matching "réveil sans suivi" repli).
  useEffect(() => {
    if (phase !== 'tracking') return;
    const alarm = preferences.sleepAlarm;
    if (!alarm?.enabled) return;
    const check = setInterval(() => {
      const target = alarmTargetRef.current;
      if (!target) return;
      const nowMs = Date.now();
      const windowMs = alarm.windowMin * 60_000;
      if (nowMs >= target.getTime()) {
        triggerAlarm();
      } else if (alarm.windowMin > 0 && nowMs >= target.getTime() - windowMs) {
        if (isLightSleep(epochsRef.current.slice(-5))) triggerAlarm();
      }
    }, ALARM_CHECK_MS);
    return () => clearInterval(check);
  }, [phase, preferences.sleepAlarm, triggerAlarm]);

  const start = async (): Promise<void> => {
    setBackgroundWarning(false);
    epochsRef.current = [];
    inBedStartRef.current = new Date().toISOString();
    alarmTargetRef.current =
      preferences.sleepAlarm?.enabled ? computeAlarmTarget(preferences.sleepAlarm.hour, preferences.sleepAlarm.minute, new Date()) : null;
    await activateKeepAwakeAsync();
    keepAwakeActiveRef.current = true;
    stopTrackingRef.current = startNightTracking((epoch) => epochsRef.current.push(epoch), EPOCH_SEC);
    setPhase('tracking');
  };

  const stopManually = async (): Promise<void> => {
    releaseKeepAwake();
    await finishTracking(new Date().toISOString());
    setPhase('summary');
  };

  const dismissAlarm = (): void => {
    releaseKeepAwake();
    stopRingtone();
    setPhase('summary');
  };

  const snooze = (): void => {
    stopRingtone();
    const min = preferences.sleepAlarm?.snoozeMin ?? 0;
    if (min <= 0) return;
    snoozeTimerRef.current = setTimeout(() => startRingtone(), min * 60_000);
  };

  if (!nightTrackingAvailable()) {
    return (
      <Screen>
        <Text variant="title">{t('sommeil.tracking.title')}</Text>
        <Card>
          <Text variant="body" color="textMuted">
            {t('sommeil.tracking.unavailable.message')}
          </Text>
        </Card>
        <View style={{ alignItems: 'flex-start' }}>
          <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  if (phase === 'idle') {
    return (
      <Screen scroll>
        <Text variant="title">{t('sommeil.tracking.title')}</Text>
        <Text variant="caption" color="textMuted">
          {t('sommeil.tracking.idle.description')}
        </Text>
        <Card>
          <Text variant="heading">{t('sommeil.tracking.idle.beforeStart.title')}</Text>
          <View style={{ gap: spacing[2], marginTop: spacing[2] }}>
            <Text variant="body" color="textMuted">{t('sommeil.tracking.idle.beforeStart.tip1')}</Text>
            <Text variant="body" color="textMuted">{t('sommeil.tracking.idle.beforeStart.tip2')}</Text>
            <Text variant="body" color="textMuted">{t('sommeil.tracking.idle.beforeStart.tip3')}</Text>
          </View>
        </Card>
        {preferences.sleepAlarm?.enabled ? (
          <Card>
            <Text variant="heading">{t('sommeil.tracking.idle.alarmScheduled.title')}</Text>
            <Text variant="body" color="textMuted">
              {formatClock(preferences.sleepAlarm.hour, preferences.sleepAlarm.minute, preferences.timeFormat)}
              {preferences.sleepAlarm.windowMin > 0
                ? t('sommeil.tracking.idle.alarmScheduled.smartWindow', { min: preferences.sleepAlarm.windowMin })
                : t('sommeil.tracking.idle.alarmScheduled.simple')}
            </Text>
          </Card>
        ) : (
          <Pressable onPress={() => router.push('/sommeil/alarm')}>
            <Text variant="caption" color="primary">{t('sommeil.tracking.idle.scheduleAlarmCta')}</Text>
          </Pressable>
        )}
        <Button label={t('sommeil.tracking.idle.startCta')} onPress={() => void start()} fullWidth />
        <View style={{ alignItems: 'flex-start' }}>
          <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  if (phase === 'summary' && summary) {
    return (
      <Screen scroll>
        <Text variant="title">{t('sommeil.tracking.summary.title')}</Text>
        {!summary.inserted ? (
          <Badge label={t('sommeil.tracking.summary.notInserted')} tone="warning" />
        ) : (
          <>
            <Badge label={t(`sommeil.tracking.summary.confidence.${CONFIDENCE_KEY[summary.confidence]}`)} tone={CONFIDENCE_TONE[summary.confidence]} />
            <Card>
              <View style={{ gap: spacing[1] }}>
                <Text variant="body">{t('sommeil.tracking.summary.deep', { time: fmtElapsed(summary.deepMin * 60) })}</Text>
                <Text variant="body">{t('sommeil.tracking.summary.light', { time: fmtElapsed(summary.lightMin * 60) })}</Text>
                <Text variant="body">{t('sommeil.tracking.summary.awake', { time: fmtElapsed(summary.awakeMin * 60) })}</Text>
                <Text variant="caption" color="textSubtle">{t('sommeil.tracking.summary.remNotAvailable')}</Text>
              </View>
            </Card>
          </>
        )}
        <Button label={t('sommeil.tracking.summary.viewInSleepCta')} onPress={() => router.replace('/sommeil')} fullWidth />
      </Screen>
    );
  }

  if (phase === 'ringing') {
    const snoozeMin = preferences.sleepAlarm?.snoozeMin ?? 0;
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + spacing[6], padding: spacing[6], alignItems: 'center', justifyContent: 'center', gap: spacing[6] }}>
        <Text variant="title">{t('sommeil.tracking.ringing.title')}</Text>
        <Text variant="heading">{now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</Text>
        <Button label={t('sommeil.tracking.ringing.stopCta')} onPress={dismissAlarm} fullWidth />
        {snoozeMin > 0 ? <Button label={t('sommeil.tracking.ringing.snoozeCta', { min: snoozeMin })} variant="secondary" onPress={snooze} fullWidth /> : null}
      </View>
    );
  }

  if (phase === 'summary') {
    // Alarm-triggered finish: setPhase('ringing'→'summary') can win the race
    // against finishTracking's async save — show a brief loading state
    // rather than falling through to the near-black tracking view.
    return (
      <Screen>
        <Text variant="body" color="textMuted">{t('sommeil.tracking.savingNight')}</Text>
      </Screen>
    );
  }

  // phase === 'tracking' — deliberately near-black: minimal chrome, dim text.
  const elapsedSec = inBedStartRef.current ? Math.floor((now.getTime() - new Date(inBedStartRef.current).getTime()) / 1000) : 0;
  return (
    <View style={{ flex: 1, backgroundColor: '#000', paddingTop: insets.top + spacing[6], padding: spacing[6], alignItems: 'center', justifyContent: 'center', gap: spacing[4] }}>
      <Text style={{ color: '#333', fontSize: 15 }}>{t('sommeil.tracking.active.status', { elapsed: fmtElapsed(elapsedSec) })}</Text>
      <Text style={{ color: '#222', fontSize: 13 }}>
        {now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
      </Text>
      {backgroundWarning ? (
        <Text style={{ color: '#443', fontSize: 12, textAlign: 'center', maxWidth: 260 }}>
          {t('sommeil.tracking.active.backgroundWarning')}
        </Text>
      ) : null}
      <Pressable onPress={() => void stopManually()} style={{ marginTop: spacing[8], padding: spacing[3], borderRadius: radii.md, borderWidth: 1, borderColor: '#222' }}>
        <Text style={{ color: '#444', fontSize: 13 }}>{t('sommeil.tracking.active.finishCta')}</Text>
      </Pressable>
    </View>
  );
}
