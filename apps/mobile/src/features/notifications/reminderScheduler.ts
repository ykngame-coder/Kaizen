import type { PlannedReminder } from '@supotsu/engines';
import type { NotificationHost, ReminderTextFor } from './notificationHost';

/** Préfixe de nos identifiants : tout le reste appartient à quelqu'un d'autre et n'est jamais touché. */
export const REMINDER_ID_PREFIX = 'supotsu';

export interface SyncResult {
  scheduled: number;
  cancelled: number;
  kept: number;
  failed: number;
}

/**
 * Aligne ce qui est programmé sur iOS avec ce qui devrait l'être.
 *
 * Ce qui est déjà correct est laissé INTACT : tout reprogrammer à chaque
 * ouverture de l'app ferait vibrer l'appareil sans raison sur certaines
 * versions d'iOS et perdrait l'ordre des notifications déjà en file.
 */
export async function syncReminders(
  host: NotificationHost,
  wanted: PlannedReminder[],
  textFor: ReminderTextFor,
): Promise<SyncResult> {
  const byId = new Map(wanted.map((r) => [`${REMINDER_ID_PREFIX}:${r.id}`, r]));
  const existing = (await host.scheduled()).filter((n) => n.id.startsWith(`${REMINDER_ID_PREFIX}:`));
  const result: SyncResult = { scheduled: 0, cancelled: 0, kept: 0, failed: 0 };

  const upToDate = new Set<string>();
  for (const n of existing) {
    const want = byId.get(n.id);
    if (want && new Date(want.at).getTime() === new Date(n.at).getTime()) {
      upToDate.add(n.id);
      result.kept += 1;
      continue;
    }
    await host.cancel(n.id);
    result.cancelled += 1;
  }

  for (const [id, reminder] of byId) {
    if (upToDate.has(id)) continue;
    const { title, body } = textFor(reminder);
    try {
      await host.schedule({ id, at: reminder.at, title, body, data: { kind: reminder.kind, ...reminder.params } });
      result.scheduled += 1;
    } catch {
      // Un rappel refusé (file pleine, autorisation retirée) ne doit pas
      // empêcher les suivants : c'est un confort, pas une donnée.
      result.failed += 1;
    }
  }
  return result;
}
