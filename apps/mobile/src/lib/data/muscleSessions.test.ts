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
      // 15 min : un tiers de la séance de référence de 45 min.
      { trainedAt: activity.startedAt, primaryMuscles: ['chest', 'triceps'], secondaryMuscles: [], recovery: false, load: 15 / 45 },
    ]);
  });

  it('skips an untagged activity whose type has no profile — cross-training, only the user knows', () => {
    const out = buildActivityMuscleSessions([baseActivity], []);
    expect(out).toEqual([]);
  });

  it('préremplit une course non taguée avec son profil, secondaires compris', () => {
    const run: Activity = { ...baseActivity, type: 'running', durationSec: 45 * 60 };
    expect(buildActivityMuscleSessions([run], [])).toEqual([
      { trainedAt: run.startedAt, primaryMuscles: ['quads', 'hamstrings', 'glutes', 'calves'], secondaryMuscles: ['core'], recovery: false, load: 1 },
    ]);
  });

  it('pour « autre », utilise le nom donné par Apple Santé', () => {
    const hike: Activity = { ...baseActivity, type: 'other', notes: 'Randonnée', durationSec: 90 * 60 };
    const [s] = buildActivityMuscleSessions([hike], []);
    expect(s?.primaryMuscles).toEqual(['quads', 'glutes', 'calves']);
    expect(s?.load).toBeCloseTo(2);
  });

  it('une marche pèse léger', () => {
    const walk: Activity = { ...baseActivity, type: 'walking', durationSec: 45 * 60 };
    expect(buildActivityMuscleSessions([walk], [])[0]?.load).toBeCloseTo(0.4);
  });

  it('les muscles tagués à la main l emportent sur le profil', () => {
    const run: Activity = { ...baseActivity, type: 'running', durationSec: 45 * 60, muscles: ['calves'] };
    const [s] = buildActivityMuscleSessions([run], []);
    expect(s?.primaryMuscles).toEqual(['calves']);
    expect(s?.secondaryMuscles).toEqual([]);
  });

  it('skips an activity tagged with an empty muscle list and no profile', () => {
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
