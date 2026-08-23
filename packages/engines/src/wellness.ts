import type { Confidence, ISODateString, WellnessCheckin } from '@supotsu/core';
import type { EngineResult, Explanation } from './result';

/**
 * Wellness Engine (Master Prompt P14 bien-être mental). Turns subjective daily
 * check-ins (mood / energy / stress) into a Wellness Index and a streak. Pure —
 * check-ins in, results out. Kept separate from the physiological Recovery
 * Engine: this is how the user *feels*, never inferred from sensors.
 */

const DAY_MS = 86_400_000;

/** Local calendar day key (YYYY-MM-DD) for a timestamp. */
function dayKey(iso: ISODateString): string {
  return iso.slice(0, 10);
}

/** Map a 1–5 rating to 0–100 (1 ⇒ 0, 5 ⇒ 100). */
function scale(rating: number): number {
  return ((Math.max(1, Math.min(5, rating)) - 1) / 4) * 100;
}

/** The most recent check-in at or before `asOf`, or undefined. */
export function latestCheckin(
  checkins: WellnessCheckin[],
  asOf: ISODateString,
): WellnessCheckin | undefined {
  const now = new Date(asOf).getTime();
  return checkins
    .filter((c) => new Date(c.checkedAt).getTime() <= now)
    .sort((a, b) => b.checkedAt.localeCompare(a.checkedAt))[0];
}

/**
 * Wellness Index 0-100 from the latest check-in: mood and energy raise it,
 * perceived stress lowers it (inverted). Confidence is medium on a single
 * check-in, high once a few days back it up.
 */
export function computeWellnessIndex(
  checkins: WellnessCheckin[],
  asOf: ISODateString,
): EngineResult<number> {
  const latest = latestCheckin(checkins, asOf);
  if (!latest) {
    return { value: 0, confidence: 'to_confirm', sourcesUsed: ['manual'], generatedAt: asOf };
  }
  const value = Math.round(
    scale(latest.mood) * 0.4 + scale(latest.energy) * 0.3 + (100 - scale(latest.stress)) * 0.3,
  );
  const recent = checkins.filter(
    (c) => new Date(asOf).getTime() - new Date(c.checkedAt).getTime() < 7 * DAY_MS,
  );
  const confidence: Confidence = recent.length >= 3 ? 'high' : 'medium';
  return { value, confidence, sourcesUsed: ['manual'], generatedAt: asOf };
}

/** Consecutive days (ending at `asOf`) with at least one check-in. */
export function wellnessStreak(checkins: WellnessCheckin[], asOf: ISODateString): number {
  const days = new Set(checkins.map((c) => dayKey(c.checkedAt)));
  let streak = 0;
  const cursor = new Date(`${dayKey(asOf)}T12:00:00.000Z`);
  // Allow the streak to start today or yesterday (today may not be logged yet).
  if (!days.has(dayKey(cursor.toISOString()))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  while (days.has(dayKey(cursor.toISOString()))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export type WellnessBand = 'rayonnant' | 'stable' | 'fragile' | 'difficile';

export function wellnessBand(index: number): WellnessBand {
  if (index >= 80) return 'rayonnant';
  if (index >= 60) return 'stable';
  if (index >= 40) return 'fragile';
  return 'difficile';
}

/** Explainable wellness note, or undefined when no check-in exists yet. */
export function wellnessExplanation(
  checkins: WellnessCheckin[],
  asOf: ISODateString,
): Explanation | undefined {
  const latest = latestCheckin(checkins, asOf);
  if (!latest) return undefined;
  const index = computeWellnessIndex(checkins, asOf).value;
  const band = wellnessBand(index);
  const actionKey: Record<WellnessBand, string> = {
    rayonnant: 'engines.wellness.action.rayonnant',
    stable: 'engines.wellness.action.stable',
    fragile: 'engines.wellness.action.fragile',
    difficile: 'engines.wellness.action.difficile',
  };
  return {
    observation: { key: `engines.wellness.observation.${band}`, params: { index } },
    analysis: { key: 'engines.wellness.analysis' },
    action: { key: actionKey[band] },
  };
}
