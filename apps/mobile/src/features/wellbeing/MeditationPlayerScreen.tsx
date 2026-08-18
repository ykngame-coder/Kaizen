import React, { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Button, EmptyState, Icon, Screen, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { meditationAudioUrl } from '@/lib/meditationAudio';
import { MEDITATION_CATALOG } from './meditationCatalog';

const FADE_MS = 1500;
const FADE_STEP_MS = 50;

function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Plays one guided meditation from Supabase Storage (expo-audio), with a fade-out on stop. */
export function MeditationPlayerScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useMemo(() => MEDITATION_CATALOG.find((s) => s.id === id), [id]);
  const url = session ? meditationAudioUrl(session.audioPath) : null;

  const player = useAudioPlayer(url ?? undefined);
  const status = useAudioPlayerStatus(player);
  const fadeTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (fadeTimer.current) clearInterval(fadeTimer.current);
  }, []);

  const fadeOutAndPause = (): void => {
    if (fadeTimer.current) clearInterval(fadeTimer.current);
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
  };

  const toggle = (): void => {
    if (status.playing) fadeOutAndPause();
    else player.play();
  };

  if (!session) {
    return (
      <Screen>
        <EmptyState icon={<Icon name="yoga" size={44} color={colors.textSubtle} />} title="Séance introuvable" actionLabel="Retour" onAction={() => router.back()} />
      </Screen>
    );
  }

  if (!url) {
    return (
      <Screen>
        <EmptyState icon={<Icon name="yoga" size={44} color={colors.textSubtle} />} title="Indisponible hors connexion" message="La lecture nécessite une connexion au backend." actionLabel="Retour" onAction={() => router.back()} />
      </Screen>
    );
  }

  const duration = status.duration || session.durationSec;
  const progress = duration > 0 ? Math.min(1, status.currentTime / duration) : 0;

  return (
    <Screen>
      <Text variant="title">{session.title}</Text>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[6] }}>
        <View
          style={{
            width: 220,
            height: 220,
            borderRadius: radii.full,
            borderWidth: 3,
            borderColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="yoga" size={40} color={colors.primary} />
          <Text variant="heading" style={{ marginTop: spacing[2] }}>
            {fmtClock(status.currentTime)} / {fmtClock(duration)}
          </Text>
        </View>

        <View style={{ width: '100%', height: 6, borderRadius: 3, backgroundColor: colors.surfaceElevated, overflow: 'hidden' }}>
          <View style={{ width: `${progress * 100}%`, height: '100%', backgroundColor: colors.primary }} />
        </View>

        <Button label={status.playing ? 'Pause' : 'Lecture'} onPress={toggle} />
      </View>

      <View style={{ alignItems: 'flex-start' }}>
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
