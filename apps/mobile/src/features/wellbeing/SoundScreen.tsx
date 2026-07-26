import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, Screen, SegmentedControl, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import {
  SOUND_PRESETS,
  createSoundEngine,
  pickLocalAudio,
  type SoundEngine,
  type SoundPresetKey,
} from './soundEngine';

const VOLUME_OPTIONS = [
  { value: '0.3', label: 'Doux' },
  { value: '0.6', label: 'Moyen' },
  { value: '1', label: 'Fort' },
];
const TIMER_OPTIONS = [
  { value: '0', label: 'Off' },
  { value: '15', label: '15 min' },
  { value: '30', label: '30 min' },
  { value: '60', label: '60 min' },
];

interface LocalSound {
  name: string;
  file: File;
}

/**
 * Sound Engine screen (Sleep Suite §3.8). Synthesized royalty-free ambiences +
 * the user's own local audio files, with volume, timer and fade-out. Web-only
 * playback for now (Web Audio); native shows a graceful notice.
 */
export function SoundScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const engineRef = useRef<SoundEngine | null>(null);
  if (engineRef.current === null) engineRef.current = createSoundEngine();
  const engine = engineRef.current;

  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [volume, setVolume] = useState(0.6);
  const [timerMin, setTimerMin] = useState(0);
  const [localSounds, setLocalSounds] = useState<LocalSound[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);

  useEffect(() => () => engine.dispose(), [engine]);

  const armTimer = (): void => {
    if (timerMin > 0) engine.startTimer(timerMin);
  };

  const onPreset = (key: SoundPresetKey): void => {
    if (playingKey === key) {
      engine.stop();
      setPlayingKey(null);
      return;
    }
    engine.play(key);
    setPlayingKey(key);
    armTimer();
  };

  const onLocal = async (idx: number): Promise<void> => {
    const key = `file:${idx}`;
    if (playingKey === key) {
      engine.stop();
      setPlayingKey(null);
      return;
    }
    try {
      setFileError(null);
      await engine.playFile(localSounds[idx]!.file);
      setPlayingKey(key);
      armTimer();
    } catch {
      setFileError('Impossible de lire ce fichier audio.');
      setPlayingKey(null);
    }
  };

  const addFiles = async (): Promise<void> => {
    const files = await pickLocalAudio();
    if (files.length > 0) {
      setLocalSounds((prev) => [...prev, ...files.map((f) => ({ name: f.name, file: f }))]);
    }
  };

  const onVolume = (v: string): void => {
    const n = Number(v);
    setVolume(n);
    engine.setVolume(n);
  };

  const onTimer = (v: string): void => {
    const n = Number(v);
    setTimerMin(n);
    if (n === 0) engine.clearTimer();
    else if (playingKey) engine.startTimer(n);
  };

  if (!engine.isSupported) {
    return (
      <Screen scroll>
        <Text variant="title">Sons apaisants</Text>
        <Card>
          <Text variant="body" color="textMuted">
            La lecture des sons est disponible sur la version web de SUPOTSU pour l’instant. Ouvre
            l’app dans ton navigateur pour en profiter — la version {Platform.OS} arrivera plus tard.
          </Text>
        </Card>
        <View style={{ alignItems: 'flex-start' }}>
          <Button label="Retour" variant="secondary" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Text variant="title">Sons apaisants</Text>
      <Text variant="caption" color="textMuted">
        Ambiances générées par l’app (libres de droits) ou tes propres sons. Minuterie et fondu de
        sortie inclus.
      </Text>

      <Card>
        <Text variant="heading">Ambiances</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[2] }}>
          {SOUND_PRESETS.map((p) => {
            const active = playingKey === p.key;
            return (
              <Pressable
                key={p.key}
                onPress={() => onPreset(p.key)}
                style={{
                  width: '30%',
                  minWidth: 92,
                  flexGrow: 1,
                  alignItems: 'center',
                  paddingVertical: spacing[3],
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? colors.surfaceElevated : colors.surface,
                }}
              >
                <Text variant="title">{p.emoji}</Text>
                <Text variant="caption" color={active ? 'primary' : 'textMuted'}>
                  {active ? '❚❚ ' : ''}
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card>
        <Text variant="heading">Volume</Text>
        <View style={{ marginTop: spacing[2] }}>
          <SegmentedControl options={VOLUME_OPTIONS} value={String(volume)} onChange={onVolume} />
        </View>
        <Text variant="heading" style={{ marginTop: spacing[4] }}>
          Minuterie
        </Text>
        <View style={{ marginTop: spacing[2] }}>
          <SegmentedControl options={TIMER_OPTIONS} value={String(timerMin)} onChange={onTimer} />
        </View>
        {timerMin > 0 && (
          <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[2] }}>
            Le son s’arrêtera après {timerMin} min avec un fondu de sortie.
          </Text>
        )}
      </Card>

      <Card>
        <Text variant="heading">Mes sons (appareil)</Text>
        <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[1] }}>
          Ajoute des fichiers audio de ta machine. Ils restent en local — rien n’est envoyé.
        </Text>
        <View style={{ alignItems: 'flex-start', marginTop: spacing[2] }}>
          <Button label="Ajouter un son" variant="secondary" onPress={addFiles} />
        </View>
        {fileError && (
          <Text variant="caption" color="error" style={{ marginTop: spacing[2] }}>
            {fileError}
          </Text>
        )}
        {localSounds.length > 0 && (
          <View style={{ gap: spacing[2], marginTop: spacing[3] }}>
            {localSounds.map((s, idx) => {
              const active = playingKey === `file:${idx}`;
              return (
                <Pressable
                  key={`${s.name}-${idx}`}
                  onPress={() => onLocal(idx)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: spacing[2],
                    paddingHorizontal: spacing[3],
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: active ? colors.primary : colors.border,
                    backgroundColor: active ? colors.surfaceElevated : colors.surface,
                  }}
                >
                  <Text variant="body" color={active ? 'primary' : 'text'} numberOfLines={1} style={{ flex: 1, paddingRight: spacing[2] }}>
                    {s.name}
                  </Text>
                  <Text variant="subtitle" color={active ? 'primary' : 'textMuted'}>
                    {active ? '❚❚' : '▶'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </Card>

      <View style={{ alignItems: 'flex-start' }}>
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
