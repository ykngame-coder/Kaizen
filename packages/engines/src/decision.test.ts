import { describe, expect, it } from 'vitest';
import type { HealthMetric, NutritionEntry, NutritionTargets } from '@supotsu/core';
import { buildDailyBriefing } from './decision';

const ASOF = '2026-07-20T12:00:00.000Z';
const TARGETS: NutritionTargets = { kcal: 2000, proteinG: 120, hydrationMl: 2500 };
const DAY = 86_400_000;

function metric(type: HealthMetric['type'], value: number, daysAgo: number): HealthMetric {
  const measuredAt = new Date(new Date(ASOF).getTime() - daysAgo * DAY).toISOString();
  return { id: `${type}-${daysAgo}`, userId: 'u', type, value, unit: '', source: 'garmin', measuredAt, createdAt: measuredAt, updatedAt: measuredAt };
}

function meal(kcal: number, proteinG?: number): NutritionEntry {
  return {
    id: `m-${Math.random()}`, userId: 'u', mealType: 'lunch', description: 'repas', kcal, proteinG,
    source: 'manual', loggedAt: ASOF, createdAt: ASOF, updatedAt: ASOF,
  };
}

describe('buildDailyBriefing', () => {
  it('always returns three pillar sections', () => {
    const b = buildDailyBriefing({ activities: [], healthMetrics: [], nutritionEntries: [], targets: TARGETS, asOf: ASOF });
    expect(b.sections.map((s) => s.key)).toEqual(['recovery', 'readiness', 'nutrition']);
  });

  it('is to_confirm with no data at all and asks for input', () => {
    const b = buildDailyBriefing({ activities: [], healthMetrics: [], nutritionEntries: [], targets: TARGETS, asOf: ASOF });
    expect(b.confidence).toBe('to_confirm');
    expect(b.sections.every((s) => s.value === null)).toBe(true);
  });

  it('prioritizes low recovery health-first (rest headline)', () => {
    // Poor sleep + elevated RHR vs baseline → low recovery band.
    const health: HealthMetric[] = [
      metric('sleep_duration', 4.2, 0),
      ...Array.from({ length: 20 }, (_, i) => metric('resting_heart_rate', 50, i + 1)),
      metric('resting_heart_rate', 72, 0),
      ...Array.from({ length: 20 }, (_, i) => metric('hrv', 60, i + 1)),
      metric('hrv', 30, 0),
    ];
    const b = buildDailyBriefing({ activities: [], healthMetrics: health, nutritionEntries: [], targets: TARGETS, asOf: ASOF });
    expect(b.headlinePillar).toBe('recovery');
    expect(b.headline.action.toLowerCase()).toMatch(/repos|mobilité|récup/);
  });

  it('surfaces a nutrition gap when recovery is fine but protein is low', () => {
    const health: HealthMetric[] = [
      metric('sleep_duration', 8, 0),
      ...Array.from({ length: 20 }, (_, i) => metric('hrv', 60, i + 1)),
      metric('hrv', 65, 0),
      ...Array.from({ length: 20 }, (_, i) => metric('resting_heart_rate', 50, i + 1)),
      metric('resting_heart_rate', 48, 0),
    ];
    const b = buildDailyBriefing({
      activities: [],
      healthMetrics: health,
      nutritionEntries: [meal(1500, 20)], // very low protein
      targets: TARGETS,
      asOf: ASOF,
    });
    expect(b.headlinePillar).toBe('nutrition');
  });
});
