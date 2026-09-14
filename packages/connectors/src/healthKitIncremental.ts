import { aggregateHealthKitSleep, aggregateHealthKitSleepSessions, type HKSleepSample } from './appleHealth';
import type { ImportedHealthMetric, ImportedSleepSession } from './types';

/**
 * Calculs purs de la synchro Santé incrémentale : à partir de ce que Santé
 * signale comme AJOUTÉ depuis la dernière ancre, décider quels jours et quelles
 * nuits relire en entier. Pas et nuits sont des totaux — une donnée nouvelle
 * oblige à recalculer tout son jour, pas seulement elle.
 *
 * Voir docs/superpowers/specs/2026-09-13-synchro-sante-ancree-design.md.
 */

export interface TimeInterval {
  startDate: string;
  endDate: string;
}

const localKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const fromKey = (key: string, hour = 0): Date => {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, hour, 0, 0, 0);
};

const isMidnight = (d: Date): boolean =>
  d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0;

/**
 * Jours LOCAUX touchés par des intervalles. Un intervalle à cheval sur minuit
 * en touche deux ; un intervalle qui finit pile à minuit n'appartient pas au
 * lendemain. Parcours par composantes locales : un jour de changement d'heure
 * ne dure pas 24 h.
 */
export function touchedDayKeys(intervals: TimeInterval[]): string[] {
  const keys = new Set<string>();
  for (const i of intervals) {
    const start = new Date(i.startDate);
    const end = new Date(i.endDate);
    const last = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 12);
    if (end.getTime() > start.getTime() && isMidnight(end)) last.setDate(last.getDate() - 1);
    const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12);
    keys.add(localKey(cur));
    while (cur.getTime() < last.getTime()) {
      cur.setDate(cur.getDate() + 1);
      keys.add(localKey(cur));
    }
  }
  return [...keys].sort();
}

/** De minuit du premier jour à minuit après le dernier — la fenêtre à demander à Santé. */
export function dayKeysRange(keys: string[]): { from: Date; to: Date } {
  const sorted = [...keys].sort();
  const to = fromKey(sorted[sorted.length - 1]!);
  to.setDate(to.getDate() + 1);
  return { from: fromKey(sorted[0]!), to };
}

/**
 * Marge de relecture autour des échantillons de sommeil ajoutés. Assez large
 * pour contenir la nuit entière même quand une montre l'envoie par morceaux sur
 * plusieurs synchros ; rien ne dort 36 h d'affilée.
 */
export const SLEEP_REREAD_MARGIN_MS = 36 * 60 * 60 * 1000;

export function sleepRereadWindow(added: TimeInterval[]): { from: Date; to: Date } | null {
  if (added.length === 0) return null;
  const starts = added.map((a) => new Date(a.startDate).getTime());
  const ends = added.map((a) => new Date(a.endDate).getTime());
  return {
    from: new Date(Math.min(...starts) - SLEEP_REREAD_MARGIN_MS),
    to: new Date(Math.max(...ends) + SLEEP_REREAD_MARGIN_MS),
  };
}

const overlaps = (s: ImportedSleepSession, a: TimeInterval): boolean =>
  new Date(s.startedAt).getTime() < new Date(a.endDate).getTime() &&
  new Date(a.startDate).getTime() < new Date(s.endedAt).getTime();

/**
 * Ce qu'une relecture de sommeil doit écrire.
 *
 * - `sessions` : les sessions qui contiennent au moins un échantillon ajouté —
 *   les autres de la fenêtre n'ont pas changé.
 * - `durations` : la durée des jours de réveil de ces sessions, calculée sur
 *   TOUTES les sessions de ce jour (une sieste non touchée compte toujours), et
 *   seulement pour un jour que la fenêtre couvre entièrement — de la veille à
 *   midi au lendemain minuit. Sinon on écraserait sa durée avec une vue partielle.
 * - `replace` : l'étendue des sessions touchées, pour supprimer l'ancienne
 *   découpe d'une nuit arrivée par morceaux.
 */
export function recomputeSleep(
  windowSamples: HKSleepSample[],
  added: TimeInterval[],
  window: { from: Date; to: Date },
): { sessions: ImportedSleepSession[]; durations: ImportedHealthMetric[]; replace: { from: string; to: string } | null } {
  const sessions = aggregateHealthKitSleepSessions(windowSamples).filter((s) => added.some((a) => overlaps(s, a)));
  if (sessions.length === 0) return { sessions: [], durations: [], replace: null };

  const wakeDays = new Set(sessions.map((s) => localKey(new Date(s.endedAt))));
  const covered = (key: string): boolean => {
    const dayBeforeNoon = fromKey(key, 12);
    dayBeforeNoon.setDate(dayBeforeNoon.getDate() - 1);
    const nextMidnight = fromKey(key);
    nextMidnight.setDate(nextMidnight.getDate() + 1);
    return window.from.getTime() <= dayBeforeNoon.getTime() && window.to.getTime() >= nextMidnight.getTime();
  };
  const durations = aggregateHealthKitSleep(windowSamples).filter((m) => {
    const key = localKey(new Date(m.measuredAt));
    return wakeDays.has(key) && covered(key);
  });

  const from = Math.min(...sessions.map((s) => new Date(s.startedAt).getTime()));
  const to = Math.max(...sessions.map((s) => new Date(s.endedAt).getTime())) + 1;
  return { sessions, durations, replace: { from: new Date(from).toISOString(), to: new Date(to).toISOString() } };
}
