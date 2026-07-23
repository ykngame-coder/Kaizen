import { describe, expect, it } from 'vitest';
import { BODY_MUSCLES, computeMuscleStates, overallReadiness, suggestNextMuscles } from './muscles';

const ASOF = '2026-07-20T12:00:00.000Z';
const DAY = 86_400_000;
const daysAgo = (n: number): string => new Date(new Date(ASOF).getTime() - n * DAY).toISOString();

describe('computeMuscleStates', () => {
  it('returns every body muscle, all rested with no sessions', () => {
    const out = computeMuscleStates([], ASOF);
    expect(out).toHaveLength(BODY_MUSCLES.length);
    expect(out.every((m) => m.state === 'rested' && m.freshness === 100)).toBe(true);
    expect(out.every((m) => m.lastTrainedDaysAgo === null)).toBe(true);
  });

  it('marks a just-trained primary muscle as fatigued and an untouched one as rested', () => {
    const out = computeMuscleStates(
      [{ trainedAt: daysAgo(0), primaryMuscles: ['chest'], secondaryMuscles: ['triceps'] }],
      ASOF,
    );
    const chest = out.find((m) => m.muscle === 'chest')!;
    const quads = out.find((m) => m.muscle === 'quads')!;
    expect(chest.freshness).toBeLessThan(60);
    expect(chest.lastTrainedDaysAgo).toBe(0);
    expect(quads.state).toBe('rested');
  });

  it('recovers a muscle over ~3 days (fresher than a same-day hit)', () => {
    const recent = computeMuscleStates([{ trainedAt: daysAgo(0), primaryMuscles: ['back'], secondaryMuscles: [] }], ASOF);
    const older = computeMuscleStates([{ trainedAt: daysAgo(2), primaryMuscles: ['back'], secondaryMuscles: [] }], ASOF);
    const rBack = recent.find((m) => m.muscle === 'back')!.freshness;
    const oBack = older.find((m) => m.muscle === 'back')!.freshness;
    expect(oBack).toBeGreaterThan(rBack);
  });

  it('expands full_body onto all muscles', () => {
    const out = computeMuscleStates([{ trainedAt: daysAgo(0), primaryMuscles: ['full_body'], secondaryMuscles: [] }], ASOF);
    expect(out.every((m) => m.lastTrainedDaysAgo === 0)).toBe(true);
  });
});

describe('overallReadiness', () => {
  it('is 100 when fully rested and drops after training', () => {
    expect(overallReadiness(computeMuscleStates([], ASOF))).toBe(100);
    const worked = overallReadiness(
      computeMuscleStates(
        [{ trainedAt: daysAgo(0), primaryMuscles: ['full_body'], secondaryMuscles: [] }],
        ASOF,
      ),
    );
    expect(worked).toBeLessThan(100);
  });
});

describe('suggestNextMuscles', () => {
  it('proposes the freshest muscles', () => {
    const out = computeMuscleStates(
      [{ trainedAt: daysAgo(0), primaryMuscles: ['chest', 'triceps'], secondaryMuscles: [] }],
      ASOF,
    );
    const next = suggestNextMuscles(out, 3);
    expect(next).not.toContain('chest');
    expect(next).toHaveLength(3);
  });
});
