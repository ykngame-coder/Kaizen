# Workout/Activity Heart Rate Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user completes a structured workout or logs a cardio activity in Kaizen while wearing a connected watch, pull the heart rate Apple Santé recorded for that session's time window and attach it to the Kaizen record.

**Architecture:** A pure `summarizeHeartRate` function turns raw HR quantity samples into an avg/max pair; two pure window-estimate functions turn a workout's set count (or an activity's real start/duration) into a padded time range. `healthKitClient.ios.ts` gains a targeted `queryHeartRateSummary(start, end)` read (never folded into the existing bulk 3-year sweep). Both `useSetWorkoutStatus` and `useAddActivity` attempt the fetch immediately on completion; `useHealthKitAutoSync`/`useManualHealthKitSync` retry it for the last 3 days of still-missing sessions on every sync pass ("rattrapage").

**Tech Stack:** TypeScript, React Native, Expo, `@kingstinct/react-native-healthkit`, Supabase, TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-04-workout-heart-rate-merge-design.md`

## Global Constraints

- Every native HealthKit call stays best-effort: a failure (permission denied, no data, native error) must silently leave the heart-rate columns null, never throw into the caller's own save action, and never surface to the user.
- `queryHeartRateSummary` is a targeted per-session query — never add `HKQuantityTypeIdentifierHeartRate` to the existing bulk `QUANTITY_TYPES` 3-year sweep.
- `updateActivityHeartRate`/`setActivityHeartRate` must never overwrite an activity's existing `avgHeartRate`/`maxHeartRate` (a manual entry or an import already set it).
- The workout time-window estimate (`SET_DURATION_ESTIMATE_SEC = 90`) must be the exact same constant `saveWorkoutToHealthKit` uses to write a workout's duration — one shared constant, not two literals that can drift apart.
- Backfill only ever considers workouts/activities from the last 3 days, and skips `activities` whose `source === 'apple_health'` (out of scope per the spec).

---

### Task 1: Heart-rate summarizing + time-window estimate (pure functions)

**Files:**
- Modify: `packages/connectors/src/appleHealth.ts`
- Test: `packages/connectors/src/appleHealth.test.ts`

**Interfaces:**
- Produces: `export const SET_DURATION_ESTIMATE_SEC = 90;`
- Produces: `export interface HeartRateSample { value: number }`
- Produces: `export interface HeartRateSummary { avgHeartRate: number; maxHeartRate: number }`
- Produces: `export function summarizeHeartRate(samples: HeartRateSample[]): HeartRateSummary | null`
- Produces: `export interface HeartRateWindow { start: string; end: string }` (ISO strings)
- Produces: `export function estimateWorkoutHeartRateWindow(completedAt: string, setCount: number): HeartRateWindow`
- Produces: `export function estimateActivityHeartRateWindow(startedAt: string, durationSec: number): HeartRateWindow`

- [ ] **Step 1: Write the failing tests**

Add to `packages/connectors/src/appleHealth.test.ts` (new imports at the top, alongside the existing ones from `./appleHealth`):

```ts
import {
  aggregateHealthKitSleep,
  aggregateHealthKitSleepSessions,
  estimateActivityHeartRateWindow,
  estimateWorkoutHeartRateWindow,
  mapHealthKitWorkoutType,
  normalizeHealthKitSample,
  normalizeHealthKitSamples,
  normalizeHealthKitWorkout,
  normalizeShortcutHealth,
  summarizeHeartRate,
} from './appleHealth';
```

Append these `describe` blocks at the end of the file:

```ts
describe('summarizeHeartRate', () => {
  it('returns null for no samples', () => {
    expect(summarizeHeartRate([])).toBeNull();
  });

  it('averages and maxes a single sample', () => {
    const out = summarizeHeartRate([{ value: 120 }]);
    expect(out).toEqual({ avgHeartRate: 120, maxHeartRate: 120 });
  });

  it('averages and maxes several samples, rounding the average', () => {
    const out = summarizeHeartRate([{ value: 100 }, { value: 130 }, { value: 145 }]);
    expect(out).toEqual({ avgHeartRate: 125, maxHeartRate: 145 }); // (100+130+145)/3 = 125
  });

  it('drops non-finite/non-positive readings before summarizing', () => {
    const out = summarizeHeartRate([{ value: 0 }, { value: -5 }, { value: Number.NaN }, { value: 110 }]);
    expect(out).toEqual({ avgHeartRate: 110, maxHeartRate: 110 });
  });

  it('returns null when every reading is invalid', () => {
    expect(summarizeHeartRate([{ value: 0 }, { value: -1 }])).toBeNull();
  });
});

describe('estimateWorkoutHeartRateWindow', () => {
  it('pads a set-count-based duration estimate around the completion time', () => {
    const win = estimateWorkoutHeartRateWindow('2026-09-04T18:00:00.000Z', 10);
    // 10 sets * 90s = 900s = 15min estimated duration, padded 10min each side.
    expect(win.start).toBe('2026-09-04T17:35:00.000Z');
    expect(win.end).toBe('2026-09-04T18:10:00.000Z');
  });

  it('never produces a negative estimated duration for zero sets', () => {
    const win = estimateWorkoutHeartRateWindow('2026-09-04T18:00:00.000Z', 0);
    expect(win.start).toBe('2026-09-04T17:50:00.000Z');
    expect(win.end).toBe('2026-09-04T18:10:00.000Z');
  });
});

describe('estimateActivityHeartRateWindow', () => {
  it("pads the activity's real start/duration", () => {
    const win = estimateActivityHeartRateWindow('2026-09-04T07:00:00.000Z', 1800); // 30min activity
    expect(win.start).toBe('2026-09-04T06:50:00.000Z');
    expect(win.end).toBe('2026-09-04T07:40:00.000Z');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/connectors && npx vitest run src/appleHealth.test.ts`
Expected: FAIL — `summarizeHeartRate`/`estimateWorkoutHeartRateWindow`/`estimateActivityHeartRateWindow` are not exported yet.

- [ ] **Step 3: Implement the functions**

In `packages/connectors/src/appleHealth.ts`, add near the top (after the existing `ASLEEP_VALUES`/`nightKey` block, before `aggregateHealthKitSleep`):

```ts
/** Duration Kaizen estimates for a structured workout with no reliable start
 * time — must stay the exact value saveWorkoutToHealthKit (in the mobile
 * app's healthKitClient.ios.ts) uses to write the workout's own duration,
 * or the read-back window and the written workout drift apart. */
export const SET_DURATION_ESTIMATE_SEC = 90;

const HR_WINDOW_PAD_MS = 10 * 60_000;

export interface HeartRateSample {
  value: number;
}

export interface HeartRateSummary {
  avgHeartRate: number;
  maxHeartRate: number;
}

/**
 * Session-level avg/max heart rate from raw quantity samples. HealthKit
 * doesn't attach heart rate directly to a workout sample — samples are
 * queried separately for a time window and summarized here, client-side.
 */
export function summarizeHeartRate(samples: HeartRateSample[]): HeartRateSummary | null {
  const values = samples.map((s) => s.value).filter((v) => Number.isFinite(v) && v > 0);
  if (values.length === 0) return null;
  return {
    avgHeartRate: Math.round(values.reduce((sum, v) => sum + v, 0) / values.length),
    maxHeartRate: Math.round(Math.max(...values)),
  };
}

export interface HeartRateWindow {
  start: string;
  end: string;
}

/**
 * Estimated time window for a structured workout — `workouts` has no
 * reliable start time or guaranteed duration today, so this reuses the same
 * set-count-based duration estimate saveWorkoutToHealthKit writes with,
 * padded on each side to tolerate the estimate being off.
 */
export function estimateWorkoutHeartRateWindow(completedAt: string, setCount: number): HeartRateWindow {
  const durationMs = Math.max(setCount, 0) * SET_DURATION_ESTIMATE_SEC * 1000;
  const completedMs = new Date(completedAt).getTime();
  return {
    start: new Date(completedMs - durationMs - HR_WINDOW_PAD_MS).toISOString(),
    end: new Date(completedMs + HR_WINDOW_PAD_MS).toISOString(),
  };
}

/**
 * Time window for a cardio activity — real start/duration, padded since a
 * watch's heart-rate sampling rarely aligns exactly to the activity's own
 * recorded boundaries.
 */
export function estimateActivityHeartRateWindow(startedAt: string, durationSec: number): HeartRateWindow {
  const startMs = new Date(startedAt).getTime();
  return {
    start: new Date(startMs - HR_WINDOW_PAD_MS).toISOString(),
    end: new Date(startMs + durationSec * 1000 + HR_WINDOW_PAD_MS).toISOString(),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/connectors && npx vitest run src/appleHealth.test.ts`
Expected: PASS, all new + existing tests in the file green.

- [ ] **Step 5: Typecheck and lint**

Run: `cd packages/connectors && npx tsc --noEmit && npx eslint src/appleHealth.ts src/appleHealth.test.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/connectors/src/appleHealth.ts packages/connectors/src/appleHealth.test.ts
git commit -m "Add heart-rate summarizing + time-window estimate pure functions"
```

---

### Task 2: Database schema + generated types + core `Workout` type

**Files:**
- Create: `supabase/migrations/0027_workout_heart_rate.sql`
- Modify: `packages/database/src/generated/database.types.ts`
- Modify: `packages/core/src/training.ts`

**Interfaces:**
- Produces: `workouts` table gains `avg_heart_rate smallint`, `max_heart_rate smallint` (nullable).
- Produces: `Workout` (core type) gains `avgHeartRate?: number`, `maxHeartRate?: number`.
- Fixes: `activities` Insert type in generated types was missing `max_heart_rate` (Row already had it) — added so `.update()`/`.insert()` calls can set it.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0027_workout_heart_rate.sql`:

```sql
alter table public.workouts
  add column avg_heart_rate smallint,
  add column max_heart_rate smallint;
```

This cannot be applied by the agent (no service-role key in this environment) — same as migrations 0025/0026, it needs to be run manually against Supabase before this feature works end-to-end. Flag this at hand-off.

- [ ] **Step 2: Update the generated database types**

In `packages/database/src/generated/database.types.ts`, find the `workouts` table block:

```ts
      workouts: {
        Row: {
          id: string;
          user_id: string;
          program_id: string | null;
          name: string;
          status: 'planned' | 'in_progress' | 'completed' | 'skipped';
          planned_for: string | null;
          completed_at: string | null;
          duration_sec: number | null;
          rpe: number | null;
          notes: string | null;
          external_id: string | null;
        } & Timestamps;
        Insert: {
          user_id: string;
          name: string;
          status?: 'planned' | 'in_progress' | 'completed' | 'skipped';
          planned_for?: string | null;
          completed_at?: string | null;
          duration_sec?: number | null;
          rpe?: number | null;
          notes?: string | null;
          external_id?: string | null;
        };
        Update: Partial<Database['public']['Tables']['workouts']['Insert']>;
        Relationships: [];
      };
```

Replace with (adding `avg_heart_rate`/`max_heart_rate` to both `Row` and `Insert`):

```ts
      workouts: {
        Row: {
          id: string;
          user_id: string;
          program_id: string | null;
          name: string;
          status: 'planned' | 'in_progress' | 'completed' | 'skipped';
          planned_for: string | null;
          completed_at: string | null;
          duration_sec: number | null;
          rpe: number | null;
          avg_heart_rate: number | null;
          max_heart_rate: number | null;
          notes: string | null;
          external_id: string | null;
        } & Timestamps;
        Insert: {
          user_id: string;
          name: string;
          status?: 'planned' | 'in_progress' | 'completed' | 'skipped';
          planned_for?: string | null;
          completed_at?: string | null;
          duration_sec?: number | null;
          rpe?: number | null;
          avg_heart_rate?: number | null;
          max_heart_rate?: number | null;
          notes?: string | null;
          external_id?: string | null;
        };
        Update: Partial<Database['public']['Tables']['workouts']['Insert']>;
        Relationships: [];
      };
```

Then find the `activities` table's `Insert` block:

```ts
        Insert: {
          user_id: string;
          type: string;
          source?: string;
          started_at: string;
          duration_sec: number;
          distance_m?: number | null;
          calories?: number | null;
          intensity?: 'low' | 'moderate' | 'high' | 'max' | null;
          avg_heart_rate?: number | null;
          notes?: string | null;
          external_id?: string | null;
          muscles?: string[] | null;
        };
```

Add the missing `max_heart_rate` line right after `avg_heart_rate`:

```ts
        Insert: {
          user_id: string;
          type: string;
          source?: string;
          started_at: string;
          duration_sec: number;
          distance_m?: number | null;
          calories?: number | null;
          intensity?: 'low' | 'moderate' | 'high' | 'max' | null;
          avg_heart_rate?: number | null;
          max_heart_rate?: number | null;
          notes?: string | null;
          external_id?: string | null;
          muscles?: string[] | null;
        };
```

- [ ] **Step 3: Update the core `Workout` type**

In `packages/core/src/training.ts`, find:

```ts
export interface Workout extends OwnedEntity {
  programId?: UUID;
  name: string;
  status: WorkoutStatus;
  plannedFor?: ISODateString;
  completedAt?: ISODateString;
  durationSec?: number;
  /** Session-level rate of perceived exertion, 1-10 (Master Prompt P36.11). */
  rpe?: number;
  notes?: string;
}
```

Replace with:

```ts
export interface Workout extends OwnedEntity {
  programId?: UUID;
  name: string;
  status: WorkoutStatus;
  plannedFor?: ISODateString;
  completedAt?: ISODateString;
  durationSec?: number;
  /** Session-level rate of perceived exertion, 1-10 (Master Prompt P36.11). */
  rpe?: number;
  /** From a connected watch's heart-rate samples over the session's estimated time window (best-effort, may be absent). */
  avgHeartRate?: number;
  maxHeartRate?: number;
  notes?: string;
}
```

- [ ] **Step 4: Typecheck**

Run: `cd packages/core && npx tsc --noEmit && cd ../database && npx tsc --noEmit`
Expected: no errors. (`database`'s repositories don't reference the new columns yet — that's Task 3 — so this only verifies the type edits themselves are syntactically valid.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0027_workout_heart_rate.sql packages/database/src/generated/database.types.ts packages/core/src/training.ts
git commit -m "Add avg/max heart rate columns to workouts + fix activities Insert type gap"
```

---

### Task 3: Database repository functions

**Files:**
- Modify: `packages/database/src/repositories/workouts.ts`
- Modify: `packages/database/src/repositories/activities.ts`

**Interfaces:**
- Consumes: `WorkoutRow`, `ActivityRow` types (Task 2).
- Produces: `export async function updateWorkoutHeartRate(client: SupotsuClient, workoutId: string, summary: { avgHeartRate: number; maxHeartRate: number }): Promise<WorkoutRow>`
- Produces: `export async function updateActivityHeartRate(client: SupotsuClient, activityId: string, summary: { avgHeartRate: number; maxHeartRate: number }): Promise<ActivityRow>`

No test file — these are thin Supabase wrappers with no existing test coverage in this package (same as every other repository function here); typecheck/lint is the verification.

- [ ] **Step 1: Add `updateWorkoutHeartRate`**

In `packages/database/src/repositories/workouts.ts`, add right after `updateWorkoutStatus` (which ends with its closing `}` before the `/** Delete a workout... */` comment):

```ts
/** Attach a connected watch's avg/max heart rate to a completed workout — RLS scopes it to the owner. Never called with a summary the caller hasn't already computed as non-null. */
export async function updateWorkoutHeartRate(
  client: SupotsuClient,
  workoutId: string,
  summary: { avgHeartRate: number; maxHeartRate: number },
): Promise<WorkoutRow> {
  const { data, error } = await client
    .from('workouts')
    .update({ avg_heart_rate: summary.avgHeartRate, max_heart_rate: summary.maxHeartRate })
    .eq('id', workoutId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}
```

- [ ] **Step 2: Add `updateActivityHeartRate`**

In `packages/database/src/repositories/activities.ts`, add right after `updateActivityMuscles`:

```ts
/** Attach a connected watch's avg/max heart rate to an activity — only ever called by the caller when the activity doesn't already have one (never overwrites a manual entry or an import). RLS scopes it to the owner. */
export async function updateActivityHeartRate(
  client: SupotsuClient,
  activityId: string,
  summary: { avgHeartRate: number; maxHeartRate: number },
): Promise<ActivityRow> {
  const { data, error } = await client
    .from('activities')
    .update({ avg_heart_rate: summary.avgHeartRate, max_heart_rate: summary.maxHeartRate })
    .eq('id', activityId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `cd packages/database && npx tsc --noEmit && npx eslint src/repositories/workouts.ts src/repositories/activities.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/database/src/repositories/workouts.ts packages/database/src/repositories/activities.ts
git commit -m "Add updateWorkoutHeartRate/updateActivityHeartRate repository functions"
```

---

### Task 4: App-level repository wiring (demo + Supabase)

**Files:**
- Modify: `apps/mobile/src/lib/data/repository.ts`

**Interfaces:**
- Consumes: `updateWorkoutHeartRate`, `updateActivityHeartRate` (Task 3); `Workout.avgHeartRate`/`maxHeartRate` (Task 2).
- Produces: `DataRepository.setWorkoutHeartRate(userId: string, workoutId: string, summary: { avgHeartRate: number; maxHeartRate: number }): Promise<void>`
- Produces: `DataRepository.setActivityHeartRate(userId: string, activityId: string, summary: { avgHeartRate: number; maxHeartRate: number }): Promise<void>`

- [ ] **Step 1: Add both methods to the `DataRepository` interface**

In `apps/mobile/src/lib/data/repository.ts`, find:

```ts
  /** Set (or clear) an activity's self-reported worked muscles. */
  updateActivityMuscles(userId: string, activityId: string, muscles: MuscleGroup[]): Promise<Activity>;
  /** Remove a logged/imported activity (e.g. a duplicate or unwanted import). */
  deleteActivity(userId: string, activityId: string): Promise<void>;
```

Replace with:

```ts
  /** Set (or clear) an activity's self-reported worked muscles. */
  updateActivityMuscles(userId: string, activityId: string, muscles: MuscleGroup[]): Promise<Activity>;
  /** Attach a connected watch's avg/max heart rate — best-effort, never called when the activity already has one. */
  setActivityHeartRate(userId: string, activityId: string, summary: { avgHeartRate: number; maxHeartRate: number }): Promise<void>;
  /** Remove a logged/imported activity (e.g. a duplicate or unwanted import). */
  deleteActivity(userId: string, activityId: string): Promise<void>;
```

Then find:

```ts
  /** Change a session's status (mark a planned one done or skipped). */
  setWorkoutStatus(
    userId: string,
    workoutId: string,
    status: Workout['status'],
    completedAt?: string | null,
  ): Promise<Workout>;
```

Add right after it:

```ts
  /** Attach a connected watch's avg/max heart rate to a completed workout — best-effort. */
  setWorkoutHeartRate(userId: string, workoutId: string, summary: { avgHeartRate: number; maxHeartRate: number }): Promise<void>;
```

- [ ] **Step 2: Implement both methods in the demo repository**

In `apps/mobile/src/lib/data/repository.ts`, find the demo repository's `updateActivityMuscles` (inside `createDemoRepository`):

```ts
    async updateActivityMuscles(userId, activityId, muscles) {
      const items = await readJson<Activity>(actKey(userId));
      let updated: Activity | undefined;
      const now = new Date().toISOString();
      const next = items.map((a) => {
        if (a.id !== activityId) return a;
        updated = { ...a, muscles, updatedAt: now };
        return updated;
      });
      if (!updated) throw new Error('Activité introuvable.');
      await writeJson(actKey(userId), next);
      return updated;
    },
```

Add right after it:

```ts
    async setActivityHeartRate(userId, activityId, summary) {
      const items = await readJson<Activity>(actKey(userId));
      const now = new Date().toISOString();
      const next = items.map((a) =>
        a.id === activityId
          ? { ...a, avgHeartRate: summary.avgHeartRate, maxHeartRate: summary.maxHeartRate, updatedAt: now }
          : a,
      );
      await writeJson(actKey(userId), next);
    },
```

Then find the demo repository's `setWorkoutStatus` (full body):

```ts
    async setWorkoutStatus(userId, workoutId, status, completedAt) {
      const items = await readJson<Workout>(wkKey(userId));
      const now = new Date().toISOString();
      let updated: Workout | undefined;
      const next = items.map((w) => {
        if (w.id !== workoutId) return w;
        updated = {
          ...w,
          status,
          completedAt: completedAt === undefined ? w.completedAt : completedAt ?? undefined,
          updatedAt: now,
        };
        return updated;
      });
      await writeJson(wkKey(userId), next);
      if (!updated) throw new Error('Séance introuvable.');
      return updated;
    },
```

Add right after its closing `},` (before `async deletePlannedWorkout(userId, workoutId) {`):

```ts
    async setWorkoutHeartRate(userId, workoutId, summary) {
      const items = await readJson<Workout>(wkKey(userId));
      const now = new Date().toISOString();
      const next = items.map((w) =>
        w.id === workoutId
          ? { ...w, avgHeartRate: summary.avgHeartRate, maxHeartRate: summary.maxHeartRate, updatedAt: now }
          : w,
      );
      await writeJson(wkKey(userId), next);
    },
```

- [ ] **Step 3: Implement both methods in the Supabase repository**

In `apps/mobile/src/lib/data/repository.ts`, find the Supabase repository's `updateActivityMuscles`:

```ts
    async updateActivityMuscles(_userId, activityId, muscles) {
      return rowToActivity(await updateActivityMusclesDb(client, activityId, muscles));
    },
```

Add right after it:

```ts
    async setActivityHeartRate(_userId, activityId, summary) {
      await updateActivityHeartRateDb(client, activityId, summary);
    },
```

Then find the Supabase repository's `setWorkoutStatus`:

```ts
    async setWorkoutStatus(_userId, workoutId, status, completedAt) {
      const row = await updateWorkoutStatusDb(client, workoutId, status, completedAt);
      return rowToWorkout(row);
    },
```

Add right after it:

```ts
    async setWorkoutHeartRate(_userId, workoutId, summary) {
      await updateWorkoutHeartRateDb(client, workoutId, summary);
    },
```

- [ ] **Step 4: Import the new repository functions**

Near the top of `apps/mobile/src/lib/data/repository.ts`, find:

```ts
  updateActivityMuscles as updateActivityMusclesDb,
```

Add right after it:

```ts
  updateActivityHeartRate as updateActivityHeartRateDb,
```

Find:

```ts
  updateWorkoutStatus as updateWorkoutStatusDb,
```

Add right after it:

```ts
  updateWorkoutHeartRate as updateWorkoutHeartRateDb,
```

- [ ] **Step 5: Map the new fields in `rowToWorkout`**

In `apps/mobile/src/lib/data/repository.ts`, find:

```ts
function rowToWorkout(r: WorkoutRow): Workout {
  return {
    id: r.id,
    userId: r.user_id,
    programId: r.program_id ?? undefined,
    name: r.name,
    status: r.status,
    plannedFor: r.planned_for ?? undefined,
    completedAt: r.completed_at ?? undefined,
    durationSec: r.duration_sec ?? undefined,
    rpe: r.rpe ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
```

Replace with:

```ts
function rowToWorkout(r: WorkoutRow): Workout {
  return {
    id: r.id,
    userId: r.user_id,
    programId: r.program_id ?? undefined,
    name: r.name,
    status: r.status,
    plannedFor: r.planned_for ?? undefined,
    completedAt: r.completed_at ?? undefined,
    durationSec: r.duration_sec ?? undefined,
    rpe: r.rpe ?? undefined,
    avgHeartRate: r.avg_heart_rate ?? undefined,
    maxHeartRate: r.max_heart_rate ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
```

(`rowToActivity` already maps `avgHeartRate`/`maxHeartRate` — no change needed there.)

- [ ] **Step 6: Typecheck and lint**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json && npx eslint src/lib/data/repository.ts --ext .ts,.tsx`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/lib/data/repository.ts
git commit -m "Wire setWorkoutHeartRate/setActivityHeartRate through both repositories"
```

---

### Task 5: HealthKit client — permission + targeted heart-rate query

**Files:**
- Modify: `apps/mobile/src/features/connectors/healthKitClient.ios.ts`
- Modify: `apps/mobile/src/features/connectors/healthKitClient.ts`

**Interfaces:**
- Consumes: `summarizeHeartRate`, `SET_DURATION_ESTIMATE_SEC` (Task 1, from `@supotsu/connectors`).
- Produces: `export async function queryHeartRateSummary(start: Date, end: Date): Promise<{ avgHeartRate: number; maxHeartRate: number } | null>`

- [ ] **Step 1: Add the heart-rate type constant and authorization scope**

In `apps/mobile/src/features/connectors/healthKitClient.ios.ts`, find:

```ts
const STEP_COUNT_TYPE = 'HKQuantityTypeIdentifierStepCount' as const;
const SLEEP_TYPE = 'HKCategoryTypeIdentifierSleepAnalysis' as const;
const WORKOUT_TYPE = 'HKWorkoutTypeIdentifier' as const;
```

Replace with:

```ts
const STEP_COUNT_TYPE = 'HKQuantityTypeIdentifierStepCount' as const;
const SLEEP_TYPE = 'HKCategoryTypeIdentifierSleepAnalysis' as const;
const WORKOUT_TYPE = 'HKWorkoutTypeIdentifier' as const;
// Read on demand for a specific session's time window (queryHeartRateSummary)
// — never added to QUANTITY_TYPES, which does a bulk 3-year sweep on every
// sync; heart-rate sample volume over 3 years would be enormous.
const HEART_RATE_TYPE = 'HKQuantityTypeIdentifierHeartRate' as const;
```

Then find, inside `syncHealthKit`:

```ts
  await HealthKit.requestAuthorization({
    toRead: [...QUANTITY_TYPES.map((q) => q.id), STEP_COUNT_TYPE, SLEEP_TYPE, WORKOUT_TYPE],
    toShare: WRITE_TYPES,
  });
```

Replace with:

```ts
  await HealthKit.requestAuthorization({
    toRead: [...QUANTITY_TYPES.map((q) => q.id), STEP_COUNT_TYPE, SLEEP_TYPE, WORKOUT_TYPE, HEART_RATE_TYPE],
    toShare: WRITE_TYPES,
  });
```

- [ ] **Step 2: Add the `queryHeartRateSummary` function**

In `apps/mobile/src/features/connectors/healthKitClient.ios.ts`, update the import from `@supotsu/connectors` at the top:

```ts
import {
  normalizeHealthKitSamples,
  aggregateHealthKitSleep,
  aggregateHealthKitSleepSessions,
  normalizeHealthKitWorkout,
  type HKQuantitySample,
  type HKSleepSample,
  type HKWorkout,
  type ImportedActivity,
  type ImportedHealthMetric,
  type ImportedSleepSession,
} from '@supotsu/connectors';
```

Replace with:

```ts
import {
  normalizeHealthKitSamples,
  aggregateHealthKitSleep,
  aggregateHealthKitSleepSessions,
  normalizeHealthKitWorkout,
  summarizeHeartRate,
  SET_DURATION_ESTIMATE_SEC,
  type HKQuantitySample,
  type HKSleepSample,
  type HKWorkout,
  type HeartRateSummary,
  type ImportedActivity,
  type ImportedHealthMetric,
  type ImportedSleepSession,
} from '@supotsu/connectors';
```

Then add this new exported function right after `syncHealthKit`'s closing `}` (before the `/** Kaizen ActivityType → HealthKit's own workout-type enum, for writes. */` comment):

```ts
/**
 * Best-effort avg/max heart rate for one session's time window. Targeted —
 * called once per completed workout/activity, never part of the bulk sync
 * sweep above.
 */
export async function queryHeartRateSummary(start: Date, end: Date): Promise<HeartRateSummary | null> {
  if (!healthKitAvailable()) return null;
  try {
    const samples = await HealthKit.queryQuantitySamples(HEART_RATE_TYPE, {
      unit: 'count/min',
      limit: 0,
      ascending: true,
      filter: { date: { startDate: start, endDate: end } },
    });
    return summarizeHeartRate(samples.map((s) => ({ value: s.quantity })));
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Reuse the shared duration-estimate constant in `saveWorkoutToHealthKit`**

In the same file, find:

```ts
export async function saveWorkoutToHealthKit(setCount: number, at: Date = new Date()): Promise<void> {
  if (setCount <= 0) return;
  const durationSec = setCount * 90;
  const start = new Date(at.getTime() - durationSec * 1000);
  await HealthKit.saveWorkoutSample(HealthKit.WorkoutActivityType.traditionalStrengthTraining, [], start, at);
}
```

Replace `const durationSec = setCount * 90;` with:

```ts
  const durationSec = setCount * SET_DURATION_ESTIMATE_SEC;
```

(Full function afterward: same as before, just that one line changed.)

- [ ] **Step 4: Add the non-iOS stub**

In `apps/mobile/src/features/connectors/healthKitClient.ts`, add at the end of the file:

```ts

export async function queryHeartRateSummary(_start: Date, _end: Date): Promise<{ avgHeartRate: number; maxHeartRate: number } | null> {
  return null; // no-op off iOS
}
```

- [ ] **Step 5: Typecheck and lint**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json && npx eslint src/features/connectors/healthKitClient.ios.ts src/features/connectors/healthKitClient.ts --ext .ts,.tsx`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/features/connectors/healthKitClient.ios.ts apps/mobile/src/features/connectors/healthKitClient.ts
git commit -m "Add queryHeartRateSummary + HR read permission to HealthKit client"
```

---

### Task 6: Immediate attempt on completion (workouts + activities)

**Files:**
- Modify: `apps/mobile/src/lib/data/queries.ts`

**Interfaces:**
- Consumes: `queryHeartRateSummary` (Task 5); `estimateWorkoutHeartRateWindow`, `estimateActivityHeartRateWindow` (Task 1); `repo.setWorkoutHeartRate`, `repo.setActivityHeartRate` (Task 4).

- [ ] **Step 1: Import the new functions**

In `apps/mobile/src/lib/data/queries.ts`, find:

```ts
import { saveActivityToHealthKit, saveNutritionToHealthKit, saveWorkoutToHealthKit } from '@/features/connectors/healthKitClient';
```

Replace with:

```ts
import { queryHeartRateSummary, saveActivityToHealthKit, saveNutritionToHealthKit, saveWorkoutToHealthKit } from '@/features/connectors/healthKitClient';
```

Find:

```ts
import type {
  ImportedActivity,
  ImportedHealthMetric,
  ImportedRecord,
  ImportedSleepSession,
  ImportedWorkout,
} from '@supotsu/connectors';
```

Replace with:

```ts
import { estimateActivityHeartRateWindow, estimateWorkoutHeartRateWindow } from '@supotsu/connectors';
import type {
  ImportedActivity,
  ImportedHealthMetric,
  ImportedRecord,
  ImportedSleepSession,
  ImportedWorkout,
} from '@supotsu/connectors';
```

- [ ] **Step 2: Extend `useSetWorkoutStatus`**

Find:

```ts
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ['plannedWorkouts', user?.id] });
      qc.invalidateQueries({ queryKey: ['workouts', user?.id] });
      // This is the actual "I finished this session" moment — mirror it to
      // Apple Santé here rather than at creation time (still 'planned' then).
      if (input.status === 'completed') {
        void mirrorToHealthKit(async () => {
          const sets = await repo.getWorkoutSets(user!.id, input.workoutId);
          await saveWorkoutToHealthKit(sets.length, input.completedAt ? new Date(input.completedAt) : new Date());
        });
      }
    },
```

Replace with:

```ts
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ['plannedWorkouts', user?.id] });
      qc.invalidateQueries({ queryKey: ['workouts', user?.id] });
      // This is the actual "I finished this session" moment — mirror it to
      // Apple Santé here rather than at creation time (still 'planned' then),
      // and best-effort pull back the heart rate a connected watch recorded
      // over the same (estimated) window.
      if (input.status === 'completed') {
        void mirrorToHealthKit(async () => {
          const sets = await repo.getWorkoutSets(user!.id, input.workoutId);
          const completedAtIso = input.completedAt ?? new Date().toISOString();
          await saveWorkoutToHealthKit(sets.length, new Date(completedAtIso));
          const window = estimateWorkoutHeartRateWindow(completedAtIso, sets.length);
          const summary = await queryHeartRateSummary(new Date(window.start), new Date(window.end));
          if (summary) await repo.setWorkoutHeartRate(user!.id, input.workoutId, summary);
        });
      }
    },
```

- [ ] **Step 3: Extend `useAddActivity`**

Find:

```ts
export function useAddActivity() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ActivityInput) => repo.addActivity(user!.id, input),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ['activities', user?.id] });
      void mirrorToHealthKit(() => saveActivityToHealthKit(input));
    },
  });
}
```

Replace with:

```ts
export function useAddActivity() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ActivityInput) => repo.addActivity(user!.id, input),
    onSuccess: (data, input) => {
      qc.invalidateQueries({ queryKey: ['activities', user?.id] });
      void mirrorToHealthKit(() => saveActivityToHealthKit(input));
      // Only chase heart rate when the entry doesn't already carry one
      // (never overwrite a manual value the user just typed in).
      if (input.avgHeartRate == null) {
        void mirrorToHealthKit(async () => {
          const window = estimateActivityHeartRateWindow(input.startedAt, input.durationSec);
          const summary = await queryHeartRateSummary(new Date(window.start), new Date(window.end));
          if (summary) await repo.setActivityHeartRate(user!.id, data.id, summary);
        });
      }
    },
  });
}
```

- [ ] **Step 4: Typecheck and lint**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json && npx eslint src/lib/data/queries.ts --ext .ts,.tsx`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/lib/data/queries.ts
git commit -m "Attempt heart-rate merge immediately on workout completion / activity add"
```

---

### Task 7: Backfill ("rattrapage") on every HealthKit sync

**Files:**
- Modify: `apps/mobile/src/features/connectors/useHealthKitAutoSync.ts`

**Interfaces:**
- Consumes: `queryHeartRateSummary` (Task 5); `estimateWorkoutHeartRateWindow`, `estimateActivityHeartRateWindow` (Task 1); `createDataRepository`, `DataRepository` (existing, from `@/lib/data/repository`); `repo.listWorkouts`, `repo.listActivities`, `repo.getWorkoutSets`, `repo.setWorkoutHeartRate`, `repo.setActivityHeartRate` (existing/Task 4).

- [ ] **Step 1: Import what's needed**

In `apps/mobile/src/features/connectors/useHealthKitAutoSync.ts`, find:

```ts
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { healthKitAvailable, subscribeHealthKitChanges, syncHealthKit } from './healthKitClient';
import { useImportHealth } from '@/lib/data/queries';
import { useAuth } from '@/features/auth/AuthProvider';
import { secureStorage } from '@/lib/secure-storage';
```

Replace with:

```ts
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { estimateActivityHeartRateWindow, estimateWorkoutHeartRateWindow } from '@supotsu/connectors';
import { healthKitAvailable, queryHeartRateSummary, subscribeHealthKitChanges, syncHealthKit } from './healthKitClient';
import { useImportHealth } from '@/lib/data/queries';
import { useAuth } from '@/features/auth/AuthProvider';
import { secureStorage } from '@/lib/secure-storage';
import { createDataRepository, type DataRepository } from '@/lib/data/repository';
```

- [ ] **Step 2: Add the `backfillHeartRate` helper**

Add this function right before `export function useHealthKitAutoSync(): void {`:

```ts
const HEART_RATE_BACKFILL_DAYS = 3;

/**
 * Re-checks the last few days of completed workouts/activities still
 * missing heart rate and retries the same window-estimate-and-query step —
 * catching up once a watch's data has landed in Apple Santé after the
 * session's own completion (the immediate attempt in queries.ts can miss
 * this if the watch hadn't synced to the phone yet). Best-effort throughout.
 */
async function backfillHeartRate(userId: string, repo: DataRepository): Promise<void> {
  const cutoffMs = Date.now() - HEART_RATE_BACKFILL_DAYS * 24 * 60 * 60 * 1000;

  try {
    const workouts = await repo.listWorkouts(userId);
    for (const w of workouts) {
      if (w.status !== 'completed' || !w.completedAt || w.avgHeartRate != null) continue;
      if (new Date(w.completedAt).getTime() < cutoffMs) continue;
      const sets = await repo.getWorkoutSets(userId, w.id);
      const window = estimateWorkoutHeartRateWindow(w.completedAt, sets.length);
      const summary = await queryHeartRateSummary(new Date(window.start), new Date(window.end));
      if (summary) await repo.setWorkoutHeartRate(userId, w.id, summary);
    }
  } catch {
    // Best-effort.
  }

  try {
    const activities = await repo.listActivities(userId);
    for (const a of activities) {
      if (a.source === 'apple_health' || a.avgHeartRate != null) continue;
      if (new Date(a.startedAt).getTime() < cutoffMs) continue;
      const window = estimateActivityHeartRateWindow(a.startedAt, a.durationSec);
      const summary = await queryHeartRateSummary(new Date(window.start), new Date(window.end));
      if (summary) await repo.setActivityHeartRate(userId, a.id, summary);
    }
  } catch {
    // Best-effort.
  }
}
```

- [ ] **Step 3: Call it from `useHealthKitAutoSync`'s sync pass**

Find:

```ts
    const runSync = async (): Promise<void> => {
      try {
        const { activities, healthMetrics, sleepSessions } = await syncHealthKit();
        if (activities.length + healthMetrics.length + sleepSessions.length > 0) {
          await importRef.current.mutateAsync({ activities, healthMetrics, records: [], sleepSessions, workouts: [] });
        }
      } catch {
        // Best-effort — the manual button on the Devices screen is the fallback.
      }
    };
```

Replace with:

```ts
    const runSync = async (): Promise<void> => {
      try {
        const { activities, healthMetrics, sleepSessions } = await syncHealthKit();
        if (activities.length + healthMetrics.length + sleepSessions.length > 0) {
          await importRef.current.mutateAsync({ activities, healthMetrics, records: [], sleepSessions, workouts: [] });
        }
      } catch {
        // Best-effort — the manual button on the Devices screen is the fallback.
      }
      if (user) await backfillHeartRate(user.id, createDataRepository());
    };
```

- [ ] **Step 4: Call it from `useManualHealthKitSync`**

Find:

```ts
export function useManualHealthKitSync(): () => Promise<void> {
  const importHealth = useImportHealth();
  return async () => {
    if (Platform.OS !== 'ios' || !healthKitAvailable() || !(await isHealthKitConnected())) return;
    try {
      const { activities, healthMetrics, sleepSessions } = await syncHealthKit();
      if (activities.length + healthMetrics.length + sleepSessions.length > 0) {
        await importHealth.mutateAsync({ activities, healthMetrics, records: [], sleepSessions, workouts: [] });
      }
    } catch {
      // Best-effort — the caller still invalidates queries and re-reads whatever's stored.
    }
  };
}
```

Replace with:

```ts
export function useManualHealthKitSync(): () => Promise<void> {
  const { user } = useAuth();
  const importHealth = useImportHealth();
  return async () => {
    if (Platform.OS !== 'ios' || !healthKitAvailable() || !(await isHealthKitConnected())) return;
    try {
      const { activities, healthMetrics, sleepSessions } = await syncHealthKit();
      if (activities.length + healthMetrics.length + sleepSessions.length > 0) {
        await importHealth.mutateAsync({ activities, healthMetrics, records: [], sleepSessions, workouts: [] });
      }
    } catch {
      // Best-effort — the caller still invalidates queries and re-reads whatever's stored.
    }
    if (user) await backfillHeartRate(user.id, createDataRepository());
  };
}
```

- [ ] **Step 5: Typecheck and lint**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json && npx eslint src/features/connectors/useHealthKitAutoSync.ts --ext .ts,.tsx`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/features/connectors/useHealthKitAutoSync.ts
git commit -m "Backfill missing heart rate on every HealthKit sync pass"
```

---

### Task 8: Show heart rate on the workout detail screen

**Files:**
- Modify: `apps/mobile/src/features/training/WorkoutDetailScreen.tsx`
- Modify: `apps/mobile/src/i18n/locales/fr.json`, `en.json`, `es.json`, `pt.json`, `de.json`

**Interfaces:**
- Consumes: `Workout.avgHeartRate` (Task 2). `ActivityDetailScreen` already displays `activity.avgHeartRate`/`maxHeartRate` (pre-existing — no change needed there; only the data was missing, which Tasks 1-7 fix).

- [ ] **Step 1: Add the i18n key**

`WorkoutDetailScreen.tsx` already uses `t('sport.workoutDetail.stats.duration')`, `.rpe`, `.status`. Add a sibling `avgHeartRate` key to each of the 5 locale files, inside the existing `sport.workoutDetail.stats` object (find it by searching for `"rpe": "RPE"` or the language's translation of "RPE" in each file — `rpe` stays untranslated across all 5 locales since it's a fitness-domain abbreviation):

fr.json — inside `sport.workoutDetail.stats`, add:
```json
"avgHeartRate": "FC moyenne"
```

en.json:
```json
"avgHeartRate": "Avg heart rate"
```

es.json:
```json
"avgHeartRate": "FC media"
```

pt.json:
```json
"avgHeartRate": "FC média"
```

de.json:
```json
"avgHeartRate": "Ø Herzfrequenz"
```

Use this Python snippet to apply all 5 additively (run from `apps/mobile/src/i18n/locales`), verifying `sport.workoutDetail.stats` exists in each file first:

```bash
cd apps/mobile/src/i18n/locales
python3 -c "
import json
from collections import OrderedDict

texts = {
  'fr.json': 'FC moyenne',
  'en.json': 'Avg heart rate',
  'es.json': 'FC media',
  'pt.json': 'FC média',
  'de.json': 'Ø Herzfrequenz',
}

for fname, val in texts.items():
    with open(fname, encoding='utf-8') as f:
        d = json.load(f, object_pairs_hook=OrderedDict)
    d['sport']['workoutDetail']['stats']['avgHeartRate'] = val
    with open(fname, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
        f.write('\n')
print('done')
"
for f in fr en es pt de; do python3 -c "import json; json.load(open('\$f.json'))" && echo "\$f.json OK"; done
```

- [ ] **Step 2: Add the Stat to the Résumé row**

In `apps/mobile/src/features/training/WorkoutDetailScreen.tsx`, find:

```tsx
      {/* Résumé */}
      <View style={{ flexDirection: 'row', gap: spacing[3], marginTop: spacing[2] }}>
        <Stat label={t('sport.workoutDetail.stats.duration')} value={workout.durationSec ? fmtDur(workout.durationSec, t) : '—'} />
        <Stat label={t('sport.workoutDetail.stats.rpe')} value={workout.rpe != null ? `${workout.rpe}/10` : '—'} />
        <Stat label={t('sport.workoutDetail.stats.status')} value={status.label} />
      </View>
```

Replace with:

```tsx
      {/* Résumé */}
      <View style={{ flexDirection: 'row', gap: spacing[3], marginTop: spacing[2], flexWrap: 'wrap' }}>
        <Stat label={t('sport.workoutDetail.stats.duration')} value={workout.durationSec ? fmtDur(workout.durationSec, t) : '—'} />
        <Stat label={t('sport.workoutDetail.stats.rpe')} value={workout.rpe != null ? `${workout.rpe}/10` : '—'} />
        <Stat label={t('sport.workoutDetail.stats.status')} value={status.label} />
        {workout.avgHeartRate != null ? (
          <Stat label={t('sport.workoutDetail.stats.avgHeartRate')} value={`${workout.avgHeartRate} bpm`} />
        ) : null}
      </View>
```

(`flexWrap: 'wrap'` added since a 4th `Stat` — each `flex: 1` — would otherwise squeeze four tiles into one row too narrow to read; wrapping lets it drop to a second row on smaller screens when the 4th tile is present.)

- [ ] **Step 3: Typecheck and lint**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json && npx eslint src/features/training/WorkoutDetailScreen.tsx --ext .ts,.tsx`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/features/training/WorkoutDetailScreen.tsx apps/mobile/src/i18n/locales/*.json
git commit -m "Show avg heart rate on the workout detail screen"
```

---

### Task 9: Full regression + hand-off notes

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run` (from the repo root)
Expected: every test file passes, including the new `summarizeHeartRate`/`estimateWorkoutHeartRateWindow`/`estimateActivityHeartRateWindow` tests from Task 1.

- [ ] **Step 2: Full typecheck across touched packages**

Run:
```bash
cd packages/core && npx tsc --noEmit
cd ../connectors && npx tsc --noEmit
cd ../database && npx tsc --noEmit
cd ../../apps/mobile && npx tsc --noEmit -p tsconfig.json
```
Expected: no errors anywhere.

- [ ] **Step 3: Tell the user about the pending migration**

Migration `0027_workout_heart_rate.sql` (Task 2) — like 0025 and 0026 before it — needs to be applied manually against Supabase; this environment has no service-role key to run it directly. Until it's applied, `avg_heart_rate`/`max_heart_rate` writes on `workouts` will fail (best-effort code paths swallow the error, so nothing breaks visibly — heart rate just never appears for structured workouts until the column exists).
