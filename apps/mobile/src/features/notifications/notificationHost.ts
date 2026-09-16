import type { PlannedReminder } from '@supotsu/engines';

/**
 * iOS tel que le voit le programmateur de rappels. Une interface plutôt que
 * des appels directs : le build local ne fonctionne pas, et la règle « ne
 * jamais toucher une notification qui n'est pas la nôtre » doit être prouvée
 * par un test.
 *
 * Implémentation réelle : `notificationHost.ios.ts`.
 */

export type NotificationPermission = 'granted' | 'denied' | 'undetermined';

export interface ScheduledNotification {
  id: string;
  /** Instant de déclenchement, en ISO. */
  at: string;
}

export interface NotificationToSchedule extends ScheduledNotification {
  title: string;
  body: string;
  /** Emporté par la notification : sert à ouvrir le bon écran quand on la touche. */
  data?: Record<string, unknown>;
}

export interface NotificationHost {
  permission(): Promise<NotificationPermission>;
  requestPermission(): Promise<NotificationPermission>;
  /** Tout ce qui est programmé, y compris ce qui ne vient pas de nous. */
  scheduled(): Promise<ScheduledNotification[]>;
  schedule(notification: NotificationToSchedule): Promise<void>;
  cancel(id: string): Promise<void>;
}

/** Le texte d'un rappel, composé par l'app (traductions). */
export type ReminderTextFor = (reminder: PlannedReminder) => { title: string; body: string };

const unavailable = (): never => {
  throw new Error('Les notifications locales ne sont disponibles que sur iOS (build natif).');
};

/** Bouchon web / Android : aucune notification, aucune autorisation. */
export const notificationHost: NotificationHost = {
  permission: async () => 'denied',
  requestPermission: async () => 'denied',
  scheduled: async () => [],
  schedule: async () => unavailable(),
  cancel: async () => unavailable(),
};
