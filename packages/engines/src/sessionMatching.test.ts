import { describe, expect, it } from 'vitest';
import { matchSessions, type MatchableActivity, type MatchableWorkout } from './sessionMatching';

const workout = (over: Partial<MatchableWorkout> = {}): MatchableWorkout => ({
  id: 'w1',
  completedAt: '2026-09-21T21:13:00.000Z',
  durationSec: 41 * 60,
  ...over,
});

const activity = (over: Partial<MatchableActivity> = {}): MatchableActivity => ({
  id: 'a1',
  type: 'cross_training',
  startedAt: '2026-09-21T20:32:00.000Z',
  durationSec: 42 * 60,
  ...over,
});

describe('matchSessions', () => {
  it('reconnaît la montre et l app comme un seul effort', () => {
    const { pairs } = matchSessions([workout()], [activity()], []);
    expect(pairs).toEqual([{ workoutId: 'w1', activityId: 'a1', manual: false }]);
  });

  it('laisse deux efforts distincts de la même journée tranquilles', () => {
    const matin = activity({ id: 'a2', startedAt: '2026-09-21T07:00:00.000Z', durationSec: 40 * 60 });
    const { pairs } = matchSessions([workout()], [matin], []);
    expect(pairs).toEqual([]);
  });

  it('ne rapproche pas deux séances qui ne se recouvrent qu à la marge', () => {
    // La montre s'arrête quand la séance commence : ce sont deux efforts.
    const avant = activity({ startedAt: '2026-09-21T19:50:00.000Z', durationSec: 40 * 60 });
    expect(matchSessions([workout()], [avant], []).pairs).toEqual([]);
  });

  it('associe chaque activité à une seule séance, la plus proche', () => {
    const tot = workout({ id: 'w-tot', completedAt: '2026-09-21T20:50:00.000Z', durationSec: 20 * 60 });
    const juste = workout({ id: 'w-juste' });
    const { pairs } = matchSessions([tot, juste], [activity()], []);
    expect(pairs.map((p) => p.workoutId)).toEqual(['w-juste']);
  });

  it('ignore une séance sans date de fin — rien à recouper', () => {
    expect(matchSessions([workout({ completedAt: undefined })], [activity()], []).pairs).toEqual([]);
  });

  it('respecte un rattachement décidé à la main, même sans recouvrement', () => {
    const loin = activity({ startedAt: '2026-09-21T06:00:00.000Z', durationSec: 30 * 60 });
    const { pairs } = matchSessions([workout()], [loin], [{ workoutId: 'w1', activityId: 'a1', mode: 'linked' }]);
    expect(pairs).toEqual([{ workoutId: 'w1', activityId: 'a1', manual: true }]);
  });

  it('respecte une séparation décidée à la main, malgré le recouvrement', () => {
    const { pairs } = matchSessions([workout()], [activity()], [{ workoutId: 'w1', activityId: 'a1', mode: 'separate' }]);
    expect(pairs).toEqual([]);
  });

  it('dit quelles activités restent seules — ce sont elles qu on affiche encore', () => {
    const autre = activity({ id: 'a9', startedAt: '2026-09-21T07:00:00.000Z' });
    const { unmatchedActivityIds } = matchSessions([workout()], [activity(), autre], []);
    expect(unmatchedActivityIds).toEqual(['a9']);
  });
});
