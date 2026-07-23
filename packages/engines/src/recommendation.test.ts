import { describe, expect, it } from 'vitest';
import type { Activity, HealthMetric } from '@supotsu/core';
import { buildRecommendations, dailyRecommendation } from './recommendation';

const ASOF = '2026-07-28T12:00:00.000Z';
const DAY = 86_400_000;
const daysAgo = (n: number): string => new Date(new Date(ASOF).getTime() - n * DAY).toISOString();

function act(min: number, intensity: Activity['intensity'], ago: number): Activity {
  return {
    id: `a${ago}-${min}`, userId: 'u', type: 'running', source: 'garmin',
    startedAt: daysAgo(ago), durationSec: min * 60, intensity,
    createdAt: daysAgo(ago), updatedAt: daysAgo(ago),
  };
}
const sleep = (h: number, ago: number): HealthMetric => ({
  id: `s${ago}`, userId: 'u', type: 'sleep_duration', value: h, unit: 'h', source: 'garmin',
  measuredAt: daysAgo(ago), createdAt: daysAgo(ago), updatedAt: daysAgo(ago),
});

describe('buildRecommendations', () => {
  it('puts an injury-risk load spike first', () => {
    const acts: Activity[] = [];
    for (let d = 7; d < 28; d += 1) acts.push(act(20, 'low', d));
    for (let d = 0; d < 7; d += 1) acts.push(act(120, 'high', d));
    const recs = buildRecommendations({ activities: acts, healthMetrics: [], wellnessCheckins: [], asOf: ASOF });
    expect(recs[0]!.priority).toBe(0);
    expect(recs[0]!.articleId).toBe('acwr');
  });

  it('recommends catching up on poor sleep', () => {
    const recs = buildRecommendations({
      activities: [], healthMetrics: [sleep(4.5, 0)], wellnessCheckins: [], asOf: ASOF,
    });
    expect(recs.some((r) => r.pillar === 'sleep' && r.articleId === 'sleep')).toBe(true);
  });

  it('is empty with no data at all', () => {
    expect(buildRecommendations({ activities: [], healthMetrics: [], wellnessCheckins: [], asOf: ASOF })).toEqual([]);
  });

  it('closes with a positive default when data exists but nothing is wrong', () => {
    const acts: Activity[] = [];
    for (let d = 0; d < 28; d += 1) acts.push(act(45, 'moderate', d));
    const recs = buildRecommendations({ activities: acts, healthMetrics: [], wellnessCheckins: [], asOf: ASOF });
    expect(recs.length).toBeGreaterThanOrEqual(1);
    expect(recs[recs.length - 1]!.pillar).toBe('decision');
  });
});

describe('dailyRecommendation', () => {
  it('is to_confirm with no data', () => {
    const res = dailyRecommendation({ activities: [], healthMetrics: [], wellnessCheckins: [], asOf: ASOF });
    expect(res.confidence).toBe('to_confirm');
    expect(res.value.pillar).toBe('decision');
  });
});
