import React, { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Card, FilterChip, Text, Toggle, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import type { ReminderKind, ReminderSettings } from '@supotsu/engines';
import { usePreferences } from '@/lib/preferences';
import { notificationHost } from './notificationHost';
import { REMINDER_ID_PREFIX } from './reminderScheduler';
import { TimeWheelSheet } from './TimeWheelSheet';

const HYDRATION_INTERVALS = [2, 3, 4, 5, 6];

/**
 * Réglage des rappels locaux, en haut de l'écran Notifications — c'est là
 * qu'on vient les chercher.
 *
 * L'autorisation iOS est demandée à la PREMIÈRE activation, jamais au
 * lancement : une demande sans contexte se fait refuser, et un refus est
 * définitif tant qu'on ne passe pas par les réglages du système.
 */
export function ReminderSettingsCard(): React.JSX.Element | null {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { preferences, setPreference } = usePreferences();
  const settings = preferences.reminderSettings;
  const [denied, setDenied] = useState(false);
  const [editing, setEditing] = useState<'habits' | 'session' | null>(null);
  const [status, setStatus] = useState<{ count: number; next: string | null } | null>(null);

  // Diagnostic : sans lui, « je ne reçois rien » ne dit pas si le rappel n'a
  // pas été programmé, ou s'il l'a été et n'est pas encore tombé.
  const refreshStatus = async (): Promise<void> => {
    const perm = await notificationHost.permission();
    setDenied(perm === 'denied');
    const mine = (await notificationHost.scheduled())
      .filter((n) => n.id.startsWith(`${REMINDER_ID_PREFIX}:`))
      .sort((a, b) => a.at.localeCompare(b.at));
    setStatus({ count: mine.length, next: mine[0]?.at ?? null });
  };

  useEffect(() => {
    void refreshStatus();
    // La programmation elle-même est différée de quelques centaines de
    // millisecondes (regroupement) : sans cette seconde lecture, la ligne
    // afficherait l'état d'avant le changement qu'on vient de faire.
    const later = setTimeout(() => void refreshStatus(), 1500);
    return () => clearTimeout(later);
  }, [settings]);

  // Hors iOS, aucune notification locale : mieux vaut ne rien montrer que des
  // interrupteurs sans effet.
  if (Platform.OS !== 'ios') return null;

  const update = (patch: Partial<ReminderSettings>): void => setPreference('reminderSettings', { ...settings, ...patch });

  const toggle = async (kind: ReminderKind, enabled: boolean): Promise<void> => {
    if (enabled) {
      const current = await notificationHost.permission();
      const granted = current === 'granted' ? current : await notificationHost.requestPermission();
      if (granted !== 'granted') {
        setDenied(true);
        return;
      }
      setDenied(false);
    }
    update({ [kind]: { ...settings[kind], enabled } } as Partial<ReminderSettings>);
  };

  const Row = ({ kind, detail, onPressDetail }: { kind: ReminderKind; detail: string; onPressDetail?: () => void }): React.JSX.Element => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[2] }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="body" style={{ fontWeight: '600' }}>{t(`notifications.reminders.${kind}.label`)}</Text>
        {onPressDetail && settings[kind].enabled ? (
          <Pressable onPress={onPressDetail} hitSlop={6}>
            <Text variant="caption" color="primary">{detail}</Text>
          </Pressable>
        ) : (
          <Text variant="caption" color="textSubtle">{detail}</Text>
        )}
      </View>
      <Toggle value={settings[kind].enabled} onValueChange={(v) => void toggle(kind, v)} disabled={denied} />
    </View>
  );

  return (
    <Card>
      <Text variant="heading">{t('notifications.reminders.title')}</Text>
      <Text variant="caption" color="textMuted" style={{ marginTop: spacing[1] }}>
        {t('notifications.reminders.subtitle')}
      </Text>

      {denied ? (
        <Pressable onPress={() => void Linking.openSettings()} style={{ marginTop: spacing[3] }}>
          <Text variant="caption" style={{ color: colors.warning }}>{t('notifications.reminders.denied')}</Text>
        </Pressable>
      ) : null}

      <View style={{ marginTop: spacing[2] }}>
        <Row kind="habits" detail={t('notifications.reminders.atTime', { time: settings.habits.time })} onPressDetail={() => setEditing('habits')} />
        <Row kind="bedtime" detail={t('notifications.reminders.bedtime.detail', { minutes: settings.bedtime.offsetMin })} />
        <Row kind="session" detail={t('notifications.reminders.atTime', { time: settings.session.time })} onPressDetail={() => setEditing('session')} />
        <Row kind="hydration" detail={t('notifications.reminders.hydration.detail', { hours: settings.hydration.intervalH })} />
        {settings.hydration.enabled ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], paddingBottom: spacing[2] }}>
            {HYDRATION_INTERVALS.map((h) => (
              <FilterChip
                key={h}
                label={t('notifications.reminders.hydration.every', { hours: h })}
                active={settings.hydration.intervalH === h}
                onPress={() => update({ hydration: { ...settings.hydration, intervalH: h } })}
              />
            ))}
          </View>
        ) : null}
      </View>

      {status ? (
        <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[2] }}>
          {status.count === 0
            ? t('notifications.reminders.status.none')
            : t('notifications.reminders.status.next', {
                count: status.count,
                when: status.next
                  ? new Date(status.next).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })
                  : '',
              })}
        </Text>
      ) : null}

      <TimeWheelSheet
        visible={editing !== null}
        title={editing ? t(`notifications.reminders.${editing}.label`) : ''}
        value={editing ? settings[editing].time : '20:30'}
        onClose={() => setEditing(null)}
        onConfirm={(time) => {
          if (editing) update({ [editing]: { ...settings[editing], time } } as Partial<ReminderSettings>);
          setEditing(null);
        }}
      />
    </Card>
  );
}
