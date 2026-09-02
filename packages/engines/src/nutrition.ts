import type { Confidence, ISODateString, NutritionEntry, NutritionTargets } from '@supotsu/core';
import type { EngineResult, Explanation } from './result';

/**
 * Nutrition Engine (Master Prompt P11). Pure functions: intake entries in,
 * provenance-aware, explainable results out. It never stores or fetches.
 * Health before performance — protein sufficiency and hydration are weighted as
 * heavily as calories, and targets are always presented as estimates to adjust.
 */

const clamp = (n: number, min = 0, max = 100): number => Math.max(min, Math.min(max, n));

/**
 * Whole-day bounds [start, end) for the calendar day of `asOf`, in the
 * device's local timezone — not UTC. Entries are logged from a phone at the
 * user's actual location, so "today" must mean their local calendar day: a
 * UTC-based cutoff misfiles anything logged in the first few hours after
 * local midnight into the previous day for any positive-UTC-offset timezone
 * (e.g. Europe), silently dropping it from "today"'s totals.
 */
function dayBounds(asOf: ISODateString): [number, number] {
  const d = new Date(asOf);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return [start, start + 86_400_000];
}

/** Entries logged on the same calendar day as `asOf`. */
export function entriesForDay(entries: NutritionEntry[], asOf: ISODateString): NutritionEntry[] {
  const [start, end] = dayBounds(asOf);
  return entries.filter((e) => {
    const t = new Date(e.loggedAt).getTime();
    return t >= start && t < end;
  });
}

export interface MacroGoals {
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
}

const KCAL_PER_G: Record<'proteinG' | 'carbG' | 'fatG', number> = { proteinG: 4, carbG: 4, fatG: 9 };
const MACRO_KEYS = ['proteinG', 'carbG', 'fatG'] as const;

/**
 * Adjust one macro (or the overall calorie target) while keeping the three
 * macros' calories summed to the kcal target — "linked to reach 100% of
 * intake" rather than three independent numbers that can drift apart.
 *
 * - Editing `kcal` rescales all three macros proportionally, preserving
 *   their current split.
 * - Editing one macro fixes it at the new value and redistributes the
 *   remaining calories across the other two, preserving *their* existing
 *   ratio to each other (so nudging protein up mostly eats into whichever
 *   of carbs/fat was already the bigger share, not a blind 50/50 split).
 */
export function rebalanceMacros(
  current: MacroGoals,
  changed: 'kcal' | 'proteinG' | 'carbG' | 'fatG',
  newValue: number,
): MacroGoals {
  if (changed === 'kcal') {
    const kcal = Math.max(800, Math.round(newValue));
    const totalKcalNow = current.proteinG * 4 + current.carbG * 4 + current.fatG * 9;
    if (totalKcalNow <= 0) return { ...current, kcal };
    const scale = kcal / totalKcalNow;
    return {
      kcal,
      proteinG: Math.max(0, Math.round(current.proteinG * scale)),
      carbG: Math.max(0, Math.round(current.carbG * scale)),
      fatG: Math.max(0, Math.round(current.fatG * scale)),
    };
  }

  const fixedG = Math.max(0, Math.round(newValue));
  const fixedKcal = fixedG * KCAL_PER_G[changed];
  const [a, b] = MACRO_KEYS.filter((k) => k !== changed) as ['proteinG' | 'carbG' | 'fatG', 'proteinG' | 'carbG' | 'fatG'];
  const aKcalOld = current[a] * KCAL_PER_G[a];
  const bKcalOld = current[b] * KCAL_PER_G[b];
  const otherTotalOld = aKcalOld + bKcalOld;
  const remaining = Math.max(0, current.kcal - fixedKcal);
  const aRatio = otherTotalOld > 0 ? aKcalOld / otherTotalOld : 0.5;
  const aKcalNew = remaining * aRatio;
  const bKcalNew = remaining - aKcalNew;

  const result: MacroGoals = { kcal: current.kcal, proteinG: current.proteinG, carbG: current.carbG, fatG: current.fatG };
  result[changed] = fixedG;
  result[a] = Math.max(0, Math.round(aKcalNew / KCAL_PER_G[a]));
  result[b] = Math.max(0, Math.round(bKcalNew / KCAL_PER_G[b]));
  return result;
}

/**
 * A pure water log (the "+250 ml" etc. buttons on the hydration card) — 0
 * kcal, no macros, some hydrationMl. These are already represented by the
 * hydration card's own total; the meal list (grouped by mealType) should
 * skip them instead of piling up a fresh "Eau" row under Collation for
 * every tap.
 */
export function isHydrationOnlyEntry(e: NutritionEntry): boolean {
  return e.kcal === 0 && (e.hydrationMl ?? 0) > 0 && !e.proteinG && !e.carbG && !e.fatG;
}

export interface DailyNutritionTotals {
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
  hydrationMl: number;
}

/** Sum a day's intake across all logged entries. */
export function sumDay(entries: NutritionEntry[], asOf: ISODateString): DailyNutritionTotals {
  return entriesForDay(entries, asOf).reduce<DailyNutritionTotals>(
    (acc, e) => ({
      kcal: acc.kcal + e.kcal,
      proteinG: acc.proteinG + (e.proteinG ?? 0),
      carbG: acc.carbG + (e.carbG ?? 0),
      fatG: acc.fatG + (e.fatG ?? 0),
      hydrationMl: acc.hydrationMl + (e.hydrationMl ?? 0),
    }),
    { kcal: 0, proteinG: 0, carbG: 0, fatG: 0, hydrationMl: 0 },
  );
}

export interface TargetInputs {
  weightKg?: number;
  /** A body-composition goal raises protein and trims the calorie estimate. */
  goal?: 'body_composition' | 'performance' | 'health';
}

/**
 * Estimate daily targets from bodyweight and goal. Deliberately simple and
 * transparent (protein 1.6–2.0 g/kg, hydration 35 ml/kg, kcal from a light
 * activity factor). Confidence is always `to_confirm` — these are estimates the
 * user should refine, never authoritative prescriptions.
 */
export function estimateTargets(inputs: TargetInputs, asOf: ISODateString): EngineResult<NutritionTargets> {
  const weight = inputs.weightKg;
  if (!weight) {
    // Reasonable defaults so the UI still works before a weight is known.
    return {
      value: { kcal: 2200, proteinG: 110, hydrationMl: 2500 },
      confidence: 'to_confirm',
      explanation: {
        observation: { key: 'engines.nutrition.noWeight.observation' },
        analysis: { key: 'engines.nutrition.noWeight.analysis' },
        action: { key: 'engines.nutrition.noWeight.action' },
      },
      sourcesUsed: ['manual'],
      generatedAt: asOf,
    };
  }
  const proteinPerKg = inputs.goal === 'body_composition' ? 2.0 : inputs.goal === 'performance' ? 1.8 : 1.6;
  const kcalFactor = inputs.goal === 'body_composition' ? 28 : 33;
  return {
    value: {
      kcal: Math.round(weight * kcalFactor),
      proteinG: Math.round(weight * proteinPerKg),
      hydrationMl: Math.round(weight * 35),
    },
    confidence: 'to_confirm',
    explanation: {
      observation: inputs.goal
        ? { key: 'engines.nutrition.targets.observationWithGoal', params: { weight, goal: inputs.goal } }
        : { key: 'engines.nutrition.targets.observation', params: { weight } },
      analysis: { key: 'engines.nutrition.targets.analysis' },
      action: { key: 'engines.nutrition.targets.action' },
    },
    sourcesUsed: ['manual'],
    generatedAt: asOf,
  };
}

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';

const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export interface DeficitCalcInputs {
  age: number;
  sex: 'male' | 'female';
  heightCm: number;
  weightKg: number;
  goalWeightKg: number;
  /** How long to reach the goal weight, in months. */
  durationMonths: number;
  activity: ActivityLevel;
}

export interface DeficitCalcResult {
  bmr: number;
  tdee: number;
  /** Positive = calorie deficit (losing weight), negative = surplus (gaining). */
  dailyDeficit: number;
  targetKcal: number;
}

/** ~7700 kcal stored per kg of body fat — the standard estimate behind every deficit calculator. */
const KCAL_PER_KG = 7700;

/**
 * A standalone "how many calories should I eat" calculator (Mifflin-St Jeor
 * BMR × activity factor, then a deficit/surplus spread over the chosen
 * duration) — distinct from `estimateTargets`, which only uses bodyweight.
 * This is for the user who wants to work from age/height/activity/a target
 * date the way a classic online calculator does, then apply the result.
 */
export function estimateDeficitTarget(inputs: DeficitCalcInputs): DeficitCalcResult {
  const bmr =
    inputs.sex === 'male'
      ? 10 * inputs.weightKg + 6.25 * inputs.heightCm - 5 * inputs.age + 5
      : 10 * inputs.weightKg + 6.25 * inputs.heightCm - 5 * inputs.age - 161;
  const tdee = bmr * ACTIVITY_FACTOR[inputs.activity];
  const days = Math.max(1, inputs.durationMonths * 30);
  const dailyDeficit = ((inputs.weightKg - inputs.goalWeightKg) * KCAL_PER_KG) / days;
  // Safety bounds: never below 1200 kcal / 75% of TDEE, never more than a 500 kcal surplus.
  const floor = Math.max(1200, tdee * 0.75);
  const targetKcal = Math.round(Math.min(tdee + 500, Math.max(floor, tdee - dailyDeficit)));
  return { bmr: Math.round(bmr), tdee: Math.round(tdee), dailyDeficit: Math.round(dailyDeficit), targetKcal };
}

/**
 * Nutrition score 0-100 for the day: how well intake meets targets. Protein
 * adequacy and hydration each weigh as much as calorie balance, because under-
 * eating protein or under-hydrating harms health even when calories "look fine".
 * Only the components with data contribute; confidence reflects that coverage.
 */
export function computeNutritionScore(
  entries: NutritionEntry[],
  targets: NutritionTargets,
  asOf: ISODateString,
): EngineResult<number> {
  const day = entriesForDay(entries, asOf);
  if (day.length === 0) {
    return {
      value: 0,
      confidence: 'to_confirm',
      sourcesUsed: ['supotsu'],
      generatedAt: asOf,
    };
  }
  const totals = sumDay(entries, asOf);
  const parts: { value: number; weight: number }[] = [];

  // Calories: 100 at target, penalized either side of a ±20% band.
  if (targets.kcal > 0) {
    const ratio = totals.kcal / targets.kcal;
    parts.push({ value: clamp(100 - Math.abs(ratio - 1) * 250), weight: 0.4 });
  }
  // Protein: reaching target = 100 (no penalty for exceeding).
  if (targets.proteinG > 0 && day.some((e) => e.proteinG !== undefined)) {
    parts.push({ value: clamp((totals.proteinG / targets.proteinG) * 100), weight: 0.35 });
  }
  // Hydration: reaching target = 100.
  if (targets.hydrationMl > 0 && totals.hydrationMl > 0) {
    parts.push({ value: clamp((totals.hydrationMl / targets.hydrationMl) * 100), weight: 0.25 });
  }

  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  const value =
    totalWeight > 0
      ? clamp(Math.round(parts.reduce((s, p) => s + p.value * p.weight, 0) / totalWeight))
      : 0;

  let confidence: Confidence = 'to_confirm';
  if (parts.length >= 3) confidence = 'high';
  else if (parts.length >= 1) confidence = 'medium';

  return { value, confidence, sourcesUsed: ['supotsu'], generatedAt: asOf };
}

/** Explainable nutrition briefing for the day (Observation → Analyse → Action). */
export function nutritionExplanation(
  entries: NutritionEntry[],
  targets: NutritionTargets,
  asOf: ISODateString,
): Explanation | undefined {
  const day = entriesForDay(entries, asOf);
  if (day.length === 0) return undefined;
  const totals = sumDay(entries, asOf);
  const proteinPct = targets.proteinG > 0 ? Math.round((totals.proteinG / targets.proteinG) * 100) : 0;
  const hydrationPct = targets.hydrationMl > 0 ? Math.round((totals.hydrationMl / targets.hydrationMl) * 100) : 0;

  // Priority: flag the biggest health gap first.
  if (day.some((e) => e.proteinG !== undefined) && proteinPct < 70) {
    return {
      observation: { key: 'engines.nutrition.day.lowProtein.observation', params: { proteinG: totals.proteinG, proteinPct } },
      analysis: { key: 'engines.nutrition.day.lowProtein.analysis' },
      action: { key: 'engines.nutrition.day.lowProtein.action' },
    };
  }
  if (totals.hydrationMl > 0 && hydrationPct < 60) {
    return {
      observation: { key: 'engines.nutrition.day.lowHydration.observation', params: { hydrationMl: Math.round(totals.hydrationMl), hydrationPct } },
      analysis: { key: 'engines.nutrition.day.lowHydration.analysis' },
      action: { key: 'engines.nutrition.day.lowHydration.action' },
    };
  }
  return {
    observation: { key: 'engines.nutrition.day.onTrack.observation', params: { kcal: totals.kcal, proteinG: totals.proteinG } },
    analysis: { key: 'engines.nutrition.day.onTrack.analysis' },
    action: { key: 'engines.nutrition.day.onTrack.action' },
  };
}
