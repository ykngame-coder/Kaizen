import { describe, expect, it } from 'vitest';
import type { NutritionEntry, NutritionTargets } from '@supotsu/core';
import { BADGE_CATALOG, computeStreak, evaluateBadges } from './gamification';

const ASOF = '2026-07-20T18:00:00.000Z';
const DAY = 86_400_000;
const dayAgo = (n: number): string => new Date(new Date(ASOF).getTime() - n * DAY).toISOString();

const act = (n: number): { startedAt: string } => ({ startedAt: dayAgo(n) });

describe('computeStreak', () => {
  it('is 0 with no activities', () => {
    expect(computeStreak([], ASOF).value).toBe(0);
  });

  it('counts consecutive days ending today', () => {
    expect(computeStreak([act(0), act(1), act(2)], ASOF).value).toBe(3);
  });

  it('still counts a streak ending yesterday (today not yet logged)', () => {
    expect(computeStreak([act(1), act(2)], ASOF).value).toBe(2);
  });

  it('breaks when there is a full gap day', () => {
    // active today and 3 days ago, but gaps at 1 and 2 → streak is just today.
    expect(computeStreak([act(0), act(3), act(4)], ASOF).value).toBe(1);
  });
});

describe('evaluateBadges', () => {
  it('awards the first-activity badge with a reason', () => {
    const badges = evaluateBadges({ activities: [act(0)], asOf: ASOF });
    const first = badges.find((b) => b.id === 'first_activity');
    expect(first).toBeDefined();
    expect(first?.reason).toBeTruthy();
  });

  it('awards streak badges by threshold', () => {
    const seven = Array.from({ length: 7 }, (_, i) => act(i));
    const ids = evaluateBadges({ activities: seven, asOf: ASOF }).map((b) => b.id);
    expect(ids).toContain('streak_3');
    expect(ids).toContain('streak_7');
    expect(ids).not.toContain('streak_30');
  });

  it('awards a nutrition badge when a day meets its protein target', () => {
    const targets: NutritionTargets = { kcal: 2000, proteinG: 100, hydrationMl: 2000 };
    const entries: NutritionEntry[] = [
      {
        id: 'n1',
        userId: 'u1',
        mealType: 'lunch',
        description: 'poulet riz',
        kcal: 800,
        proteinG: 110,
        source: 'manual',
        loggedAt: dayAgo(0),
        createdAt: dayAgo(0),
        updatedAt: dayAgo(0),
      },
    ];
    const ids = evaluateBadges({ activities: [act(0)], nutritionEntries: entries, targets, asOf: ASOF }).map(
      (b) => b.id,
    );
    expect(ids).toContain('protein_day');
  });

  it('never awards a badge outside the catalogue', () => {
    const known = new Set(BADGE_CATALOG.map((b) => b.id));
    const badges = evaluateBadges({ activities: [act(0), act(1), act(2)], asOf: ASOF });
    for (const b of badges) expect(known.has(b.id)).toBe(true);
  });
});
