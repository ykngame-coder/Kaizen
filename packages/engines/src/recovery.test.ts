import { describe, expect, it } from 'vitest';
import type { HealthMetric } from '@supotsu/core';
import { computeRecoveryScore, recoveryBand } from './recovery';
import { buildDailySnapshot } from './scoring';

const ASOF = '2026-07-20T12:00:00.000Z';

function metric(
  type: HealthMetric['type'],
  value: number,
  daysAgo: number,
  unit = '',
): HealthMetric {
  const measuredAt = new Date(new Date(ASOF).getTime() - daysAgo * 86_400_000).toISOString();
  return {
    id: `${type}-${daysAgo}`,
    userId: 'u1',
    type,
    value,
    unit,
    source: 'garmin',
    measuredAt,
    createdAt: measuredAt,
    updatedAt: measuredAt,
  };
}

describe('recoveryBand', () => {
  it('maps scores to the P13.4 bands', () => {
    expect(recoveryBand(90)).toBe('excellent');
    expect(recoveryBand(70)).toBe('correct');
    expect(recoveryBand(50)).toBe('moyen');
    expect(recoveryBand(30)).toBe('faible');
  });
});

describe('computeRecoveryScore', () => {
  it('is to_confirm with no health data', () => {
    expect(computeRecoveryScore([], ASOF).confidence).toBe('to_confirm');
  });

  it('rates good sleep + steady HRV/RHR highly', () => {
    const metrics = [
      metric('sleep_duration', 8, 0, 'h'),
      metric('hrv', 65, 0, 'ms'),
      metric('hrv', 64, 10, 'ms'),
      metric('resting_heart_rate', 50, 0, 'bpm'),
      metric('resting_heart_rate', 51, 10, 'bpm'),
    ];
    const r = computeRecoveryScore(metrics, ASOF);
    expect(r.value).toBeGreaterThan(75);
    expect(r.confidence).toBe('high');
  });
});

describe('buildDailySnapshot with recovery', () => {
  it('includes recovery and prioritizes rest when recovery is low', () => {
    const metrics = [metric('sleep_duration', 4.5, 0, 'h'), metric('stress', 90, 0)];
    const snap = buildDailySnapshot([], [], ASOF, metrics);
    expect(snap.value.recovery).not.toBeNull();
    expect(snap.value.recommendation.pillar).toBe('recovery');
    expect(snap.value.recommendation.explanation.action).toMatch(/repos|mobilité/i);
  });
});
