import { describe, expect, it } from 'vitest';
import type { Activity, HealthMetric, NutritionEntry, NutritionTargets, SleepSession } from '@supotsu/core';
import {
  buildDailySnapshot,
  computeConsistencyScore,
  computeProgressionScore,
  computeSportScore,
  computeWorkload,
  type StrengthVolumePoint,
} from './scoring';

const ASOF = '2026-07-20T12:00:00.000Z';

function activity(
  daysAgo: number,
  durationSec = 3600,
  intensity: Activity['intensity'] = 'moderate',
): Activity {
  const started = new Date(new Date(ASOF).getTime() - daysAgo * 86_400_000).toISOString();
  return {
    id: `a-${daysAgo}-${Math.random()}`,
    userId: 'u1',
    type: 'running',
    source: 'manual',
    startedAt: started,
    durationSec,
    intensity,
    createdAt: started,
    updatedAt: started,
  };
}

describe('computeConsistencyScore', () => {
  it('is 0 with no activities and to_confirm confidence', () => {
    const r = computeConsistencyScore([], ASOF);
    expect(r.value).toBe(0);
    expect(r.confidence).toBe('to_confirm');
  });

  it('reaches 100 at 5 distinct active days in the last week', () => {
    const acts = [1, 2, 3, 4, 5].map((d) => activity(d));
    expect(computeConsistencyScore(acts, ASOF).value).toBe(100);
  });
});

describe('computeWorkload', () => {
  it('flags a spike when acute load far exceeds the chronic average', () => {
    // One big session this week, nothing in the prior 3 weeks.
    const acts = [activity(1, 7200, 'high')];
    const { acwr } = computeWorkload(acts, ASOF);
    expect(acwr).toBeGreaterThan(1.5);
  });
});

describe('buildDailySnapshot', () => {
  it('recommends restarting when there is no recent activity', () => {
    const snap = buildDailySnapshot([], [], ASOF);
    expect(snap.value.overall).toBe(0);
    expect(snap.value.recommendation.explanation.observation.key).toBe('engines.scoring.daily.noActivity.observation');
    expect(snap.value.recommendation.pillar).toBe('decision');
  });

  it('recommends recovery on a workload spike', () => {
    const snap = buildDailySnapshot([activity(1, 7200, 'max')], [], ASOF);
    expect(snap.value.acwr).toBeGreaterThan(1.5);
    expect(snap.value.recommendation.explanation.action.key).toBe('engines.scoring.daily.highLoad.action');
    expect(snap.value.recommendation.confidence).toBe('high');
  });

  it('leaves every pillar null and overall at 0 with no data at all', () => {
    const snap = buildDailySnapshot([], [], ASOF);
    expect(snap.value.sport).toBeNull();
    expect(snap.value.recovery).toBeNull();
    expect(snap.value.sleep).toBeNull();
    expect(snap.value.nutrition).toBeNull();
    expect(snap.value.overall).toBe(0);
  });

  it('renormalizes overall on recovery alone when it is the only pillar available', () => {
    const metrics: HealthMetric[] = [
      { id: 'hrv', userId: 'u1', type: 'hrv', value: 65, unit: 'ms', source: 'garmin', measuredAt: ASOF, createdAt: ASOF, updatedAt: ASOF },
      { id: 'rhr', userId: 'u1', type: 'resting_heart_rate', value: 50, unit: 'bpm', source: 'garmin', measuredAt: ASOF, createdAt: ASOF, updatedAt: ASOF },
    ];
    const snap = buildDailySnapshot([], [], ASOF, metrics);
    expect(snap.value.sport).toBeNull();
    expect(snap.value.sleep).toBeNull();
    expect(snap.value.nutrition).toBeNull();
    expect(snap.value.recovery).not.toBeNull();
    // Only pillar present → overall equals it exactly (100% renormalized weight).
    expect(snap.value.overall).toBe(snap.value.recovery);
  });

  it('wires nutrition and sleep through to real, non-null sub-scores when given the data', () => {
    const entries: NutritionEntry[] = [
      { id: 'n1', userId: 'u1', mealType: 'lunch', description: 'Poulet-riz', kcal: 700, proteinG: 45, carbG: 80, fatG: 15, hydrationMl: 500, source: 'manual', loggedAt: ASOF, createdAt: ASOF, updatedAt: ASOF },
    ];
    const targets: NutritionTargets = { kcal: 2200, proteinG: 110, hydrationMl: 2500 };
    const sessions: SleepSession[] = [
      { id: 'sl1', userId: 'u1', source: 'garmin', startedAt: '2026-07-19T23:00:00.000Z', endedAt: '2026-07-20T07:00:00.000Z', deepMin: 90, lightMin: 300, remMin: 80, awakeMin: 10, asleepMin: 470, inBedMin: 480, createdAt: ASOF, updatedAt: ASOF },
    ];
    const metrics: HealthMetric[] = [
      { id: 'sd', userId: 'u1', type: 'sleep_duration', value: 7.8, unit: 'h', source: 'garmin', measuredAt: ASOF, createdAt: ASOF, updatedAt: ASOF },
    ];
    const snap = buildDailySnapshot([], [], ASOF, metrics, {
      nutritionEntries: entries,
      nutritionTargets: targets,
      sleepSessions: sessions,
    });
    expect(snap.value.nutrition).not.toBeNull();
    expect(snap.value.sleep).not.toBeNull();
  });
});

describe('computeProgressionScore', () => {
  it('is neutral (50) with no data at all', () => {
    const r = computeProgressionScore([], ASOF);
    expect(r.value).toBe(50);
    expect(r.confidence).toBe('to_confirm');
  });

  it('scores above 50 with high confidence when weekly load rises steadily over 6 weeks', () => {
    // One session per week, most recent week heaviest → clear upward trend.
    const acts = [3, 10, 17, 24, 31, 38].map((ago, i) => activity(ago, (180 - i * 30) * 60, 'moderate'));
    const r = computeProgressionScore(acts, ASOF);
    expect(r.value).toBeGreaterThan(50);
    expect(r.confidence).toBe('high');
  });

  it('scores below 50 when weekly load steadily declines over 6 weeks', () => {
    const acts = [3, 10, 17, 24, 31, 38].map((ago, i) => activity(ago, (30 + i * 30) * 60, 'moderate'));
    const r = computeProgressionScore(acts, ASOF);
    expect(r.value).toBeLessThan(50);
    expect(r.confidence).toBe('high');
  });

  it('is to_confirm with only a single week of data', () => {
    const r = computeProgressionScore([activity(1, 3600, 'moderate')], ASOF);
    expect(r.confidence).toBe('to_confirm');
  });

  it('picks up a rising strength-volume series even without activities', () => {
    const volume: StrengthVolumePoint[] = [3, 10, 17, 24].map((ago, i) => ({
      date: new Date(new Date(ASOF).getTime() - ago * 86_400_000).toISOString(),
      volume: 1000 + i * 500,
    }));
    const r = computeProgressionScore([], ASOF, volume);
    expect(r.value).toBeGreaterThan(50);
  });
});

describe('computeSportScore', () => {
  it('falls back to a neutral 50, to_confirm, with no data', () => {
    const r = computeSportScore([], ASOF);
    expect(r.value).toBe(50);
    expect(r.confidence).toBe('to_confirm');
    expect(r.breakdown).toEqual({ performance: 0, regularity: 0, progression: 50 });
  });

  it('renormalizes over performance + regularity when progression has too little data', () => {
    const r = computeSportScore([activity(1, 3600, 'moderate')], ASOF);
    expect(r.breakdown.performance).toBe(60);
    expect(r.breakdown.regularity).toBe(20);
    // Progression excluded (to_confirm) → weighted only over 0.4 + 0.3, renormalized.
    expect(r.value).toBe(43);
    expect(r.confidence).toBe('medium');
  });
});
