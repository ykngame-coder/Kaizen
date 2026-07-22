import type { ActivityType } from '@supotsu/core';
import type { ImportedActivity } from './types';

/**
 * Strava normalization (Master Prompt P22, P38). Pure functions that turn a
 * Strava activity (v3 API) into Supotsu's model — no I/O. Strava is the pragmatic
 * bridge for Garmin *activities* (Garmin auto-syncs to Strava). It carries
 * workouts with HR/distance, but not sleep/HRV — those come from the Garmin
 * export importer. The Strava Edge Function mirrors this mapping; keep in sync.
 *
 * Units: distance in metres, times in seconds, start_date is ISO 8601 (UTC).
 */

/** Strava `sport_type` (or legacy `type`) → Supotsu ActivityType. */
const SPORT_MAP: Record<string, ActivityType> = {
  Run: 'running',
  TrailRun: 'running',
  VirtualRun: 'running',
  Ride: 'cycling',
  VirtualRide: 'cycling',
  MountainBikeRide: 'cycling',
  GravelRide: 'cycling',
  EBikeRide: 'cycling',
  Swim: 'swimming',
  Walk: 'walking',
  Hike: 'walking',
  WeightTraining: 'strength',
  Workout: 'cross_training',
  Crossfit: 'cross_training',
  Elliptical: 'cross_training',
  StairStepper: 'cross_training',
  HighIntensityIntervalTraining: 'cross_training',
  Yoga: 'yoga',
  Pilates: 'yoga',
};

export function mapStravaSport(sport: string | undefined): ActivityType {
  if (!sport) return 'other';
  return SPORT_MAP[sport] ?? 'other';
}

export interface StravaActivity {
  id?: number;
  name?: string;
  sport_type?: string;
  type?: string;
  start_date?: string;
  elapsed_time?: number;
  moving_time?: number;
  distance?: number;
  total_elevation_gain?: number;
  average_heartrate?: number;
  calories?: number;
}

/** One Strava activity → a normalized activity (or null if unusable). */
export function normalizeStravaActivity(a: StravaActivity): ImportedActivity | null {
  const duration = a.moving_time ?? a.elapsed_time;
  if (!a.start_date || !duration) return null;
  return {
    externalId: a.id !== undefined ? `strava-${a.id}` : undefined,
    type: mapStravaSport(a.sport_type ?? a.type),
    source: 'strava',
    startedAt: new Date(a.start_date).toISOString(),
    durationSec: Math.round(duration),
    distanceM: a.distance !== undefined ? Math.round(a.distance) : undefined,
    calories: a.calories,
    avgHeartRate:
      a.average_heartrate !== undefined ? Math.round(a.average_heartrate) : undefined,
  };
}

/** Normalize a list of Strava activities, dropping unusable ones. */
export function normalizeStravaActivities(
  activities: StravaActivity[] | undefined,
): ImportedActivity[] {
  if (!activities) return [];
  const out: ImportedActivity[] = [];
  for (const a of activities) {
    const norm = normalizeStravaActivity(a);
    if (norm) out.push(norm);
  }
  return out;
}
