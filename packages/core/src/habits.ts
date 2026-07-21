import type { ISODateString, OwnedEntity, Pillar } from './common';

/** How often a habit is expected to be honoured (Master Prompt P12 habits pillar). */
export type HabitCadence = 'daily' | 'weekly';

/**
 * A habit the user commits to (e.g. "boire 2L d'eau", "10 min mobilité"). Tied
 * to a pillar so progress feeds the right part of the picture.
 */
export interface Habit extends OwnedEntity {
  name: string;
  pillar: Pillar;
  cadence: HabitCadence;
  /** Target occurrences per cadence period (e.g. 1/day, 3/week). */
  targetPerPeriod: number;
  archivedAt?: ISODateString;
}

/** One completion of a habit. History is additive (one row per completion). */
export interface HabitLog extends OwnedEntity {
  habitId: string;
  completedAt: ISODateString;
}

/**
 * A gamification badge. Badges are *earned deterministically* from the user's
 * own data by the gamification engine — every badge can explain why it was
 * unlocked, so the reward system is transparent, not a black box (P1, P36).
 */
export type BadgeId =
  | 'first_activity'
  | 'streak_3'
  | 'streak_7'
  | 'streak_30'
  | 'consistency_week'
  | 'hydration_day'
  | 'protein_day'
  | 'early_bird';

export interface BadgeDefinition {
  id: BadgeId;
  label: string;
  description: string;
  pillar: Pillar;
}

/** A badge the user has unlocked, with when and the fact that justified it. */
export interface EarnedBadge {
  id: BadgeId;
  earnedAt: ISODateString;
  reason: string;
}
