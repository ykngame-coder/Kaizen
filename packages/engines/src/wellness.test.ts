import { describe, expect, it } from 'vitest';
import type { WellnessCheckin } from '@supotsu/core';
import { computeWellnessIndex, wellnessBand, wellnessStreak } from './wellness';

const ASOF = '2026-07-20T18:00:00.000Z';
const DAY = 86_400_000;
const daysAgo = (n: number): string => new Date(new Date(ASOF).getTime() - n * DAY).toISOString();

function checkin(mood: number, energy: number, stress: number, ago: number): WellnessCheckin {
  return { id: `c${ago}`, userId: 'u1', mood, energy, stress, checkedAt: daysAgo(ago), createdAt: daysAgo(ago), updatedAt: daysAgo(ago) };
}

describe('computeWellnessIndex', () => {
  it('is to_confirm with no check-ins', () => {
    expect(computeWellnessIndex([], ASOF).confidence).toBe('to_confirm');
  });

  it('rates a great day high and a rough day low', () => {
    expect(computeWellnessIndex([checkin(5, 5, 1, 0)], ASOF).value).toBe(100);
    expect(computeWellnessIndex([checkin(1, 1, 5, 0)], ASOF).value).toBe(0);
  });

  it('uses the most recent check-in', () => {
    const res = computeWellnessIndex([checkin(2, 2, 4, 3), checkin(5, 4, 2, 0)], ASOF);
    expect(res.value).toBeGreaterThan(60);
  });
});

describe('wellnessStreak', () => {
  it('counts consecutive days ending today', () => {
    const checkins = [checkin(4, 4, 2, 0), checkin(4, 4, 2, 1), checkin(4, 4, 2, 2)];
    expect(wellnessStreak(checkins, ASOF)).toBe(3);
  });

  it('breaks on a gap', () => {
    const checkins = [checkin(4, 4, 2, 0), checkin(4, 4, 2, 2)];
    expect(wellnessStreak(checkins, ASOF)).toBe(1);
  });
});

describe('wellnessBand', () => {
  it('maps index to bands', () => {
    expect(wellnessBand(85)).toBe('rayonnant');
    expect(wellnessBand(30)).toBe('difficile');
  });
});
