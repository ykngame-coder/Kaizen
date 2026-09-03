import { describe, expect, it } from 'vitest';
import { dedupeSleepSessionRows, type SleepSessionInsertRow } from './sleep';

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
