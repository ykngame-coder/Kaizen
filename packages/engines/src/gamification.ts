import type {
  BadgeDefinition,
  BadgeId,
  EarnedBadge,
  ISODateString,
  NutritionEntry,
  NutritionTargets,
} from '@supotsu/core';
import type { EngineResult } from './result';

/**
 * Gamification Engine (Master Prompt P36). Streaks and badges are derived
 * *deterministically* from the user's own data — every badge states the fact
 * that unlocked it, so rewards stay transparent and never a black box (P1).
 * Pure: data in, results out, no persistence.
 */

const DAY_MS = 86_400_000;
const dayKey = (iso: ISODateString): string => iso.slice(0, 10);
const startOfDayUTC = (iso: ISODateString): number => {
  const d = new Date(iso);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

/** Distinct active-day keys from anything carrying a timestamp. */
function activeDayKeys(items: { startedAt: ISODateString }[]): Set<string> {
  return new Set(items.map((i) => dayKey(i.startedAt)));
}

/**
 * Current streak: consecutive calendar days with ≥1 activity, ending today or
 * (if today is still empty) yesterday. A gap of a full day breaks it back to 0.
 */
export function computeStreak(
  activities: { startedAt: ISODateString }[],
  asOf: ISODateString,
): EngineResult<number> {
  const days = activeDayKeys(activities);
  const today = startOfDayUTC(asOf);
  const keyAt = (offsetDays: number): string => new Date(today - offsetDays * DAY_MS).toISOString().slice(0, 10);

  // Anchor: today if active, else yesterday if active, else no live streak.
  let anchor: number;
  if (days.has(keyAt(0))) anchor = 0;
  else if (days.has(keyAt(1))) anchor = 1;
  else {
    return { value: 0, confidence: days.size > 0 ? 'high' : 'to_confirm', sourcesUsed: ['supotsu'], generatedAt: asOf };
  }

  let streak = 0;
  while (days.has(keyAt(anchor + streak))) streak += 1;
  return { value: streak, confidence: 'high', sourcesUsed: ['supotsu'], generatedAt: asOf };
}

/** Full catalogue of badges (shown locked or unlocked in the UI). */
export const BADGE_CATALOG: BadgeDefinition[] = [
  { id: 'first_activity', label: 'Premier pas', description: 'Enregistrer sa première activité.', pillar: 'habits' },
  { id: 'streak_3', label: 'Série de 3', description: '3 jours actifs d’affilée.', pillar: 'habits' },
  { id: 'streak_7', label: 'Série de 7', description: '7 jours actifs d’affilée.', pillar: 'habits' },
  { id: 'streak_30', label: 'Série de 30', description: '30 jours actifs d’affilée.', pillar: 'habits' },
  { id: 'consistency_week', label: 'Semaine régulière', description: '5 jours actifs sur 7.', pillar: 'habits' },
  { id: 'hydration_day', label: 'Bien hydraté', description: 'Atteindre sa cible d’hydratation sur une journée.', pillar: 'nutrition' },
  { id: 'protein_day', label: 'Protéines au top', description: 'Atteindre sa cible de protéines sur une journée.', pillar: 'nutrition' },
  { id: 'early_bird', label: 'Lève-tôt', description: 'Une activité démarrée avant 7 h.', pillar: 'performance' },
];

const BADGE_BY_ID = new Map(BADGE_CATALOG.map((b) => [b.id, b]));

/** Look up a badge definition by id (for rendering the catalogue). */
export function badgeDefinition(id: BadgeId): BadgeDefinition | undefined {
  return BADGE_BY_ID.get(id);
}

function activeDaysWithin(days: Set<string>, asOf: ISODateString, window: number): number {
  const today = startOfDayUTC(asOf);
  let count = 0;
  for (let i = 0; i < window; i += 1) {
    if (days.has(new Date(today - i * DAY_MS).toISOString().slice(0, 10))) count += 1;
  }
  return count;
}

export interface GamificationInput {
  activities: { startedAt: ISODateString }[];
  nutritionEntries?: NutritionEntry[];
  targets?: NutritionTargets;
  asOf: ISODateString;
}

/** Group nutrition entries by calendar day and check if any day met a target. */
function anyDayMeets(
  entries: NutritionEntry[],
  pick: (e: NutritionEntry) => number | undefined,
  target: number,
): boolean {
  if (target <= 0) return false;
  const perDay = new Map<string, number>();
  for (const e of entries) {
    const v = pick(e);
    if (v === undefined) continue;
    perDay.set(dayKey(e.loggedAt), (perDay.get(dayKey(e.loggedAt)) ?? 0) + v);
  }
  for (const total of perDay.values()) if (total >= target) return true;
  return false;
}

/**
 * Evaluate which badges the user has earned from their data, each with the
 * concrete reason it unlocked. Returns them ordered as in the catalogue.
 */
export function evaluateBadges(input: GamificationInput): EarnedBadge[] {
  const { activities, nutritionEntries = [], targets, asOf } = input;
  const days = activeDayKeys(activities);
  const streak = computeStreak(activities, asOf).value;
  const weeklyActive = activeDaysWithin(days, asOf, 7);
  const earned: EarnedBadge[] = [];
  const add = (id: BadgeId, reason: string): void => {
    earned.push({ id, earnedAt: asOf, reason });
  };

  if (activities.length > 0) add('first_activity', 'Première activité enregistrée.');
  if (streak >= 3) add('streak_3', `Série actuelle de ${streak} jours.`);
  if (streak >= 7) add('streak_7', `Série actuelle de ${streak} jours.`);
  if (streak >= 30) add('streak_30', `Série actuelle de ${streak} jours.`);
  if (weeklyActive >= 5) add('consistency_week', `${weeklyActive} jours actifs sur les 7 derniers.`);

  if (targets) {
    if (anyDayMeets(nutritionEntries, (e) => e.hydrationMl, targets.hydrationMl)) {
      add('hydration_day', 'Cible d’hydratation atteinte sur une journée.');
    }
    if (anyDayMeets(nutritionEntries, (e) => e.proteinG, targets.proteinG)) {
      add('protein_day', 'Cible de protéines atteinte sur une journée.');
    }
  }

  if (activities.some((a) => new Date(a.startedAt).getUTCHours() < 7)) {
    add('early_bird', 'Activité démarrée avant 7 h.');
  }

  const order = new Map(BADGE_CATALOG.map((b, i) => [b.id, i]));
  return earned.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}
