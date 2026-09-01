import { describe, expect, it } from 'vitest';
import type { Activity, Workout } from '@supotsu/core';
import { buildActivityMuscleSessions } from './muscleSessions';

const baseActivity: Activity = {
  id: 'a1',
  userId: 'u1',
  type: 'cross_training',
  source: 'manual',
  startedAt: '2026-08-30T10:00:00.000Z',
  durationSec: 900,
  createdAt: '2026-08-30T10:00:00.000Z',
  updatedAt: '2026-08-30T10:00:00.000Z',
};

const baseWorkout: Workout = {
  id: 'w1',
  userId: 'u1',
  name: 'Musculation',
  status: 'completed',
  completedAt: '2026-08-30T18:00:00.000Z',
  createdAt: '2026-08-30T18:00:00.000Z',
  updatedAt: '2026-08-30T18:00:00.000Z',
};

describe('buildActivityMuscleSessions', () => {
  it('emits one session per tagged activity with no matched workout', () => {
    const activity: Activity = { ...baseActivity, muscles: ['chest', 'triceps'] };
    const out = buildActivityMuscleSessions([activity], []);
    expect(out).toEqual([
      { trainedAt: activity.startedAt, primaryMuscles: ['chest', 'triceps'], secondaryMuscles: [], recovery: false },
    ]);
  });

  it('skips an untagged activity', () => {
    const out = buildActivityMuscleSessions([baseActivity], []);
    expect(out).toEqual([]);
  });

  it('skips an activity tagged with an empty muscle list', () => {
    const activity: Activity = { ...baseActivity, muscles: [] };
    const out = buildActivityMuscleSessions([activity], []);
    expect(out).toEqual([]);
  });

  it('skips a strength activity that already has a matched completed workout the same day', () => {
    const activity: Activity = { ...baseActivity, type: 'strength', startedAt: '2026-08-30T09:00:00.000Z', muscles: ['back'] };
    const out = buildActivityMuscleSessions([activity], [baseWorkout]);
    expect(out).toEqual([]);
  });

  it('does not skip a strength activity when the matched workout is a different day', () => {
    const activity: Activity = { ...baseActivity, type: 'strength', startedAt: '2026-08-29T09:00:00.000Z', muscles: ['back'] };
    const out = buildActivityMuscleSessions([activity], [baseWorkout]);
    expect(out).toHaveLength(1);
  });

  it('does not skip a non-strength activity even with a same-day completed workout', () => {
    const activity: Activity = { ...baseActivity, type: 'cross_training', startedAt: '2026-08-30T09:00:00.000Z', muscles: ['back'] };
    const out = buildActivityMuscleSessions([activity], [baseWorkout]);
    expect(out).toHaveLength(1);
  });

  it('marks mobility/yoga activities as recovery sessions', () => {
    const mobility: Activity = { ...baseActivity, type: 'mobility', muscles: ['core'] };
    const yoga: Activity = { ...baseActivity, type: 'yoga', muscles: ['core'] };
    const [m, y] = buildActivityMuscleSessions([mobility, yoga], []);
    expect(m?.recovery).toBe(true);
    expect(y?.recovery).toBe(true);
  });
});
