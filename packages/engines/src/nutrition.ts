import type { Confidence, ISODateString, NutritionEntry, NutritionTargets } from '@supotsu/core';
import type { EngineResult, Explanation } from './result';

/**
 * Nutrition Engine (Master Prompt P11). Pure functions: intake entries in,
 * provenance-aware, explainable results out. It never stores or fetches.
 * Health before performance — protein sufficiency and hydration are weighted as
 * heavily as calories, and targets are always presented as estimates to adjust.
 */

const clamp = (n: number, min = 0, max = 100): number => Math.max(min, Math.min(max, n));

/** Whole-day bounds [start, end) for the calendar day of `asOf` (UTC). */
function dayBounds(asOf: ISODateString): [number, number] {
  const d = new Date(asOf);
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
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
        observation: 'Ton poids n’est pas encore renseigné.',
        analysis: 'Sans poids, les besoins sont approximés par des valeurs moyennes.',
        action: 'Ajoute ton poids dans ton profil pour des cibles personnalisées.',
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
      observation: `Cibles estimées pour ${weight} kg${inputs.goal ? ` (objectif ${inputs.goal})` : ''}.`,
      analysis: 'Basées sur des ratios standards (protéines g/kg, hydratation, apport calorique).',
      action: 'Ajuste-les selon ta faim, ton énergie et l’évolution de ton poids.',
    },
    sourcesUsed: ['manual'],
    generatedAt: asOf,
  };
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
      observation: `Tu es à ${totals.proteinG} g de protéines (${proteinPct}% de ta cible).`,
      analysis: 'Un apport protéique bas freine la récupération et le maintien musculaire.',
      action: 'Ajoute une source de protéines à ton prochain repas (œufs, poisson, légumineuses).',
    };
  }
  if (totals.hydrationMl > 0 && hydrationPct < 60) {
    return {
      observation: `Hydratation à ${Math.round(totals.hydrationMl)} ml (${hydrationPct}% de ta cible).`,
      analysis: 'Une hydratation insuffisante dégrade la vigilance et la performance.',
      action: 'Bois un verre d’eau maintenant et garde une gourde à portée.',
    };
  }
  return {
    observation: `${totals.kcal} kcal et ${totals.proteinG} g de protéines aujourd’hui.`,
    analysis: 'Ton apport est cohérent avec tes cibles estimées.',
    action: 'Continue ainsi ; ajuste si ta faim ou ton énergie changent.',
  };
}
