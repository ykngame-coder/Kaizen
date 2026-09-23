import { describe, expect, it } from 'vitest';
import type { Activity, Workout } from '@supotsu/core';
import { buildActivityMuscleSessions, observedMaxHeartRates } from './muscleSessions';

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
      // 15 min : la moitié de la séance de référence de 30 min.
      { trainedAt: activity.startedAt, primaryMuscles: ['chest', 'triceps'], secondaryMuscles: [], recovery: false, load: 0.5 },
    ]);
  });

  it('skips an untagged activity whose type has no profile — cross-training, only the user knows', () => {
    const out = buildActivityMuscleSessions([baseActivity], []);
    expect(out).toEqual([]);
  });

  it('préremplit une course non taguée avec son profil, secondaires compris', () => {
    const run: Activity = { ...baseActivity, type: 'running', durationSec: 30 * 60 };
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
    const walk: Activity = { ...baseActivity, type: 'walking', durationSec: 30 * 60 };
    expect(buildActivityMuscleSessions([walk], [])[0]?.load).toBeCloseTo(0.4);
  });

  it('estime l intensité d une course importée d après sa FC moyenne', () => {
    const run: Activity = { ...baseActivity, type: 'running', durationSec: 30 * 60, avgHeartRate: 155 };
    const [withHr] = buildActivityMuscleSessions([run], [], { restingHr: 60, maxHr: 185 });
    const [without] = buildActivityMuscleSessions([run], []);
    expect(withHr?.load).toBeCloseTo(1.25);
    // Sans FC max (âge inconnu), l'intensité reste neutre.
    expect(without?.load).toBeCloseTo(1);
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

  // L'appariement se fait sur le temps réellement partagé, plus sur le seul
  // jour civil : deux efforts du même jour restent deux efforts, et une montre
  // qui a enregistré la séance qu'on jouait décrit le même.
  it('écarte l activité qui recouvre une séance jouée dans l app', () => {
    const activity: Activity = { ...baseActivity, type: 'strength', startedAt: '2026-08-30T17:20:00.000Z', durationSec: 40 * 60, muscles: ['back'] };
    expect(buildActivityMuscleSessions([activity], [{ ...baseWorkout, durationSec: 40 * 60 }])).toEqual([]);
  });

  it('écarte aussi un cross-training, pas seulement la musculation', () => {
    const activity: Activity = { ...baseActivity, type: 'cross_training', startedAt: '2026-08-30T17:20:00.000Z', durationSec: 40 * 60, muscles: ['back'] };
    expect(buildActivityMuscleSessions([activity], [{ ...baseWorkout, durationSec: 40 * 60 }])).toEqual([]);
  });

  it('garde deux efforts distincts du même jour', () => {
    const matin: Activity = { ...baseActivity, type: 'strength', startedAt: '2026-08-30T09:00:00.000Z', durationSec: 40 * 60, muscles: ['back'] };
    expect(buildActivityMuscleSessions([matin], [{ ...baseWorkout, durationSec: 40 * 60 }])).toHaveLength(1);
  });

  it('garde l activité quand la séance ne porte aucun muscle', () => {
    // Le repository ne passe ici que les séances dont les exercices disent
    // quels muscles ont travaillé. Une séance de course et de gainage n'en
    // fait pas partie : elle ne doit pas faire taire l'activité que la montre
    // a enregistrée au même moment, seule à porter des muscles.
    const activity: Activity = { ...baseActivity, type: 'cross_training', startedAt: '2026-08-30T17:20:00.000Z', durationSec: 40 * 60, muscles: ['back'] };
    expect(buildActivityMuscleSessions([activity], [])).toHaveLength(1);
  });

  it('garde une activité de la veille', () => {
    const activity: Activity = { ...baseActivity, type: 'strength', startedAt: '2026-08-29T17:20:00.000Z', durationSec: 40 * 60, muscles: ['back'] };
    expect(buildActivityMuscleSessions([activity], [{ ...baseWorkout, durationSec: 40 * 60 }])).toHaveLength(1);
  });

  it('marks mobility/yoga activities as recovery sessions', () => {
    const mobility: Activity = { ...baseActivity, type: 'mobility', muscles: ['core'] };
    const yoga: Activity = { ...baseActivity, type: 'yoga', muscles: ['core'] };
    const [m, y] = buildActivityMuscleSessions([mobility, yoga], []);
    expect(m?.recovery).toBe(true);
    expect(y?.recovery).toBe(true);
  });
});

describe('observedMaxHeartRates', () => {
  const now = new Date('2026-09-14T12:00:00.000Z');

  it('prend les FC max des activités et des séances des 6 derniers mois', () => {
    const recent: Activity = { ...baseActivity, startedAt: '2026-09-01T10:00:00.000Z', maxHeartRate: 188 };
    const old: Activity = { ...baseActivity, id: 'a2', startedAt: '2025-12-01T10:00:00.000Z', maxHeartRate: 199 };
    const noHr: Activity = { ...baseActivity, id: 'a3' };
    const workout: Workout = { ...baseWorkout, maxHeartRate: 176 };
    expect(observedMaxHeartRates([recent, old, noHr], [workout], now).sort()).toEqual([176, 188]);
  });
});
