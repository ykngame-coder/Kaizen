import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, Input, Screen, SegmentedControl, Text, Toggle, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { DEFAULT_SLEEP_ALARM, formatClock, usePreferences, type SleepAlarmSettings } from '@/lib/preferences';

const clampHour = (n: number): number => Math.max(0, Math.min(23, Math.round(n) || 0));
const clampMinute = (n: number): number => Math.max(0, Math.min(59, Math.round(n) || 0));

/**
 * Réveil intelligent : réglages stockés localement (Preferences). Ne sonne
 * de façon fiable que pendant que le mode nuit est ouvert au premier plan —
 * limite iOS/Android, pas d'alarme système en arrière-plan sans app dédiée.
 */
export function AlarmSettingsScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { preferences, setPreference } = usePreferences();
  const alarm = preferences.sleepAlarm ?? DEFAULT_SLEEP_ALARM;

  const dayLabels = t('sommeil.alarmSettings.dayInitials', { returnObjects: true }) as string[];
  const windowOptions = [
    { value: '0', label: t('sommeil.alarmSettings.window.simple') },
    { value: '15', label: t('sommeil.alarmSettings.window.min15') },
    { value: '30', label: t('sommeil.alarmSettings.window.min30') },
  ] as const;
  const snoozeOptions = [
    { value: '0', label: t('sommeil.alarmSettings.snooze.off') },
    { value: '5', label: t('sommeil.alarmSettings.snooze.min5') },
    { value: '9', label: t('sommeil.alarmSettings.snooze.min9') },
    { value: '15', label: t('sommeil.alarmSettings.snooze.min15') },
  ] as const;
  const rampOptions = [
    { value: '0', label: t('sommeil.alarmSettings.ramp.instant') },
    { value: '15', label: t('sommeil.alarmSettings.ramp.sec15') },
    { value: '30', label: t('sommeil.alarmSettings.ramp.sec30') },
    { value: '60', label: t('sommeil.alarmSettings.ramp.sec60') },
  ] as const;

  const update = (patch: Partial<SleepAlarmSettings>): void => {
    setPreference('sleepAlarm', { ...alarm, ...patch });
  };
  const toggleDay = (day: number): void => {
    const next = alarm.repeatDays.includes(day) ? alarm.repeatDays.filter((d) => d !== day) : [...alarm.repeatDays, day];
    update({ repeatDays: next });
  };

  return (
    <Screen scroll>
      <Text variant="title">{t('sommeil.alarmSettings.title')}</Text>
      <Badge
        label={t('sommeil.alarmSettings.warningBadge')}
        tone="warning"
      />

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="heading">{t('sommeil.alarmSettings.enableToggle')}</Text>
          <Toggle value={alarm.enabled} onValueChange={(v) => update({ enabled: v })} />
        </View>

        <View style={{ flexDirection: 'row', gap: spacing[4], marginTop: spacing[3] }}>
          <View style={{ flex: 1 }}>
            <Input
              label={t('sommeil.alarmSettings.hourLabel')}
              keyboardType="numeric"
              value={String(alarm.hour)}
              onChangeText={(v) => update({ hour: clampHour(Number(v)) })}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Input
              label={t('sommeil.alarmSettings.minuteLabel')}
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
          {t('sommeil.alarmSettings.repeatDaysLabel')}
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[1] }}>
          {dayLabels.map((label, day) => {
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
          {alarm.repeatDays.length === 0 ? t('sommeil.alarmSettings.repeatDaysHint.everyDay') : t('sommeil.alarmSettings.repeatDaysHint.informative')}
        </Text>
      </Card>

      <Card>
        <Text variant="heading">{t('sommeil.alarmSettings.smartWindow.title')}</Text>
        <Text variant="caption" color="textMuted" style={{ marginBottom: spacing[2] }}>
          {t('sommeil.alarmSettings.smartWindow.description')}
        </Text>
        <SegmentedControl
          options={windowOptions}
          value={String(alarm.windowMin) as '0' | '15' | '30'}
          onChange={(v) => update({ windowMin: Number(v) as 0 | 15 | 30 })}
        />
      </Card>

      <Card>
        <Text variant="heading">{t('sommeil.alarmSettings.sound.title')}</Text>
        <Text variant="body" color="textMuted">{t('sommeil.alarmSettings.sound.description')}</Text>

        <Text variant="label" color="textMuted" style={{ marginTop: spacing[3] }}>{t('sommeil.alarmSettings.sound.volumeRampLabel')}</Text>
        <SegmentedControl
          options={rampOptions}
          value={String(alarm.volumeRampSec) as '0' | '15' | '30' | '60'}
          onChange={(v) => update({ volumeRampSec: Number(v) })}
        />

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing[3] }}>
          <Text variant="body">{t('sommeil.alarmSettings.sound.vibration')}</Text>
          <Toggle value={alarm.vibration} onValueChange={(v) => update({ vibration: v })} />
        </View>

        <Text variant="label" color="textMuted" style={{ marginTop: spacing[3] }}>{t('sommeil.alarmSettings.sound.snoozeLabel')}</Text>
        <SegmentedControl
          options={snoozeOptions}
          value={String(alarm.snoozeMin) as '0' | '5' | '9' | '15'}
          onChange={(v) => update({ snoozeMin: Number(v) })}
        />
      </Card>

      <Button label={t('sommeil.alarmSettings.startNightModeCta')} onPress={() => router.push('/sommeil/track')} fullWidth />
      <View style={{ alignItems: 'flex-start' }}>
        <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
