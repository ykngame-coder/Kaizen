import { describe, expect, it } from 'vitest';
import { mapStravaSport, normalizeStravaActivities, normalizeStravaActivity } from './strava';

describe('mapStravaSport', () => {
  it('maps Strava sport types', () => {
    expect(mapStravaSport('Run')).toBe('running');
    expect(mapStravaSport('MountainBikeRide')).toBe('cycling');
    expect(mapStravaSport('WeightTraining')).toBe('strength');
    expect(mapStravaSport('Kitesurf')).toBe('other');
    expect(mapStravaSport(undefined)).toBe('other');
  });
});

describe('normalizeStravaActivity', () => {
  it('normalizes a run with correct units and provenance', () => {
    const a = normalizeStravaActivity({
      id: 987654321,
      sport_type: 'Run',
      start_date: '2026-07-20T06:30:00Z',
      moving_time: 1830,
      elapsed_time: 1900,
      distance: 6543.2,
      average_heartrate: 151.6,
      calories: 420,
    });
    expect(a).toMatchObject({
      externalId: 'strava-987654321',
      type: 'running',
      source: 'strava',
      durationSec: 1830, // moving_time preferred
      distanceM: 6543,
      avgHeartRate: 152, // rounded
      calories: 420,
    });
    expect(a?.startedAt).toBe('2026-07-20T06:30:00.000Z');
  });

  it('falls back to elapsed_time and legacy type', () => {
    const a = normalizeStravaActivity({
      id: 1,
      type: 'Ride',
      start_date: '2026-07-20T06:30:00Z',
      elapsed_time: 3600,
    });
    expect(a?.type).toBe('cycling');
    expect(a?.durationSec).toBe(3600);
  });

  it('returns null without a start date or duration', () => {
    expect(normalizeStravaActivity({ id: 1, sport_type: 'Run', moving_time: 600 })).toBeNull();
    expect(normalizeStravaActivity({ id: 1, sport_type: 'Run', start_date: '2026-07-20T06:30:00Z' })).toBeNull();
  });
});

describe('normalizeStravaActivities', () => {
  it('keeps only usable activities', () => {
    const list = normalizeStravaActivities([
      { id: 1, sport_type: 'Run', start_date: '2026-07-20T06:30:00Z', moving_time: 1800 },
      { id: 2, sport_type: 'Run' }, // no date/duration
    ]);
    expect(list).toHaveLength(1);
    expect(list[0]?.externalId).toBe('strava-1');
  });
});
