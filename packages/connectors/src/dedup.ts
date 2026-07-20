import type { ImportedActivity } from './types';

/** Minimal shape needed to detect an existing duplicate. */
export interface ExistingActivityKey {
  type: string;
  startedAt: string;
  durationSec: number;
}

const day = (iso: string): string => iso.slice(0, 10);

/**
 * Drop incoming activities that duplicate something already stored — the same
 * session synced from several sources (Garmin + Strava + Watch) must not be
 * triple-counted (Master Prompt P9.8, P38.8). Match on type + day + close
 * duration (±10 % or 120 s).
 */
export function dedupActivities(
  existing: ExistingActivityKey[],
  incoming: ImportedActivity[],
): ImportedActivity[] {
  const isDuplicate = (a: ImportedActivity): boolean =>
    existing.some((e) => {
      if (e.type !== a.type || day(e.startedAt) !== day(a.startedAt)) return false;
      const tolerance = Math.max(120, a.durationSec * 0.1);
      return Math.abs(e.durationSec - a.durationSec) <= tolerance;
    });

  // Also dedupe within the incoming batch itself.
  const kept: ImportedActivity[] = [];
  for (const a of incoming) {
    if (isDuplicate(a)) continue;
    const clashesKept = kept.some(
      (k) =>
        k.type === a.type &&
        day(k.startedAt) === day(a.startedAt) &&
        Math.abs(k.durationSec - a.durationSec) <= Math.max(120, a.durationSec * 0.1),
    );
    if (!clashesKept) kept.push(a);
  }
  return kept;
}
