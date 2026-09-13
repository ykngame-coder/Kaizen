import type { ImportedHealthMetric, ImportedSleepSession } from '@supotsu/connectors';

export interface SyncWindow {
  /** Début de la lecture HealthKit : minuit local, un jour AVANT `keepFrom`. */
  since: Date;
  /** Premier instant dont les totaux journaliers sont écrits : minuit local. */
  keepFrom: Date;
}

/**
 * La fenêtre d'une synchro de `days` jours, aujourd'hui compris.
 *
 * Alignée sur minuit, avec un jour de marge lu mais jamais écrit. Sans cela,
 * une fenêtre qui commence « il y a 7 × 24 h » tombe au milieu d'une journée :
 * le premier jour ne voit qu'une partie de ses pas, et une nuit commencée la
 * veille au soir n'est lue qu'à moitié. Or pas et durée de sommeil sont des
 * totaux par jour qui ÉCRASENT la valeur enregistrée — chaque synchro aurait
 * rogné le total du plus ancien jour de la fenêtre.
 *
 * Calculée par composantes locales, pas en millisecondes : la nuit d'un
 * changement d'heure, un jour ne dure pas 24 h.
 */
export function syncWindow(days: number, now: Date = new Date()): SyncWindow {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  return {
    since: new Date(y, m, d - days, 0, 0, 0, 0),
    keepFrom: new Date(y, m, d - (days - 1), 0, 0, 0, 0),
  };
}

/** Totaux journaliers : les seuls qu'un jour incomplet pourrait corrompre. */
const DAY_TOTAL_TYPES = new Set<string>(['sleep_duration', 'steps']);

/**
 * Retire ce que le jour de marge a produit : les totaux journaliers datés
 * d'avant `keepFrom`, et les sessions de sommeil terminées avant — une nuit
 * qui chevauche le début de la lecture n'a été vue qu'en partie.
 *
 * Les mesures ponctuelles (poids, fréquence cardiaque…) et les activités
 * restent : elles sont complètes, et leur import ignore les doublons.
 */
export function trimToWindow<T extends { healthMetrics: ImportedHealthMetric[]; sleepSessions: ImportedSleepSession[] }>(
  result: T,
  keepFrom: Date,
): T {
  const from = keepFrom.getTime();
  return {
    ...result,
    healthMetrics: result.healthMetrics.filter((h) => !DAY_TOTAL_TYPES.has(h.type) || new Date(h.measuredAt).getTime() >= from),
    sleepSessions: result.sleepSessions.filter((s) => new Date(s.endedAt).getTime() >= from),
  };
}
