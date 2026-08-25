import { describe, expect, it } from 'vitest';
import { categoryToColumn, defaultDisplayName, isTodayLocal, localDateKey, periodToDays } from './leaderboardHelpers';

describe('periodToDays', () => {
  it('maps week to 7 days', () => {
    expect(periodToDays('week')).toBe(7);
  });
  it('maps quarter to 90 days', () => {
    expect(periodToDays('quarter')).toBe(90);
  });
  it('maps year to 365 days', () => {
    expect(periodToDays('year')).toBe(365);
  });
});

describe('categoryToColumn', () => {
  it('maps general to the kaizen column', () => {
    expect(categoryToColumn('general')).toBe('kaizen');
  });
  it('maps sport/nutrition/sleep to their own-named column', () => {
    expect(categoryToColumn('sport')).toBe('sport');
    expect(categoryToColumn('nutrition')).toBe('nutrition');
    expect(categoryToColumn('sleep')).toBe('sleep');
  });
});

describe('localDateKey', () => {
  it('formats a local Date as YYYY-MM-DD, zero-padding month and day', () => {
    // Local-time constructor (year, monthIndex, day) so the expectation holds in any timezone.
    expect(localDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(localDateKey(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
  it('uses local calendar components, not the UTC ones', () => {
    const d = new Date(2026, 5, 15, 23, 30);
    expect(localDateKey(d)).toBe(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    );
  });
});

describe('isTodayLocal', () => {
  it('is true for an ISO string on the current local calendar day', () => {
    // Build today's local date at noon so it stays "today" whatever the machine's offset.
    expect(isTodayLocal(`${localDateKey(new Date())}T12:00:00`)).toBe(true);
  });
  it('is false for a date in the past', () => {
    expect(isTodayLocal('2020-01-01T12:00:00.000Z')).toBe(false);
  });
});

describe('defaultDisplayName', () => {
  it('builds a stable "Athlète XXXX" label from the last 4 chars of the user id', () => {
    expect(defaultDisplayName('11111111-2222-3333-4444-abcdef012345')).toBe('Athlète 2345');
  });
  it('is deterministic for the same id', () => {
    const id = '00000000-0000-0000-0000-00000000beef';
    expect(defaultDisplayName(id)).toBe(defaultDisplayName(id));
  });
  it('uppercases the suffix', () => {
    expect(defaultDisplayName('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeabcd')).toBe('Athlète ABCD');
  });
});
