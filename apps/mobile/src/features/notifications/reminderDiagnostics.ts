import { useSyncExternalStore } from 'react';
import type { SyncResult } from './reminderScheduler';

/**
 * Ce qu'a fait le dernier recalcul des rappels.
 *
 * Diagnostic temporaire : « je ne reçois rien » a six causes possibles
 * (préférences pas chargées, données en cours de chargement, autorisation,
 * aucune condition remplie, refus d'iOS, exception) et l'écran ne permet d'en
 * distinguer aucune. À retirer quand la cause sera connue et corrigée.
 */
export interface ReminderDiagnostic {
  at: string;
  outcome: 'scheduled' | 'not-ready' | 'loading' | 'not-allowed' | 'error';
  /** Rappels calculés, avant programmation. */
  wanted?: number;
  result?: SyncResult;
  error?: string;
}

let current: ReminderDiagnostic | null = null;
const listeners = new Set<() => void>();

export const reminderDiagnostics = {
  get: (): ReminderDiagnostic | null => current,
  set: (d: ReminderDiagnostic): void => {
    current = d;
    for (const l of listeners) l();
  },
  subscribe: (l: () => void): (() => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

export function useReminderDiagnostic(): ReminderDiagnostic | null {
  return useSyncExternalStore(reminderDiagnostics.subscribe, reminderDiagnostics.get, () => null);
}

/** Une ligne lisible depuis le téléphone : c'est là qu'on lit le résultat. */
export function describeDiagnostic(d: ReminderDiagnostic): string {
  const time = new Date(d.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  switch (d.outcome) {
    case 'not-ready':
      return `${time} · préférences pas encore chargées`;
    case 'loading':
      return `${time} · données en cours de chargement`;
    case 'not-allowed':
      return `${time} · aucun rappel activé, ou autorisation absente`;
    case 'error':
      return `${time} · erreur : ${d.error ?? '?'}`;
    default:
      return `${time} · ${d.wanted ?? 0} calculés → ${d.result?.scheduled ?? 0} programmés, ${d.result?.kept ?? 0} conservés, ${d.result?.failed ?? 0} échecs`;
  }
}
