import * as Notifications from 'expo-notifications';
import { SchedulableTriggerInputTypes } from 'expo-notifications';
import type { NotificationHost, NotificationPermission, ScheduledNotification } from './notificationHost';

/**
 * Implémentation iOS de `NotificationHost`, sur expo-notifications.
 *
 * Notifications LOCALES uniquement : programmées par l'appareil, elles ne
 * passent pas par les serveurs d'Apple et ne demandent donc ni capacité
 * « Push Notifications » ni clé APNs.
 */

const toPermission = (status: Notifications.PermissionStatus): NotificationPermission =>
  status === 'granted' ? 'granted' : status === 'undetermined' ? 'undetermined' : 'denied';

/** L'instant de déclenchement d'une notification déjà programmée — seuls les déclencheurs à date nous concernent. */
function triggerAt(trigger: Notifications.NotificationTrigger | null): string | null {
  if (!trigger || typeof trigger !== 'object' || !('type' in trigger)) return null;
  if (trigger.type !== 'date') return null;
  const raw = (trigger as { date?: number | string | Date; value?: number }).date ?? (trigger as { value?: number }).value;
  if (raw == null) return null;
  const at = new Date(raw);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

export const notificationHost: NotificationHost = {
  async permission() {
    return toPermission((await Notifications.getPermissionsAsync()).status);
  },
  async requestPermission() {
    // Pas de pastille sur l'icône : un rappel manqué ne doit pas laisser une
    // pastille rouge qu'on ne sait pas faire disparaître.
    const res = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
    return toPermission(res.status);
  },
  async scheduled() {
    const requests = await Notifications.getAllScheduledNotificationsAsync();
    const out: ScheduledNotification[] = [];
    for (const r of requests) {
      const at = triggerAt(r.trigger);
      if (at) out.push({ id: r.identifier, at });
    }
    return out;
  },
  async schedule(n) {
    await Notifications.scheduleNotificationAsync({
      identifier: n.id,
      content: { title: n.title, body: n.body, data: n.data ?? {}, sound: true },
      trigger: { type: SchedulableTriggerInputTypes.DATE, date: new Date(n.at) },
    });
  },
  async cancel(id) {
    await Notifications.cancelScheduledNotificationAsync(id);
  },
};
