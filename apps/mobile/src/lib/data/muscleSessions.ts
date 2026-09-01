import type { Activity, Workout } from '@supotsu/core';
import type { MuscleSession } from '@supotsu/engines';
import { localDateKey } from '../../features/community/leaderboardHelpers';

/**
 * Same "does this activity already have a matched structured workout" check
 * ActivityDetailScreen uses to decide whether to show its own exercise
 * breakdown — reused here so a tagged activity is never double-counted
 * against the workout that already feeds buildMuscleSessions (in
 * repository.ts) with real exercise-level muscle data.
 */
function hasMatchedWorkout(activity: Activity, workouts: Workout[]): boolean {
  if (activity.type !== 'strength') return false;
  const key = localDateKey(new Date(activity.startedAt));
  return workouts.some((w) => w.status === 'completed' && w.completedAt && localDateKey(new Date(w.completedAt)) === key);
}

/**
 * One MuscleSession per tagged activity that isn't already covered by a
 * matched structured workout. Mobility/yoga activities ease fatigue instead
 * of adding it, same treatment structured mobility exercises already get
 * (see buildMuscleSessions' isMobility handling in repository.ts).
 */
export function buildActivityMuscleSessions(activities: Activity[], workouts: Workout[]): MuscleSession[] {
  const out: MuscleSession[] = [];
  for (const a of activities) {
    if (!a.muscles || a.muscles.length === 0) continue;
    if (hasMatchedWorkout(a, workouts)) continue;
    out.push({
      trainedAt: a.startedAt,
      primaryMuscles: a.muscles,
      secondaryMuscles: [],
      recovery: a.type === 'mobility' || a.type === 'yoga',
    });
  }
  return out;
}
