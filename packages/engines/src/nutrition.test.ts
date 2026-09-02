import { describe, expect, it } from 'vitest';
import type { NutritionEntry, NutritionTargets } from '@supotsu/core';
import {
  computeNutritionScore,
  estimateTargets,
  isHydrationOnlyEntry,
  nutritionExplanation,
  sumDay,
} from './nutrition';

const ASOF = '2026-07-20T20:00:00.000Z';
const TARGETS: NutritionTargets = { kcal: 2000, proteinG: 120, hydrationMl: 2500 };

function entry(partial: Partial<NutritionEntry> & { kcal: number }): NutritionEntry {
  const loggedAt = partial.loggedAt ?? '2026-07-20T12:00:00.000Z';
  return {
    id: partial.id ?? `n-${Math.random()}`,
    userId: 'u1',
    mealType: partial.mealType ?? 'lunch',
    description: partial.description ?? 'repas',
    kcal: partial.kcal,
    proteinG: partial.proteinG,
    carbG: partial.carbG,
    fatG: partial.fatG,
    hydrationMl: partial.hydrationMl,
    source: 'manual',
    loggedAt,
    createdAt: loggedAt,
    updatedAt: loggedAt,
  };
}

describe('isHydrationOnlyEntry', () => {
  it('recognizes a pure water log', () => {
    expect(isHydrationOnlyEntry(entry({ kcal: 0, hydrationMl: 250 }))).toBe(true);
  });

  it('rejects a real food entry, even one that also logs hydration', () => {
    expect(isHydrationOnlyEntry(entry({ kcal: 450, hydrationMl: 200 }))).toBe(false);
  });

  it('rejects a 0-kcal entry with no hydration (e.g. an empty manual entry)', () => {
    expect(isHydrationOnlyEntry(entry({ kcal: 0 }))).toBe(false);
  });

  it('rejects a 0-kcal, hydration-bearing entry that also has protein logged', () => {
    expect(isHydrationOnlyEntry(entry({ kcal: 0, hydrationMl: 250, proteinG: 5 }))).toBe(false);
  });
});

describe('estimateTargets', () => {
  it('is always to_confirm (estimates, never prescriptions)', () => {
    expect(estimateTargets({ weightKg: 75 }, ASOF).confidence).toBe('to_confirm');
  });

  it('raises protein for a body-composition goal', () => {
    const base = estimateTargets({ weightKg: 80, goal: 'health' }, ASOF).value.proteinG;
    const cut = estimateTargets({ weightKg: 80, goal: 'body_composition' }, ASOF).value.proteinG;
    expect(cut).toBeGreaterThan(base);
  });

  it('falls back to defaults without a weight', () => {
    const r = estimateTargets({}, ASOF);
    expect(r.value.kcal).toBeGreaterThan(0);
    expect(r.explanation?.action.key).toBe('engines.nutrition.noWeight.action');
  });
});

describe('sumDay', () => {
  it('sums only entries of the same calendar day', () => {
    const totals = sumDay(
      [
        entry({ kcal: 500, proteinG: 30, loggedAt: '2026-07-20T08:00:00.000Z' }),
        entry({ kcal: 700, proteinG: 40, loggedAt: '2026-07-20T13:00:00.000Z' }),
        entry({ kcal: 900, proteinG: 50, loggedAt: '2026-07-19T13:00:00.000Z' }), // other day
      ],
      ASOF,
    );
    expect(totals.kcal).toBe(1200);
    expect(totals.proteinG).toBe(70);
  });
});

describe('computeNutritionScore', () => {
  it('is to_confirm with nothing logged today', () => {
    expect(computeNutritionScore([], TARGETS, ASOF).confidence).toBe('to_confirm');
  });

  it('scores high when intake matches targets', () => {
    const r = computeNutritionScore(
      [entry({ kcal: 2000, proteinG: 120, hydrationMl: 2500 })],
      TARGETS,
      ASOF,
    );
    expect(r.value).toBeGreaterThanOrEqual(90);
    expect(r.confidence).toBe('high');
  });

  it('penalizes a large calorie surplus', () => {
    const onTarget = computeNutritionScore([entry({ kcal: 2000 })], TARGETS, ASOF).value;
    const surplus = computeNutritionScore([entry({ kcal: 3500 })], TARGETS, ASOF).value;
    expect(surplus).toBeLessThan(onTarget);
  });
});

describe('nutritionExplanation', () => {
  it('flags low protein first', () => {
    const ex = nutritionExplanation([entry({ kcal: 1800, proteinG: 40 })], TARGETS, ASOF);
    expect(ex?.action.key).toBe('engines.nutrition.day.lowProtein.action');
  });

  it('is undefined with nothing logged', () => {
    expect(nutritionExplanation([], TARGETS, ASOF)).toBeUndefined();
  });
});
