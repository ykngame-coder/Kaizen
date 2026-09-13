import { describe, expect, it } from 'vitest';
import { dedupeSleepSessionRows, staleSleepSessionIds, type SleepSessionInsertRow } from './sleep';

function row(overrides: Partial<SleepSessionInsertRow>): SleepSessionInsertRow {
  return {
    user_id: 'u1',
    source: 'apple_health',
    started_at: '2026-09-02T23:00:00.000Z',
    ended_at: '2026-09-03T07:00:00.000Z',
    deep_min: 60,
    light_min: 200,
    rem_min: 80,
    awake_min: 10,
    asleep_min: 340,
    in_bed_min: 350,
    ...overrides,
  };
}

describe('dedupeSleepSessionRows', () => {
  it('keeps distinct (user_id, started_at, source) rows untouched', () => {
    const rows = [row({ started_at: '2026-09-01T23:00:00.000Z' }), row({ started_at: '2026-09-02T23:00:00.000Z' })];
    expect(dedupeSleepSessionRows(rows)).toHaveLength(2);
  });

  it('collapses rows colliding on the unique index, keeping the last one', () => {
    const first = row({ asleep_min: 300 });
    const second = row({ asleep_min: 340 });
    const out = dedupeSleepSessionRows([first, second]);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(second);
  });

  it('treats different sources for the same night as distinct rows', () => {
    const rows = [row({ source: 'apple_health' }), row({ source: 'garmin' })];
    expect(dedupeSleepSessionRows(rows)).toHaveLength(2);
  });
});

describe('staleSleepSessionIds', () => {
  const row = (id: string, started_at: string, source = 'apple_health') => ({ id, started_at, source });

  it('supprime une ancienne nuit mal découpée que le nouveau lot ne contient plus', () => {
    const existing = [
      row('keep', '2026-07-20T21:47:00+00:00'),
      row('stale', '2026-07-21T21:30:00+00:00'), // ancienne coupe de la nuit 2
      row('new', '2026-07-21T19:20:00+00:00'),
    ];
    const synced = [{ startedAt: '2026-07-20T21:47:00.000Z' }, { startedAt: '2026-07-21T19:20:00.000Z' }];
    expect(staleSleepSessionIds(existing, synced, 'apple_health')).toEqual(['stale']);
  });

  it('compare les instants, pas leur écriture', () => {
    const existing = [row('same', '2026-07-20T21:47:00+00:00')];
    expect(staleSleepSessionIds(existing, [{ startedAt: '2026-07-20T21:47:00.000Z' }], 'apple_health')).toEqual([]);
  });

  it('ne touche ni aux autres sources ni à ce qui précède le lot', () => {
    const existing = [
      row('garmin', '2026-07-21T21:30:00+00:00', 'garmin'),
      row('older', '2026-01-01T22:00:00+00:00'),
    ];
    expect(staleSleepSessionIds(existing, [{ startedAt: '2026-07-20T21:47:00.000Z' }], 'apple_health')).toEqual([]);
  });

  it('ne supprime rien quand la synchro n a rien rapporté — une lecture HealthKit ratée ne vide pas l historique', () => {
    expect(staleSleepSessionIds([row('a', '2026-07-20T21:47:00+00:00')], [], 'apple_health')).toEqual([]);
  });
});
