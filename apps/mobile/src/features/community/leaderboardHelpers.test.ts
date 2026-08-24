import { describe, expect, it } from 'vitest';
import { categoryToColumn, defaultDisplayName, periodToDays } from './leaderboardHelpers';

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
