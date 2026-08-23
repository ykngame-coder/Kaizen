import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Card, Input, Screen, SegmentedControl, Text, Toggle, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { DEFAULT_SLEEP_ALARM, formatClock, usePreferences, type SleepAlarmSettings } from '@/lib/preferences';

const DAY_LABELS = ['D', 'L', 'M', 'M', 'J', 'V', 'S']; // index = Date#getDay() (0 = dimanche)
const WINDOW_OPTIONS = [
  { value: '0', label: 'Alarme simple' },
  { value: '15', label: '15 min' },
  { value: '30', label: '30 min' },
] as const;
const SNOOZE_OPTIONS = [
  { value: '0', label: 'Désactivé' },
  { value: '5', label: '5 min' },
  { value: '9', label: '9 min' },
  { value: '15', label: '15 min' },
] as const;
const RAMP_OPTIONS = [
  { value: '0', label: 'Volume direct' },
  { value: '15', label: '15 s' },
  { value: '30', label: '30 s' },
  { value: '60', label: '60 s' },
] as const;

const clampHour = (n: number): number => Math.max(0, Math.min(23, Math.round(n) || 0));
const clampMinute = (n: number): number => Math.max(0, Math.min(59, Math.round(n) || 0));

/**
 * Réveil intelligent : réglages stockés localement (Preferences). Ne sonne
 * de façon fiable que pendant que le mode nuit est ouvert au premier plan —
 * limite iOS/Android, pas d'alarme système en arrière-plan sans app dédiée.
 */
export function AlarmSettingsScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { preferences, setPreference } = usePreferences();
  const alarm = preferences.sleepAlarm ?? DEFAULT_SLEEP_ALARM;

  const update = (patch: Partial<SleepAlarmSettings>): void => {
    setPreference('sleepAlarm', { ...alarm, ...patch });
  };
  const toggleDay = (day: number): void => {
    const next = alarm.repeatDays.includes(day) ? alarm.repeatDays.filter((d) => d !== day) : [...alarm.repeatDays, day];
    update({ repeatDays: next });
  };

  return (
    <Screen scroll>
      <Text variant="title">Réveil intelligent</Text>
      <Badge
        label="Fonctionne uniquement pendant que le mode nuit est ouvert — pas d'alarme en arrière-plan (limite iOS/Android)."
        tone="warning"
      />

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="heading">Activer le réveil</Text>
          <Toggle value={alarm.enabled} onValueChange={(v) => update({ enabled: v })} />
        </View>

        <View style={{ flexDirection: 'row', gap: spacing[4], marginTop: spacing[3] }}>
          <View style={{ flex: 1 }}>
            <Input
              label="Heure"
              keyboardType="numeric"
              value={String(alarm.hour)}
              onChangeText={(v) => update({ hour: clampHour(Number(v)) })}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Input
              label="Minute"
              keyboardType="numeric"
              value={String(alarm.minute).padStart(2, '0')}
              onChangeText={(v) => update({ minute: clampMinute(Number(v)) })}
            />
          </View>
        </View>
        <Text variant="caption" color="textMuted" style={{ marginTop: spacing[1] }}>
          {formatClock(alarm.hour, alarm.minute, preferences.timeFormat)}
        </Text>

        <Text variant="label" color="textMuted" style={{ marginTop: spacing[3] }}>
          JOURS DE RÉPÉTITION
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[1] }}>
          {DAY_LABELS.map((label, day) => {
            const on = alarm.repeatDays.includes(day);
            return (
              <Pressable
                key={day}
                onPress={() => toggleDay(day)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: on ? colors.primary : colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: on ? colors.primary : colors.border,
                }}
              >
                <Text variant="caption" style={{ color: on ? '#04140b' : colors.textMuted, fontWeight: '700' }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[1] }}>
          {alarm.repeatDays.length === 0 ? 'Tous les jours.' : 'Informatif pour l’instant — lance le mode nuit chaque soir où tu veux le réveil.'}
        </Text>
      </Card>

      <Card>
        <Text variant="heading">Fenêtre intelligente</Text>
        <Text variant="caption" color="textMuted" style={{ marginBottom: spacing[2] }}>
          Sonne dès que tu sembles en sommeil léger dans les N minutes avant l'heure réglée —
          sinon à l'heure pile.
        </Text>
        <SegmentedControl
          options={WINDOW_OPTIONS}
          value={String(alarm.windowMin) as '0' | '15' | '30'}
          onChange={(v) => update({ windowMin: Number(v) as 0 | 15 | 30 })}
        />
      </Card>

      <Card>
        <Text variant="heading">Son</Text>
        <Text variant="body" color="textMuted">Tonalité intégrée (générée sur l'appareil, pas de fichier téléchargé).</Text>

        <Text variant="label" color="textMuted" style={{ marginTop: spacing[3] }}>MONTÉE DE VOLUME</Text>
        <SegmentedControl
          options={RAMP_OPTIONS}
          value={String(alarm.volumeRampSec) as '0' | '15' | '30' | '60'}
          onChange={(v) => update({ volumeRampSec: Number(v) })}
        />

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing[3] }}>
          <Text variant="body">Vibration</Text>
          <Toggle value={alarm.vibration} onValueChange={(v) => update({ vibration: v })} />
        </View>

        <Text variant="label" color="textMuted" style={{ marginTop: spacing[3] }}>REPORT (SNOOZE)</Text>
        <SegmentedControl
          options={SNOOZE_OPTIONS}
          value={String(alarm.snoozeMin) as '0' | '5' | '9' | '15'}
          onChange={(v) => update({ snoozeMin: Number(v) })}
        />
      </Card>

      <Button label="Lancer le mode nuit" onPress={() => router.push('/sommeil/track')} fullWidth />
      <View style={{ alignItems: 'flex-start' }}>
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
