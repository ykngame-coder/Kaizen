import { describe, expect, it } from 'vitest';
import { validateActivity, validateHealthMetric } from './quality';
import { dedupActivities } from './dedup';
import { importFromConnector } from './pipeline';
import { demoConnector } from './demoConnector';
import type { ImportedActivity } from './types';

const ASOF = '2026-07-20T12:00:00.000Z';

const base: ImportedActivity = {
  type: 'running',
  source: 'garmin',
  startedAt: '2026-07-19T18:00:00.000Z',
  durationSec: 600,
};

describe('data quality', () => {
  it('rejects impossible speed (100 km in 10 min)', () => {
    const issues = validateActivity({ ...base, distanceM: 100_000 });
    expect(issues.length).toBeGreaterThan(0);
  });

  it('accepts a plausible run', () => {
    expect(validateActivity({ ...base, durationSec: 2100, distanceM: 6500 })).toHaveLength(0);
  });

  it('flags out-of-range health values', () => {
    expect(
      validateHealthMetric({
        type: 'resting_heart_rate',
        value: 5,
        unit: 'bpm',
        source: 'garmin',
        measuredAt: ASOF,
      }),
    ).toHaveLength(1);
  });
});

describe('dedup', () => {
  it('drops an activity already stored from another source', () => {
    const existing = [{ type: 'running', startedAt: '2026-07-19T17:55:00.000Z', durationSec: 610 }];
    const kept = dedupActivities(existing, [base]);
    expect(kept).toHaveLength(0);
  });
});

describe('importFromConnector', () => {
  it('runs the demo connector through validation + dedup', async () => {
    const outcome = await importFromConnector(demoConnector, [], ASOF);
    expect(outcome.healthMetrics.length).toBeGreaterThan(0);
    expect(outcome.activities.length).toBe(2);
    expect(outcome.rejected).toHaveLength(0);
  });
});
