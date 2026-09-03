import { describe, expect, it } from 'vitest';
import { dedupeByConflictKey, type HealthMetricInsertRow } from './health';

function row(overrides: Partial<HealthMetricInsertRow>): HealthMetricInsertRow {
  return {
    user_id: 'u1',
    type: 'sleep_duration',
    value: 7.5,
    unit: 'h',
    source: 'apple_health',
    measured_at: '2026-09-02T12:00:00.000Z',
    ...overrides,
  };
}

describe('dedupeByConflictKey', () => {
  it('keeps distinct (user_id, type, measured_at, source) rows untouched', () => {
    const rows = [row({ measured_at: '2026-09-01T12:00:00.000Z' }), row({ measured_at: '2026-09-02T12:00:00.000Z' })];
    expect(dedupeByConflictKey(rows)).toHaveLength(2);
  });

  it('collapses rows colliding on the unique index, keeping the last one', () => {
    const first = row({ value: 6.2 });
    const second = row({ value: 7.9 });
    const out = dedupeByConflictKey([first, second]);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(second);
  });

  it('treats a missing source as its own key, distinct from an explicit one', () => {
    const withSource = row({ source: 'apple_health' });
    const withoutSource = row({ source: undefined });
    expect(dedupeByConflictKey([withSource, withoutSource])).toHaveLength(2);
  });
});
