import type { ImportedActivity } from './types';

/** Minimal shape needed to detect an existing duplicate. */
export interface ExistingActivityKey {
  type: string;
  startedAt: string;
  durationSec: number;
}

/**
 * Écart de départ toléré entre deux vues d'une MÊME séance. Deux sources ne
 * datent jamais le même effort à la seconde près — le téléphone démarre à
 * l'appui, la montre à la détection — mais elles ne s'écartent pas de dix
 * minutes non plus.
 */
const SAME_SESSION_START_TOLERANCE_MS = 10 * 60 * 1000;

const startsTogether = (a: string, b: string): boolean =>
  Math.abs(new Date(a).getTime() - new Date(b).getTime()) <= SAME_SESSION_START_TOLERANCE_MS;

const sameDuration = (a: number, b: number): boolean => Math.abs(a - b) <= Math.max(120, b * 0.1);

/**
 * Drop incoming activities that duplicate something already stored — the same
 * session synced from several sources (Garmin + Strava + Watch) must not be
 * triple-counted (Master Prompt P9.8, P38.8).
 *
 * A duplicate is the same session seen twice, so the start times must overlap:
 * same type, starts within ten minutes, and a close duration.
 *
 * The criterion used to be "same type + same UTC day + close duration", which
 * threw away real data — two 30-minute runs on the same day, one in the morning
 * and one in the evening, are two sessions, and the second was deleted. Keying
 * on the UTC day made it worse near midnight.
 */
export function dedupActivities(
  existing: ExistingActivityKey[],
  incoming: ImportedActivity[],
): ImportedActivity[] {
  const isDuplicate = (a: ImportedActivity): boolean =>
    existing.some(
      (e) => e.type === a.type && startsTogether(e.startedAt, a.startedAt) && sameDuration(e.durationSec, a.durationSec),
    );

  // Also dedupe within the incoming batch itself.
  const kept: ImportedActivity[] = [];
  for (const a of incoming) {
    if (isDuplicate(a)) continue;
    const clashesKept = kept.some(
      (k) => k.type === a.type && startsTogether(k.startedAt, a.startedAt) && sameDuration(k.durationSec, a.durationSec),
    );
    if (!clashesKept) kept.push(a);
  }
  return kept;
}
