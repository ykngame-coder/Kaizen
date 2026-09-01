# Activity Muscle Tagging — Design

**Status:** Approved for planning
**Requested by:** TestFlight feedback — "Permettre de sélectionner une activité importée pour la modifier et ajouter les muscles travaillés, permettant la mise à jour de l'état corporel global."

## 1. Problem

`computeMuscleStates` (packages/engines/src/muscles.ts) — the engine behind the "Récupération" screen — only ever receives `MuscleSession`s built from structured strength workouts (`buildMuscleSessions` in apps/mobile/src/lib/data/repository.ts, fed from `workout_sets`). Any activity without exercise-level detail — a cardio import (Garmin "Cross-training", "Aviron", "Marche"), or one typed by hand — contributes nothing to muscle fatigue, even though it's real training stimulus. A tester correctly identified this as a gap and asked to tag an activity's worked muscles by hand.

`Activity` (packages/core/src/activity.ts) has no muscle field today, and `ActivityDetailScreen.tsx` (apps/mobile/src/features/activities/ActivityDetailScreen.tsx) has no edit affordance at all beyond delete.

## 2. Goals

- Let the user pick which muscle groups an activity worked, from its detail screen.
- Feed that tag into the same `computeMuscleStates` pipeline the Récupération screen already reads, without double-counting activities that already have a matched structured workout.
- Cover every activity type that lacks exercise-level detail — manual or imported alike (not just imports, despite the tester's wording: a manually-logged "Cross-training" has the identical gap).

## Non-goals

- Editing anything else about an activity (distance, calories, heart rate, notes). Only muscles are becoming editable.
- Retroactive/bulk tagging prompts, reminders, or notifications. The user opens an activity and tags it when they want to; nothing pushes them to do it.
- Primary/secondary muscle distinction for activity tags. Approved design: one flat multi-select list, every tagged muscle counted at full weight (like `primaryMuscles`, weight 1.0 in `computeMuscleStates`), no secondary tier. This matches the level of precision actually available from a cardio-activity import — there is no per-set breakdown to justify a secondary tier.

## 3. Data model

New nullable column on `activities`:

```sql
-- supabase/migrations/0026_activity_muscles.sql
alter table public.activities add column muscles text[];
```

No FK, no default, no NOT NULL — an untagged activity simply has `muscles = null`. As with migration 0025 (superset support, still pending from an earlier round), **this environment has no Supabase service-role credentials and cannot apply the migration itself** — the user must run it manually before real (non-demo) accounts can persist a tag.

`packages/core/src/activity.ts`:

```ts
export interface Activity extends OwnedEntity {
  // ...existing fields...
  /** Muscle groups the user says this activity worked — self-reported, only ever set for activities without exercise-level detail (see ActivityDetailScreen's matchedWorkout gate). Feeds computeMuscleStates via buildActivityMuscleSessions. */
  muscles?: MuscleGroup[];
}
```

`packages/database/src/generated/database.types.ts` — hand-add `muscles: string[] | null` to the `activities` table's `Row`, `Insert`, and `Update` (this file isn't regenerated live in this environment; every prior migration this session patched it by hand the same way).

## 4. Repository layer

**`packages/database/src/repositories/activities.ts`** — new function, following `updateHabit`'s shape in `habits.ts`:

```ts
/** Set (or clear) an activity's self-reported worked muscles — RLS scopes it to the owner. */
export async function updateActivityMuscles(
  client: SupotsuClient,
  activityId: string,
  muscles: string[],
): Promise<ActivityRow> {
  const { data, error } = await client
    .from('activities')
    .update({ muscles })
    .eq('id', activityId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}
```

**`apps/mobile/src/lib/data/repository.ts`**:
- `DataRepository` interface gains `updateActivityMuscles(userId: string, activityId: string, muscles: MuscleGroup[]): Promise<Activity>`.
- Demo branch: read `actKey(userId)`, map the matching activity to `{ ...a, muscles, updatedAt: now }`, write back, return it (same shape as `updateHabit`'s demo implementation).
- Supabase branch: call the new `updateActivityMuscles` from `packages/database`, wrap through `rowToActivity` (which gains `muscles: r.muscles ?? undefined`).

**`apps/mobile/src/lib/data/queries.ts`** — new `useUpdateActivityMuscles()` mutation hook, invalidating `['activities', user?.id]` on success (mirrors `useUpdateHabit`).

## 5. Engine integration

**Correction from the first pass of this design:** `repository.ts` imports React Native/Expo modules transitively (`@/lib/secure-storage` → `expo-secure-store`, `@/lib/supabase` → `react-native-url-polyfill/auto`) and uses the `@/` tsconfig path alias, neither of which the repo's root-level `vitest run` resolves (verified empirically: importing `repository.ts` from a test file fails to resolve `@/...` before RN modules are even reached). A function meant to be unit-tested cannot live in that file. It goes in a new, dependency-light sibling module instead:

`apps/mobile/src/lib/data/muscleSessions.ts` — new file, relative imports only (no `@/` alias), so it stays importable from a plain `vitest run` the same way `apps/mobile/src/features/community/leaderboardHelpers.ts` already is:

```ts
import type { Activity, Workout } from '@supotsu/core';
import type { MuscleSession } from '@supotsu/engines';
import { localDateKey } from '../../features/community/leaderboardHelpers';

/** Same "does this activity already have a matched structured workout" check ActivityDetailScreen uses to decide whether to show its own exercise breakdown — reused here so a tagged activity is never double-counted against the workout that already feeds buildMuscleSessions. */
function hasMatchedWorkout(activity: Activity, workouts: Workout[]): boolean {
  if (activity.type !== 'strength') return false;
  const key = localDateKey(new Date(activity.startedAt));
  return workouts.some((w) => w.status === 'completed' && w.completedAt && localDateKey(new Date(w.completedAt)) === key);
}

/** One MuscleSession per tagged activity that isn't already covered by a matched structured workout. Mobility/yoga activities ease fatigue instead of adding it, same treatment structured mobility exercises already get. */
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
```

`localDateKey` is already imported into `repository.ts` (from `@/features/community/leaderboardHelpers`, used elsewhere in that file) — `muscleSessions.ts` reaches the same function via a relative import instead, since it can't use the `@/` alias.

`repository.ts` imports `buildActivityMuscleSessions` from `./muscleSessions` (plain relative import — this direction is safe; `repository.ts` already depends on RN/Expo, so importing one more dependency-light sibling changes nothing about its own testability, which was never in question). Both `listMuscleSessions` implementations (demo at repository.ts:~1226, Supabase at repository.ts:~1929) already read the sets needed for `buildMuscleSessions`; they now additionally read activities and workouts (via the same storage keys/`listWorkoutsDb`+`rowToWorkout` already used elsewhere in the file) and concatenate `buildMuscleSessions(...)` with `buildActivityMuscleSessions(activities, workouts)` before returning.

## 6. UI

`ActivityDetailScreen.tsx` — new card, inserted after the existing Stat grid / Notes card and before the `matchedWorkout` block, shown only when `!matchedWorkout` (the identical gate that already decides whether the exercise-breakdown card renders — an activity either shows its structured breakdown or offers a muscle tag, never neither, never both):

- Heading + one-line hint (new i18n keys — see below).
- The existing 11-entry muscle chip row, reused from `AddCustomExerciseScreen.tsx`'s pattern: `MUSCLE_LABEL` (exported from `apps/mobile/src/features/exercises/catalog.ts`) plus a local `MUSCLES: MuscleGroup[]` const (that file only exports the label map — `AddCustomExerciseScreen.tsx` itself declares its own local `MUSCLES` array too, so redeclaring the same 11-entry literal in `ActivityDetailScreen.tsx` matches existing precedent rather than introducing a new export for a two-call-site constant). Rendered as `FilterChip` (`@supotsu/ui`), each toggling membership in local `selected: MuscleGroup[]` state seeded from `activity.muscles ?? []`.
- A "Enregistrer" button, disabled while `updateActivityMuscles.isPending`, calling `useUpdateActivityMuscles().mutateAsync({ activityId: activity.id, muscles: selected })`.
- No confirmation dialog, no separate route — this is a same-screen inline edit, consistent with the screen's existing single-page layout.

New i18n keys (5 locales, additive): a small namespace, e.g. `sport.activityDetail.muscles.{heading, hint, save, saved}` — the surrounding screen's existing strings stay hardcoded French exactly as they are today; only the new card's text goes through `t()`. Retrofitting the rest of the screen's i18n is out of scope for this feature.

## 7. Edge cases

- **Untagged activity**: `activity.muscles` is `undefined` → chip row starts with nothing selected → `buildActivityMuscleSessions` skips it (the `if (!a.muscles || a.muscles.length === 0) continue` guard) → identical to today's behavior, no regression.
- **Clearing a tag**: selecting down to zero chips and saving persists `muscles: []`, which the guard above also skips — a user can untag an activity back to "no contribution" without a separate delete action.
- **`full_body` selected**: `computeMuscleStates` already fans a `full_body` primary entry out to every body muscle at half weight (existing behavior, unchanged) — no special-casing needed here.
- **An activity later gets a matched workout** (e.g. the user logs a manual strength session the same day after already tagging a cardio activity): `hasMatchedWorkout` is evaluated live on every `listMuscleSessions` call, so the tag automatically stops contributing the moment a same-day completed strength workout exists — no stale double-count, no manual cleanup needed. The UI card also disappears on that activity's detail screen on next load, consistent with the exclusion.

## 8. Testing

- `buildActivityMuscleSessions` gets a dedicated unit test in `apps/mobile/src/lib/data/muscleSessions.test.ts` (new file, sibling of `muscleSessions.ts`, relative import — the same layout `leaderboardHelpers.ts`/`leaderboardHelpers.test.ts` already use, verified to run cleanly under the repo's root `vitest run`) covering: tagged activity with no matched workout → one session; tagged activity with a matched same-day completed strength workout → excluded; untagged activity → excluded; empty `muscles: []` → excluded; `mobility`/`yoga` type → `recovery: true`.
- No new coverage needed for `computeMuscleStates` itself — it already treats every `MuscleSession` uniformly regardless of source, and is already tested in `packages/engines/src/muscles.test.ts`.

## 9. Known limitation (carried forward)

Same operational gap as migration 0025: this environment holds only `EXPO_PUBLIC_SUPABASE_ANON_KEY`, no service-role key, so migration 0026 cannot be applied here. The user must apply both 0025 and 0026 manually before real accounts can persist a superset grouping or an activity muscle tag.
