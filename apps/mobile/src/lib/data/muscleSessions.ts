import type { Activity, Workout } from '@supotsu/core';
import { activityMuscleLoad, profileFor, type HeartRateContext, type MuscleSession } from '@supotsu/engines';
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
 * One MuscleSession per activity that isn't already covered by a matched
 * structured workout. Muscles: those the user tagged by hand, else the
 * activity type's profile (`profileFor` — a run always works the same
 * muscles); an activity with neither (strength, cross-training: only the user
 * knows) contributes nothing. Computed at read time, so every past activity
 * benefits — nothing is written back.
 *
 * Every session carries its `load` (duration, intensity, type weight): a
 * 10-minute walk no longer tires the legs like a half-marathon. `hr` lets an
 * activity without a declared intensity get one from its average heart rate.
 *
 * Mobility/yoga activities ease fatigue instead of adding it, same treatment
 * structured mobility exercises already get (see buildMuscleSessions'
 * isMobility handling in repository.ts).
 */
export function buildActivityMuscleSessions(activities: Activity[], workouts: Workout[], hr: HeartRateContext = {}): MuscleSession[] {
  const out: MuscleSession[] = [];
  for (const a of activities) {
    if (hasMatchedWorkout(a, workouts)) continue;
    const tagged = a.muscles && a.muscles.length > 0 ? a.muscles : null;
    const profile = tagged ? null : profileFor(a);
    if (!tagged && !profile) continue;
    const load = activityMuscleLoad(a, hr);
    if (load <= 0) continue;
    out.push({
      trainedAt: a.startedAt,
      primaryMuscles: tagged ?? profile!.primary,
      secondaryMuscles: tagged ? [] : profile!.secondary,
      recovery: a.type === 'mobility' || a.type === 'yoga',
      load,
    });
  }
  return out;
}
