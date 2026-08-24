import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Button, Card, FilterChip, Screen, SegmentedControl, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { bilateralAudioUrl } from '@/lib/bilateralAudio';
import { BILATERAL_AUDIO_CATALOG } from './bilateralAudioCatalog';

/**
 * Visual bilateral stimulation (Neuro Recovery Suite, cahier §3.7). A target
 * sweeps left↔right; the user follows it with their eyes to help wind down.
 * An optional looping ambient track (bilateral-audio bucket) can play
 * alongside it — background ambience, not synced sample-by-sample to the
 * dot's position.
 *
 * IMPORTANT (compliance, cahier §3.7/§4.2): this is a relaxation tool, NOT EMDR
 * therapy. The distinction is shown before use and never presented as
 * therapeutic.
 */
const DOT_SIZE = 32;
const H_PADDING = spacing[6];
const FADE_MS = 800;
const FADE_STEP_MS = 50;

const SPEEDS = [
  { value: 'slow', labelKey: 'wellbeing.bilateral.speed.slow', sweepMs: 2200 },
  { value: 'medium', labelKey: 'wellbeing.bilateral.speed.medium', sweepMs: 1400 },
  { value: 'fast', labelKey: 'wellbeing.bilateral.speed.fast', sweepMs: 900 },
] as const;

export function BilateralScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const pos = useRef(new Animated.Value(0)).current;
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState<string>('slow');
  const [soundId, setSoundId] = useState<string | null>(null);

  const sweepMs = SPEEDS.find((s) => s.value === speed)?.sweepMs ?? 1400;
  const travel = Math.max(120, width - H_PADDING * 2 - DOT_SIZE);

  const selectedSound = useMemo(
    () => BILATERAL_AUDIO_CATALOG.find((s) => s.id === soundId) ?? null,
    [soundId],
  );
  const soundUrl = selectedSound ? bilateralAudioUrl(selectedSound.audioPath) : null;
  const player = useAudioPlayer(soundUrl ?? undefined);
  const status = useAudioPlayerStatus(player);
  const fadeTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    player.loop = true;
  }, [player]);

  useEffect(() => () => {
    if (fadeTimer.current) clearInterval(fadeTimer.current);
  }, []);

  useEffect(() => {
    if (fadeTimer.current) {
      clearInterval(fadeTimer.current);
      fadeTimer.current = null;
    }
    if (running && soundUrl) {
      player.volume = 1;
      player.play();
      return;
    }
    if (!status.playing) return;
    const steps = FADE_MS / FADE_STEP_MS;
    let i = 0;
    fadeTimer.current = setInterval(() => {
      i += 1;
      player.volume = Math.max(0, 1 - i / steps);
      if (i >= steps) {
        if (fadeTimer.current) clearInterval(fadeTimer.current);
        player.pause();
        player.volume = 1;
      }
    }, FADE_STEP_MS);
  }, [running, soundUrl]);

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
      <Text variant="title">{t('wellbeing.bilateral.title')}</Text>
      <Text variant="caption" color="textMuted">
        {t('wellbeing.bilateral.subtitle')}
      </Text>

      <Card>
        <Text variant="label" color="warning">
          {t('wellbeing.bilateral.warningTitle')}
        </Text>
        <Text variant="caption" color="textMuted" style={{ marginTop: spacing[1] }}>
          {t('wellbeing.bilateral.warningBody')}
        </Text>
      </Card>

      <View style={{ marginTop: spacing[2] }}>
        <SegmentedControl
          options={SPEEDS.map((s) => ({ value: s.value, label: t(s.labelKey) }))}
          value={speed}
          onChange={setSpeed}
        />
      </View>

      <View style={{ marginTop: spacing[4], gap: spacing[2] }}>
        <Text variant="label" color="textSubtle">{t('wellbeing.bilateral.ambientSoundLabel')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
          <FilterChip label={t('wellbeing.bilateral.noSound')} active={soundId === null} onPress={() => setSoundId(null)} />
          {BILATERAL_AUDIO_CATALOG.map((s) =>
            s.available ? (
              <FilterChip
                key={s.id}
                label={s.title}
                active={soundId === s.id}
                onPress={() => setSoundId(s.id)}
              />
            ) : (
              <View key={s.id} style={{ opacity: 0.4 }}>
                <FilterChip label={s.title} />
              </View>
            ),
          )}
        </View>
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
          label={running ? t('wellbeing.bilateral.stop') : t('wellbeing.bilateral.start')}
          onPress={() => setRunning((r) => !r)}
        />
      </View>

      <View style={{ alignItems: 'flex-start', marginTop: spacing[4] }}>
        <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
