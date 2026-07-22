import { describe, expect, it } from 'vitest';
import type { Challenge } from '@supotsu/core';
import { challengeExplanation, computeChallengeProgress, computeLeaderboard } from './community';

const CH: Challenge = {
  id: 'c1',
  userId: 'owner',
  title: '5 activités cette semaine',
  metric: 'activity_count',
  target: 5,
  startsAt: '2026-07-13T00:00:00.000Z',
  endsAt: '2026-07-20T23:59:59.000Z',
  visibility: 'public',
  createdAt: '2026-07-13T00:00:00.000Z',
  updatedAt: '2026-07-13T00:00:00.000Z',
};

const act = (iso: string): { startedAt: string } => ({ startedAt: iso });

describe('computeChallengeProgress', () => {
  it('counts activities inside the window', () => {
    const progress = computeChallengeProgress(CH, [
      act('2026-07-14T10:00:00.000Z'),
      act('2026-07-15T10:00:00.000Z'),
      act('2026-07-25T10:00:00.000Z'), // out of window
    ]);
    expect(progress).toBe(2);
  });

  it('counts distinct days for the active_days metric', () => {
    const progress = computeChallengeProgress({ ...CH, metric: 'active_days' }, [
      act('2026-07-14T08:00:00.000Z'),
      act('2026-07-14T18:00:00.000Z'), // same day
      act('2026-07-15T10:00:00.000Z'),
    ]);
    expect(progress).toBe(2);
  });
});

describe('computeLeaderboard', () => {
  it('ranks participants by progress with competition ties', () => {
    const board = computeLeaderboard(CH, [
      { userId: 'a', activities: [act('2026-07-14T10:00:00.000Z')] },
      { userId: 'b', activities: [act('2026-07-14T10:00:00.000Z'), act('2026-07-15T10:00:00.000Z')] },
      { userId: 'c', activities: [act('2026-07-14T10:00:00.000Z')] },
    ]);
    expect(board[0]).toMatchObject({ userId: 'b', rank: 1, progress: 2 });
    // a and c tie on 1 → both rank 2 (competition ranking).
    expect(board[1]?.rank).toBe(2);
    expect(board[2]?.rank).toBe(2);
  });

  it('flags participants who reached the target', () => {
    const board = computeLeaderboard(CH, [
      {
        userId: 'a',
        activities: Array.from({ length: 5 }, (_, i) => act(`2026-07-1${4 + i}T10:00:00.000Z`)),
      },
    ]);
    expect(board[0]?.reachedTarget).toBe(true);
  });
});

describe('challengeExplanation', () => {
  it('states remaining count and days left when not done', () => {
    const r = challengeExplanation(CH, 2, '2026-07-18T12:00:00.000Z');
    expect(r.explanation?.observation).toContain('2/5');
    expect(r.value).toBe(2);
  });

  it('congratulates when the target is met', () => {
    const r = challengeExplanation(CH, 5, '2026-07-18T12:00:00.000Z');
    expect(r.explanation?.observation.toLowerCase()).toContain('atteint');
  });
});
