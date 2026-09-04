# Workout/Activity Heart Rate Merge — Design

**Goal:** When a user completes a structured workout (musculation/circuit) or logs a cardio activity in Kaizen while wearing a connected watch (Apple Watch, Garmin via Apple Santé, etc.), pull the heart rate the watch recorded for that session out of Apple Santé and attach it to the Kaizen record — so "avg/max FC" shows up next to the session's other stats without the user doing anything.

## Background

Two related gaps exist today:

- `workouts` (Kaizen's structured session log — musculation/circuit, built via the session builder, completed via Planning's "Terminer" or the Circuit Runner) has **no heart-rate columns at all**. There is no way to show FC for a structured session, ever.
- `activities` (cardio logged manually, or imported from Apple Santé) **does** have `avg_heart_rate`/`max_heart_rate` columns (since the very first migration), but nothing in the codebase ever populates them — not even for HealthKit-imported activities. `normalizeHealthKitWorkout` never reads heart rate.

HealthKit itself doesn't attach heart rate directly to a workout sample (`WorkoutSample` has no HR field — confirmed against the `@kingstinct/react-native-healthkit` type definitions). Heart rate has to be queried separately as `HKQuantityTypeIdentifierHeartRate` quantity samples within the session's time range, then averaged/maxed client-side. This is true whether or not the watch also auto-detected a separate "workout" in Health — querying raw HR samples for a time window is more reliable than trying to match two independent workout entries by type/overlap.

## Scope

Both structured workouts and manually-logged cardio activities get heart rate merged, using the same underlying query/summarize logic. HealthKit-imported activities (source `apple_health`) are out of scope for this feature — they come from a real device's own workout record, which may already carry richer data through other means, and re-deriving HR for those via this path isn't needed.

## Architecture

```
┌─────────────────────┐     ┌──────────────────────────┐     ┌─────────────────────┐
│ Kaizen completion    │     │ healthKitClient.ios.ts   │     │ workouts/activities │
│ action (workout      │────▶│ queryHeartRateSummary    │────▶│ table (avg/max_     │
│ 'completed', or      │     │ (start, end)             │     │ heart_rate columns) │
│ addActivity)         │     └──────────────────────────┘     └─────────────────────┘
└─────────────────────┘                 ▲
          │ immediate attempt           │ same function, reused
          ▼                             │
┌─────────────────────────────────────────────────────┐
│ backfillHeartRate(userId, repo) — called from both   │
│ useHealthKitAutoSync and useManualHealthKitSync,     │
│ after their normal sync pass                         │
└─────────────────────────────────────────────────────┘
```

## Components

**`packages/connectors/src/appleHealth.ts` — `summarizeHeartRate`**
Pure function: `(samples: { value: number }[]) => { avgHeartRate: number; maxHeartRate: number } | null`. Filters non-finite/non-positive values, returns `null` for an empty/all-invalid input, otherwise rounds the mean and the max. Fully unit-testable without any native dependency — same pattern as `aggregateHealthKitSleep`.

**`packages/database` migration `0027_workout_heart_rate.sql`**
Adds `avg_heart_rate smallint` and `max_heart_rate smallint` to `public.workouts`, mirroring the existing columns on `activities`. Like migrations 0025/0026, this has to be applied manually against Supabase (no service-role key in this environment) — flagged again at hand-off.

**`packages/core/src/training.ts` — `Workout`**
Gains `avgHeartRate?: number` and `maxHeartRate?: number`, matching `Activity`'s existing fields.

**`packages/database/src/generated/database.types.ts`**
`workouts` Row/Insert/Update gain `avg_heart_rate: number | null` / `max_heart_rate: number | null`.

**`packages/database/src/repositories/workouts.ts` — `updateWorkoutHeartRate`**
New function, same shape as the existing `updateActivityMuscles`: takes a workout id and `{ avgHeartRate, maxHeartRate }`, patches the two columns, returns the updated row.

**`packages/database/src/repositories/activities.ts` — `updateActivityHeartRate`**
Same shape, for `activities`. Only ever called when the activity's own `avg_heart_rate` is still null (never overwrites a value the import path or a manual entry already set).

**`apps/mobile/src/lib/data/repository.ts`**
Both repos (demo + Supabase) gain `setWorkoutHeartRate(userId, workoutId, summary)` and `setActivityHeartRate(userId, activityId, summary)`, added to the shared `DataRepository` interface — thin wrappers, same pattern as the existing `updateActivityMuscles` exposure.

**`apps/mobile/src/features/connectors/healthKitClient.ios.ts`**
- `requestAuthorization`'s `toRead` list gains `HKQuantityTypeIdentifierHeartRate` (a new permission scope — existing users get a one-time incremental HealthKit prompt for it on their next sync; already-granted types aren't re-prompted).
- New `queryHeartRateSummary(start: Date, end: Date): Promise<{ avgHeartRate: number; maxHeartRate: number } | null>` — queries `HKQuantityTypeIdentifierHeartRate` samples (unit `count/min`, matching the existing `resting_heart_rate` convention) for the given window and delegates to `summarizeHeartRate`. Best-effort: any native error resolves to `null`, same as every other read in this file. This is a **targeted, on-demand** query for one session's narrow window — never folded into the existing bulk 3-year `QUANTITY_TYPES` sweep, which would be far too much raw HR sample volume to read wholesale.

**Time window for a structured workout**
`workouts` has no reliable start time or guaranteed duration today. Reuse the same estimate `saveWorkoutToHealthKit` already uses when writing a workout to Health (`sets.length * 90` seconds), padded ±10 minutes on each side to tolerate the estimate being off. For activities, the window is exact: `[startedAt, startedAt + durationSec]`, also padded ±10 minutes (a watch's HR sampling doesn't align perfectly to the activity's own recorded boundaries).

**Immediate attempt**
- `useSetWorkoutStatus` (queries.ts), when `input.status === 'completed'`: after invalidating queries, best-effort fetch the workout's sets (already needed for the existing Apple Santé mirror), compute the estimated window, call `queryHeartRateSummary`, and if a summary comes back, call `repo.setWorkoutHeartRate`.
- `useAddActivity`: same idea using the activity's own `startedAt`/`durationSec`, only when the input didn't already carry `avgHeartRate`.

**Backfill ("rattrapage")**
New `backfillHeartRate(userId, repo): Promise<void>` (co-located with the other HealthKit sync helpers). Lists workouts completed and activities logged in the last 3 days that are still missing `avgHeartRate`, and retries the same window-estimate-and-query step for each. Called from both `useHealthKitAutoSync`'s sync pass and `useManualHealthKitSync`, after their existing work — so it runs on every app-open auto-sync, every background-delivery-triggered sync, and every manual resync (pull-to-refresh or the new Dashboard button).

## Data flow

1. User finishes a workout (Planning "Terminer" / Circuit Runner) or logs a cardio activity.
2. Immediately, best-effort: estimate the time window, query `queryHeartRateSummary`, patch the row if found.
3. If the watch hasn't synced to the iPhone yet, the query comes back empty (`null`) and the row's HR columns stay null — no error surfaced.
4. On the next Health sync (auto or manual), `backfillHeartRate` re-checks the last 3 days of workouts/activities still missing HR and retries — catching up once the watch's data has landed in Apple Santé.

## Error handling

Best-effort throughout, consistent with the rest of the Apple Santé integration (`mirrorToHealthKit`'s existing philosophy): every native call is wrapped so a failure (permission denied, no data, native error) silently leaves the HR columns null. Never surfaced to the user, never blocks the workout/activity save itself.

## UI

Add avg/max FC next to the other stats already shown on `WorkoutDetailScreen` and `ActivityDetailScreen` — no new screen, no new navigation. Rendered only when present (a workout/activity without a paired watch simply shows nothing new, same as today).

## Testing

- `summarizeHeartRate`: empty input → `null`; a single sample; multiple samples (avg/max correctness, including a mix of a few unrealistic/zero values being filtered out).
- `queryHeartRateSummary`: out of scope for automated tests (native call) — verified manually, same as the rest of `healthKitClient.ios.ts`.
- Window-estimate helper(s): pure function(s), unit-testable — given a set count or an activity's start/duration, assert the expected padded window.

## Out of scope

- Matching a watch/Garmin-recorded workout to a Kaizen session by type or overlap (rejected in favor of raw HR-sample querying — see Background).
- HealthKit-imported activities (`source: 'apple_health'`) getting HR backfilled by this path.
- Per-second/minute HR graphs or zones — only session-level avg/max, matching what `activities` already models.
- `lastSessionSetsByExercise`/progression-suggestion features — untouched.
