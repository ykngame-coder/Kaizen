import { describe, expect, it } from 'vitest';
import { validateActivity, validateHealthMetric } from './quality';
import { dedupActivities } from './dedup';
import { importFromConnector } from './pipeline';
import type { Connector, ImportedActivity } from './types';

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

  /**
   * Régression : le critère était « même type + même jour UTC + durée proche ».
   * Deux courses de 30 min le même jour, matin et soir, sont deux vraies
   * séances — la seconde était supprimée. Un doublon, c'est la MÊME séance vue
   * par une autre source, donc des heures de début qui se recouvrent.
   */
  it('garde deux séances distinctes du même jour et de même durée', () => {
    const matin = { ...base, startedAt: '2026-07-19T07:00:00.000Z' };
    const soir = { ...base, startedAt: '2026-07-19T19:00:00.000Z' };
    expect(dedupActivities([], [matin, soir])).toHaveLength(2);
    expect(dedupActivities([{ type: 'running', startedAt: '2026-07-19T07:00:00.000Z', durationSec: 600 }], [soir])).toHaveLength(1);
  });

  it('supprime la même séance vue par deux sources, à quelques minutes près', () => {
    const watch = { ...base, startedAt: '2026-07-19T18:00:00.000Z' };
    const strava = { ...base, startedAt: '2026-07-19T18:03:00.000Z' };
    expect(dedupActivities([], [watch, strava])).toHaveLength(1);
  });

  it('ne confond pas deux types différents au même créneau', () => {
    const course = { ...base, type: 'running' as const, startedAt: '2026-07-19T18:00:00.000Z' };
    const muscu = { ...base, type: 'strength' as const, startedAt: '2026-07-19T18:00:00.000Z' };
    expect(dedupActivities([], [course, muscu])).toHaveLength(2);
  });

  it('garde deux séances qui se suivent de près mais ne se recouvrent pas', () => {
    // Fin de la 1re à 18:10, début de la 2e à 18:20 : deux blocs enchaînés.
    const a = { ...base, startedAt: '2026-07-19T18:00:00.000Z', durationSec: 600 };
    const b = { ...base, startedAt: '2026-07-19T18:20:00.000Z', durationSec: 600 };
    expect(dedupActivities([], [a, b])).toHaveLength(2);
  });
});

describe('importFromConnector', () => {
  it('runs a connector through validation + dedup', async () => {
    const stubConnector: Connector = {
      provider: 'apple_health',
      name: 'Stub',
      available: true,
      capabilities: ['activities', 'health'],
      async sync() {
        return {
          healthMetrics: [
            { type: 'resting_heart_rate', value: 48, unit: 'bpm', source: 'apple_health', measuredAt: ASOF },
          ],
          activities: [base, { ...base, type: 'strength', startedAt: '2026-07-20T18:00:00.000Z' }],
        };
      },
    };
    const outcome = await importFromConnector(stubConnector, [], ASOF);
    expect(outcome.healthMetrics.length).toBeGreaterThan(0);
    expect(outcome.activities.length).toBe(2);
    expect(outcome.rejected).toHaveLength(0);
  });
});
