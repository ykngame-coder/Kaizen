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

  it('eases a fatigued muscle toward fresh with a recovery (mobility/stretching) session', () => {
    const trained = computeMuscleStates([{ trainedAt: daysAgo(1), primaryMuscles: ['hamstrings'], secondaryMuscles: [] }], ASOF);
    const withStretch = computeMuscleStates(
      [
        { trainedAt: daysAgo(1), primaryMuscles: ['hamstrings'], secondaryMuscles: [] },
        { trainedAt: daysAgo(0), primaryMuscles: ['hamstrings'], secondaryMuscles: [], recovery: true },
      ],
      ASOF,
    );
    const before = trained.find((m) => m.muscle === 'hamstrings')!.freshness;
    const after = withStretch.find((m) => m.muscle === 'hamstrings')!.freshness;
    expect(after).toBeGreaterThan(before);
  });

  it('never pushes a muscle past fully fresh, however much recovery work is logged', () => {
    const out = computeMuscleStates(
      [{ trainedAt: daysAgo(0), primaryMuscles: ['calves'], secondaryMuscles: [], recovery: true }],
      ASOF,
    );
    expect(out.find((m) => m.muscle === 'calves')!.freshness).toBe(100);
  });

  describe('effacement progressif sur 7 jours (demi-vie 36 h)', () => {
    const quads = (sessions: Parameters<typeof computeMuscleStates>[0]) =>
      computeMuscleStates(sessions, ASOF).find((m) => m.muscle === 'quads')!;
    const run = (d: number, load?: number) => ({ trainedAt: daysAgo(d), primaryMuscles: ['quads' as const], secondaryMuscles: [], load });

    it('une séance isolée est de nouveau « reposé » en ~2,5 jours', () => {
      expect(quads([run(2)]).state).not.toBe('rested');
      expect(quads([run(3)]).state).toBe('rested');
    });

    it('une séance vieille de 5 jours pèse encore un peu — elle comptait zéro avant', () => {
      expect(quads([run(5)]).freshness).toBeLessThan(100);
    });

    it('au-delà de 7 jours, plus rien', () => {
      expect(quads([run(7.5)]).freshness).toBe(100);
    });

    it('quatre séances en 7 jours s additionnent jusqu à « fatigué »', () => {
      expect(quads([run(0), run(2), run(4), run(6)]).state).toBe('fatigued');
      // Une seule, le même jour, n'y suffit pas.
      expect(quads([run(0)]).state).not.toBe('fatigued');
    });

    it('la charge pondère la fatigue : une demi-séance fatigue moitié moins', () => {
      const full = 100 - quads([run(0)]).freshness;
      const half = 100 - quads([run(0, 0.5)]).freshness;
      expect(half).toBeCloseTo(full / 2, 0);
    });
  });

  it('does not count a recovery session as "last trained" — only real load does', () => {
    const out = computeMuscleStates(
      [{ trainedAt: daysAgo(0), primaryMuscles: ['glutes'], secondaryMuscles: [], recovery: true }],
      ASOF,
    );
    expect(out.find((m) => m.muscle === 'glutes')!.lastTrainedDaysAgo).toBeNull();
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
