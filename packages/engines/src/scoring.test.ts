import { describe, expect, it } from 'vitest';
import type { Activity } from '@supotsu/core';
import { buildDailySnapshot, computeConsistencyScore, computeWorkload } from './scoring';

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
    expect(snap.value.recommendation.explanation.observation).toMatch(/aucune activité/i);
    expect(snap.value.recommendation.pillar).toBe('decision');
  });

  it('recommends recovery on a workload spike', () => {
    const snap = buildDailySnapshot([activity(1, 7200, 'max')], [], ASOF);
    expect(snap.value.acwr).toBeGreaterThan(1.5);
    expect(snap.value.recommendation.explanation.action).toMatch(/récupération|mobilité/i);
    expect(snap.value.recommendation.confidence).toBe('high');
  });
});
