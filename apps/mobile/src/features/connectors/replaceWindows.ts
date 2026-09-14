import type { ImportedHealthMetric, ImportedSleepSession } from '@supotsu/connectors';
import type { ReplaceKind, ReplaceWindow } from '@/lib/data/repository';

/**
 * Les types que la synchro Santé produit, donc qu'une relecture complète peut
 * remplacer. Un type absent de cette liste (saisi à la main, importé d'un
 * fichier…) n'est jamais touché.
 */
export const FULL_REPLACE_KINDS: readonly ReplaceKind[] = [
  'sleep_session',
  'sleep_duration',
  'steps',
  'hrv',
  'resting_heart_rate',
  'weight',
  'body_fat',
  'muscle_mass',
];

const SOURCE = 'apple_health';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Une fenêtre de remplacement par type présent dans une relecture complète :
 * de sa donnée la plus ancienne jusqu'à demain (une mesure datée de quelques
 * minutes dans le futur par une montre mal réglée reste dedans).
 *
 * Aucune fenêtre pour un type revenu vide : c'est le garde-fou contre une
 * permission retirée, que Santé ne signale pas.
 */
export function fullReplaceWindows(
  result: { healthMetrics: ImportedHealthMetric[]; sleepSessions: ImportedSleepSession[] },
  now: Date,
): ReplaceWindow[] {
  const to = new Date(now.getTime() + DAY_MS).toISOString();
  const windows: ReplaceWindow[] = [];
  for (const kind of FULL_REPLACE_KINDS) {
    const ats =
      kind === 'sleep_session'
        ? result.sleepSessions.filter((s) => s.source === SOURCE).map((s) => s.startedAt)
        : result.healthMetrics.filter((m) => m.source === SOURCE && m.type === kind).map((m) => m.measuredAt);
    if (ats.length === 0) continue;
    const from = new Date(Math.min(...ats.map((a) => new Date(a).getTime()))).toISOString();
    windows.push({ kind, from, to });
  }
  return windows;
}
