import type { Activity, Workout } from '@supotsu/core';
import { activityMuscleLoad, matchSessions, profileFor, type HeartRateContext, type MuscleSession, type SessionLink } from '@supotsu/engines';

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
export function buildActivityMuscleSessions(
  activities: Activity[],
  workouts: Workout[],
  hr: HeartRateContext = {},
  links: SessionLink[] = [],
): MuscleSession[] {
  // Une activité que la montre a enregistrée pendant une séance jouée dans
  // l'app décrit le même effort : la compter en plus doublerait la fatigue.
  // L'ancienne règle ne regardait que les séances de musculation, et se
  // contentait du même jour — un cross-training passait au travers.
  const { unmatchedActivityIds } = matchSessions(workouts, activities, links);
  const standalone = new Set(unmatchedActivityIds);
  const out: MuscleSession[] = [];
  for (const a of activities) {
    if (!standalone.has(a.id)) continue;
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

/** La fenêtre dans laquelle une FC atteinte en séance vaut encore comme repère de FC max. */
const OBSERVED_MAX_HR_DAYS = 180;

/**
 * Les FC max atteintes en séance ces 6 derniers mois — de quoi relever la FC
 * max estimée d'après l'âge (voir `estimateMaxHeartRate`). Au-delà, la forme
 * a pu changer.
 */
export function observedMaxHeartRates(activities: Activity[], workouts: Workout[], now: Date = new Date()): number[] {
  const since = now.getTime() - OBSERVED_MAX_HR_DAYS * 24 * 60 * 60 * 1000;
  const fromActivities = activities
    .filter((a) => a.maxHeartRate != null && new Date(a.startedAt).getTime() >= since)
    .map((a) => a.maxHeartRate!);
  const fromWorkouts = workouts
    .filter((w) => w.maxHeartRate != null && w.completedAt != null && new Date(w.completedAt).getTime() >= since)
    .map((w) => w.maxHeartRate!);
  return [...fromActivities, ...fromWorkouts];
}
