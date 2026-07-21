import type { DataSource, ISODateString, OwnedEntity } from './common';

/** When in the day an intake happened (Master Prompt P11 nutrition pillar). */
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

/**
 * A single logged intake. One row per entry so a day's history is additive and
 * never overwritten, and each entry keeps its provenance (manual vs imported).
 * Macros are optional: a quick log can carry only kcal, a precise one all four.
 */
export interface NutritionEntry extends OwnedEntity {
  mealType: MealType;
  description: string;
  kcal: number;
  proteinG?: number;
  carbG?: number;
  fatG?: number;
  /** Water for this entry, in millilitres (hydration is part of nutrition). */
  hydrationMl?: number;
  source: DataSource;
  loggedAt: ISODateString;
}

/**
 * Daily nutrition targets. Estimated from the athlete profile, so they carry a
 * reduced confidence and are always shown as adjustable (never a black box).
 */
export interface NutritionTargets {
  kcal: number;
  proteinG: number;
  hydrationMl: number;
}
