# Bloc Hyrox — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `hyrox` block format — stations chained without rest, each with a fixed target (distance OR time, never both) and a logged result (the other one), plus an optional weight.

**Architecture:** Extend the existing multi-format block system (`BlockFormat`, `WorkoutBlock`, `SetEntry`) with a new `distanceM` field, reusing `durationSec` (already on `SetEntry` but unused at the per-set level). A new pure function `computeHyroxStationState` drives a new `HyroxRunner.tsx` component with a `work → log` phase cycle per station (modeled on `StrengthRunner`'s cycle, not on `ForTimeRunner`'s single continuous clock). No block-level rest/time-cap/rounds fields for this format.

**Tech Stack:** React Native/Expo, TypeScript, Supabase/Postgres, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-18-hyrox-block-format-design.md`

## Global Constraints

- A station's mode (distance-target vs time-target) is inferred from which of `distanceM`/`durationSec` is set at creation — no separate mode field is persisted.
- No block-level `restSec`/`timeCapSec`/`targetRounds` UI for the `hyrox` format.
- Every duplicated path for a set field must be updated together: `blocksToWorkoutInput` AND `blocksToSessionInput` (session-builder, Task 6); `addCircuitWorkout`, `addSetsToWorkout`, `editCircuitWorkout`, `logSet`, and `getBlockSets` — each duplicated once for the demo repo and once for Supabase (Task 5, 7 functions × 2) — a past Tabata addition missed one of these copies once; don't repeat it.
- Format CHECK constraints on `workout_blocks`/`user_session_blocks` are already named explicitly (`workout_blocks_format_valid`, `user_session_blocks_format_valid` since migration 0030) — adding `hyrox` is a one-line change per table, not a rename dance.

---

### Task 1: `computeHyroxStationState` (pure logic, TDD)

**Files:**
- Modify: `apps/mobile/src/features/training/blockRunnerEngine.ts`
- Test: `apps/mobile/src/features/training/blockRunnerEngine.test.ts`

**Interfaces:**
- Produces: `export interface HyroxStationState { displaySec: number; isFinished: boolean; }` and `export function computeHyroxStationState(elapsedSec: number, station: { distanceM?: number; durationSec?: number }): HyroxStationState`

- [ ] **Step 1: Write the failing tests**

Add to `apps/mobile/src/features/training/blockRunnerEngine.test.ts`, after the `computeForTimeState` describe block:

```ts
describe('computeHyroxStationState', () => {
  it('distance-target station: counts up, never finishes on its own', () => {
    expect(computeHyroxStationState(0, { distanceM: 1000 })).toEqual({ displaySec: 0, isFinished: false });
    expect(computeHyroxStationState(187, { distanceM: 1000 })).toEqual({ displaySec: 187, isFinished: false });
    expect(computeHyroxStationState(99999, { distanceM: 1000 })).toEqual({ displaySec: 99999, isFinished: false });
  });

  it('time-target station: counts down, finishes automatically at zero', () => {
    expect(computeHyroxStationState(0, { durationSec: 240 })).toEqual({ displaySec: 240, isFinished: false });
    expect(computeHyroxStationState(180, { durationSec: 240 })).toEqual({ displaySec: 60, isFinished: false });
    expect(computeHyroxStationState(240, { durationSec: 240 })).toEqual({ displaySec: 0, isFinished: true });
  });

  it('time-target station: clamps past the target instead of going negative', () => {
    expect(computeHyroxStationState(300, { durationSec: 240 })).toEqual({ displaySec: 0, isFinished: true });
  });
});
```

Also update the import line at the top of the test file to include the new function:

```ts
import { computeAmrapState, computeEmomState, computeForTimeState, computeHyroxStationState, formatClock, supersetPartners } from './blockRunnerEngine';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/mobile && npx vitest run src/features/training/blockRunnerEngine.test.ts`
Expected: FAIL — `computeHyroxStationState` is not exported.

- [ ] **Step 3: Implement**

Add to `apps/mobile/src/features/training/blockRunnerEngine.ts`, after `computeForTimeState`:

```ts
/** One Hyrox station's live timing state — distinct from `BlockRunnerState`, which is per-block. */
export interface HyroxStationState {
  /** Counts up for a distance-target station, down for a time-target one. */
  displaySec: number;
  /** True once a time-target station's countdown hits zero — the log phase should start automatically. Always false for a distance-target station, which the runner ends manually. */
  isFinished: boolean;
}

/**
 * Hyrox: a station's target is whichever of `distanceM`/`durationSec` is set
 * at creation — never both. The other one is what the runner logs once the
 * station is done, so this function only ever reads the target field.
 *
 * Distance-target: chronomètre, personne ne sait à l'avance combien de temps
 * ça prendra, donc pas de fin automatique. Time-target: décompte classique,
 * fin automatique à zéro comme n'importe quel minuteur de travail.
 */
export function computeHyroxStationState(elapsedSec: number, station: { distanceM?: number; durationSec?: number }): HyroxStationState {
  if (station.durationSec != null) {
    const remaining = Math.max(0, station.durationSec - elapsedSec);
    return { displaySec: remaining, isFinished: remaining <= 0 };
  }
  return { displaySec: elapsedSec, isFinished: false };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/mobile && npx vitest run src/features/training/blockRunnerEngine.test.ts`
Expected: PASS, all tests including the 3 new ones.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/training/blockRunnerEngine.ts apps/mobile/src/features/training/blockRunnerEngine.test.ts
git commit -m "Ajouter computeHyroxStationState (chronomètre ou décompte par station)"
```

---

### Task 2: Core types

**Files:**
- Modify: `packages/core/src/training.ts`
- Modify: `packages/core/src/user-programs.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `BlockFormat` includes `'hyrox'`; `SetEntry.distanceM?: number`; `UserSessionExercise.distanceM?: number`.

- [ ] **Step 1: Add `'hyrox'` to `BlockFormat` and `distanceM` to `SetEntry`**

In `packages/core/src/training.ts`, change:

```ts
export type BlockFormat = 'strength' | 'amrap' | 'emom' | 'for_time' | 'tabata';
```

to:

```ts
export type BlockFormat = 'strength' | 'amrap' | 'emom' | 'for_time' | 'tabata' | 'hyrox';
```

And in the `SetEntry` interface, add after `durationSec?: number;`:

```ts
  /** Hyrox station target or result, in meters — whichever of this and `durationSec` is set at creation is the station's fixed target; the runner fills in the other one once the station is done. Unused by every other format. */
  distanceM?: number;
```

- [ ] **Step 2: Mirror `distanceM` on `UserSessionExercise`**

In `packages/core/src/user-programs.ts`, add to `UserSessionExercise` (after `durationSec?: number;`):

```ts
  /** Mirrors SetEntry.distanceM — see its doc comment. */
  distanceM?: number;
```

- [ ] **Step 3: Type-check**

Run: `cd packages/core && npx tsc --noEmit -p tsconfig.json`
Expected: PASS (no consumers yet reference the new members, so nothing else should break).

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "reminderScheduler\|notificationHost"`
Expected: PASS — `BlockFormat` gaining a member doesn't break existing exhaustive `if/else` chains (none of them are typed as exhaustive switches with a `never` check), only widens what's assignable.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/training.ts packages/core/src/user-programs.ts
git commit -m "Ajouter le format hyrox et SetEntry.distanceM/UserSessionExercise.distanceM"
```

---

### Task 3: Shared zod schemas

**Files:**
- Modify: `packages/shared/src/schemas.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `sessionBlockInputSchema.format` accepts `'hyrox'`; `sessionExerciseInputSchema` accepts `distanceM`.

- [ ] **Step 1: Update the schemas**

In `packages/shared/src/schemas.ts`, change:

```ts
export const sessionExerciseInputSchema = z.object({
  exerciseId: z.string().min(1),
  order: z.number().int().nonnegative().default(0),
  reps: z.number().int().positive().max(1000).optional(),
  weightKg: z.number().nonnegative().max(1000).optional(),
  durationSec: z.number().int().positive().max(36000).optional(),
  restSec: z.number().int().nonnegative().max(3600).optional(),
});
```

to:

```ts
export const sessionExerciseInputSchema = z.object({
  exerciseId: z.string().min(1),
  order: z.number().int().nonnegative().default(0),
  reps: z.number().int().positive().max(1000).optional(),
  weightKg: z.number().nonnegative().max(1000).optional(),
  durationSec: z.number().int().positive().max(36000).optional(),
  restSec: z.number().int().nonnegative().max(3600).optional(),
  /** Hyrox station distance target/result, in meters. */
  distanceM: z.number().positive().max(100000).optional(),
});
```

And change:

```ts
export const sessionBlockInputSchema = z.object({
  format: z.enum(['strength', 'amrap', 'emom', 'for_time', 'tabata']),
```

to:

```ts
export const sessionBlockInputSchema = z.object({
  format: z.enum(['strength', 'amrap', 'emom', 'for_time', 'tabata', 'hyrox']),
```

- [ ] **Step 2: Type-check**

Run: `cd packages/shared && npx tsc --noEmit -p tsconfig.json`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/schemas.ts
git commit -m "Accepter le format hyrox et distanceM dans les schémas de séance"
```

---

### Task 4: Supabase migration + generated types

**Files:**
- Create: `supabase/migrations/0034_hyrox_block_format.sql`
- Modify: `packages/database/src/generated/database.types.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `distance_m numeric` column on `workout_sets` and `user_session_exercises`; `'hyrox'` accepted by the format CHECK on `workout_blocks`/`user_session_blocks`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0034_hyrox_block_format.sql`:

```sql
-- ---------------------------------------------------------------------------
-- Hyrox block format.
--
-- Chaque station a un objectif fixé à la création dans distance_m OU
-- duration_sec (jamais les deux) ; le runner remplit l'autre à la fin de la
-- station. Pas de nouvelle colonne de "mode" : lequel des deux est renseigné
-- suffit à le déduire (voir SetEntry.distanceM).
--
-- Les contraintes de format sont déjà nommées explicitement depuis 0030
-- (workout_blocks_format_valid, user_session_blocks_format_valid) : ajouter
-- un format est donc un changement d'une ligne par table, pas une danse de
-- renommage.
-- ---------------------------------------------------------------------------

alter table public.workout_blocks
  drop constraint if exists workout_blocks_format_valid;
alter table public.workout_blocks
  add constraint workout_blocks_format_valid
  check (format in ('strength', 'amrap', 'emom', 'for_time', 'tabata', 'hyrox'));

alter table public.user_session_blocks
  drop constraint if exists user_session_blocks_format_valid;
alter table public.user_session_blocks
  add constraint user_session_blocks_format_valid
  check (format in ('strength', 'amrap', 'emom', 'for_time', 'tabata', 'hyrox'));

alter table public.workout_sets
  add column if not exists distance_m numeric;

alter table public.user_session_exercises
  add column if not exists distance_m numeric;
```

- [ ] **Step 2: Update the generated types to match**

In `packages/database/src/generated/database.types.ts`:

1. In the `workout_blocks` table's `Row` and `Insert` shapes, change both occurrences of
   `format: 'strength' | 'amrap' | 'emom' | 'for_time' | 'tabata';`
   to
   `format: 'strength' | 'amrap' | 'emom' | 'for_time' | 'tabata' | 'hyrox';`

2. In the `user_session_blocks` table's `Row` and `Insert` shapes, change both occurrences of
   `format: 'strength' | 'amrap' | 'emom' | 'for_time' | 'tabata';`
   to
   `format: 'strength' | 'amrap' | 'emom' | 'for_time' | 'tabata' | 'hyrox';`

3. In the `workout_sets` table's `Row` shape, add after `rest_sec: number | null;`:
   `distance_m: number | null;`
   And in its `Insert` shape, add after `rest_sec?: number | null;`:
   `distance_m?: number | null;`

4. In the `user_session_exercises` table's `Row` shape, add after `rest_sec: number | null;`:
   `distance_m: number | null;`
   And in its `Insert` shape, add after `rest_sec?: number | null;`:
   `distance_m?: number | null;`

- [ ] **Step 3: Type-check**

Run: `cd packages/database && npx tsc --noEmit -p tsconfig.json`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0034_hyrox_block_format.sql packages/database/src/generated/database.types.ts
git commit -m "Migration : format hyrox + colonne distance_m"
```

---

### Task 5: Repository — every write and read path for a set

**Files:**
- Modify: `apps/mobile/src/lib/data/repository.ts`
- Modify: `packages/database/src/repositories/workouts.ts`

**Interfaces:**
- Consumes: `Database['public']['Tables']['workout_sets']['Insert'].distance_m` (Task 4), `SetEntry.distanceM` (Task 2).
- Produces: `SetLogInput.distanceM?/durationSec?`, `NewRunnerSet.distanceM?`, `LoggedSetRow.distanceM?/durationSec?`, `SetLogPatch.distanceM?/durationSec?` all carry the new fields end to end.

**Why this task has so many sub-steps:** `distanceM` has to survive seven independent code paths — create (`addCircuitWorkout`, `addSetsToWorkout`), edit (`editCircuitWorkout`), log (`logSet`), and read back (`getBlockSets`) — each duplicated once for the demo repo and once for Supabase. This is exactly the class of mistake the Tabata addition made once (a duplicated path silently missed); the fix here is to touch all seven deliberately, in one pass, rather than trust memory.

- [ ] **Step 1: Extend the four local interfaces**

In `apps/mobile/src/lib/data/repository.ts`:

Change `NewRunnerSet` (used only by `addSetsToWorkout`):

```ts
export interface NewRunnerSet {
  exerciseId: string;
  order: number;
  blockId?: string;
  reps?: number;
  weightKg?: number;
  restSec?: number;
  isWarmup?: boolean;
}
```

to:

```ts
export interface NewRunnerSet {
  exerciseId: string;
  order: number;
  blockId?: string;
  reps?: number;
  weightKg?: number;
  restSec?: number;
  /** Hyrox station target, in meters — see SetEntry.distanceM. */
  distanceM?: number;
  isWarmup?: boolean;
}
```

(`NewCircuitBlockInput.sets` and `PlannedInput.blocks[].sets`, used by `addCircuitWorkout`/`editCircuitWorkout`/`PlannedInput`, are typed as `Omit<SetEntry, ...>[]` — they already gained `distanceM` for free from Task 2, no change needed there.)

Change `SetLogInput`:

```ts
export interface SetLogInput {
  reps?: number;
  weightKg?: number;
  rpe?: number;
  rir?: number;
  completedAt: string;
}
```

to:

```ts
export interface SetLogInput {
  reps?: number;
  weightKg?: number;
  rpe?: number;
  rir?: number;
  /** Hyrox: the distance achieved, logged once a time-target station's countdown ends. */
  distanceM?: number;
  /** Hyrox: the time a distance-target station took, measured by the runner's clock. */
  durationSec?: number;
  completedAt: string;
}
```

Change `LoggedSetRow` (the demo repo's on-disk row shape — currently missing `durationSec` entirely, which is why the demo repo has never round-tripped it):

```ts
interface LoggedSetRow {
  /** Stable id, absent from rows written before lot 2a — readers fall back to the synthesized form. */
  id?: string;
  workoutId: string;
  blockId?: string;
  exerciseId: string;
  order: number;
  reps: number | null;
  weightKg: number | null;
  restSec?: number | null;
  supersetGroup?: number | null;
  plannedReps?: number | null;
  plannedWeightKg?: number | null;
  rir?: number | null;
  isWarmup?: boolean;
  completedAt?: string | null;
}
```

to:

```ts
interface LoggedSetRow {
  /** Stable id, absent from rows written before lot 2a — readers fall back to the synthesized form. */
  id?: string;
  workoutId: string;
  blockId?: string;
  exerciseId: string;
  order: number;
  reps: number | null;
  weightKg: number | null;
  restSec?: number | null;
  supersetGroup?: number | null;
  plannedReps?: number | null;
  plannedWeightKg?: number | null;
  rir?: number | null;
  isWarmup?: boolean;
  completedAt?: string | null;
  /** Hyrox station target or result, in meters — see SetEntry.distanceM. */
  distanceM?: number | null;
  /** Hyrox station target or result, in seconds. Was never stored by the demo repo before this — no other format needed a per-set duration. */
  durationSec?: number | null;
}
```

In `packages/database/src/repositories/workouts.ts`, change `SetLogPatch` (a separate type from `SetLogInput` above — `logSet`'s Supabase implementation passes `done` straight through to it, so both need the same two fields):

```ts
export interface SetLogPatch {
  reps?: number;
  weightKg?: number;
  rpe?: number;
  rir?: number;
  completedAt: string;
}
```

to:

```ts
export interface SetLogPatch {
  reps?: number;
  weightKg?: number;
  rpe?: number;
  rir?: number;
  /** Hyrox: the distance achieved, logged once a time-target station's countdown ends. */
  distanceM?: number;
  /** Hyrox: the time a distance-target station took, measured by the runner's clock. */
  durationSec?: number;
  completedAt: string;
}
```

- [ ] **Step 2: Demo `logSet` writes the new fields, preserving whichever one is the station's fixed target**

In `apps/mobile/src/lib/data/repository.ts`, change:

```ts
    async logSet(userId, setId, done) {
      const rows = await readJson<LoggedSetRow & { date: string }>(setKey(userId));
      await writeJson(
        setKey(userId),
        rows.map((r) => {
          const id = r.id ?? `${r.workoutId}-${r.order}`;
          const blockId = r.id ?? `${r.workoutId}-${r.blockId}-${r.order}`;
          if (id !== setId && blockId !== setId) return r;
          return {
            ...r,
            reps: done.reps ?? null,
            weightKg: done.weightKg ?? null,
            rir: done.rir ?? null,
            completedAt: done.completedAt,
          };
        }),
      );
    },
```

to:

```ts
    async logSet(userId, setId, done) {
      const rows = await readJson<LoggedSetRow & { date: string }>(setKey(userId));
      await writeJson(
        setKey(userId),
        rows.map((r) => {
          const id = r.id ?? `${r.workoutId}-${r.order}`;
          const blockId = r.id ?? `${r.workoutId}-${r.blockId}-${r.order}`;
          if (id !== setId && blockId !== setId) return r;
          return {
            ...r,
            reps: done.reps ?? null,
            weightKg: done.weightKg ?? null,
            rir: done.rir ?? null,
            // `?? r.distanceM`/`?? r.durationSec`, not `?? null`: whichever of the
            // two was this station's fixed target at creation must survive a log
            // call that only ever supplies the *other* one.
            distanceM: done.distanceM ?? r.distanceM ?? null,
            durationSec: done.durationSec ?? r.durationSec ?? null,
            completedAt: done.completedAt,
          };
        }),
      );
    },
```

- [ ] **Step 3: Supabase `updateSetLog` writes the new fields without erasing the station's target**

In `packages/database/src/repositories/workouts.ts`, change:

```ts
export async function updateSetLog(
  client: SupotsuClient,
  setId: string,
  done: SetLogPatch,
): Promise<WorkoutSetRow> {
  const { data, error } = await client
    .from('workout_sets')
    .update({
      reps: done.reps ?? null,
      weight_kg: done.weightKg ?? null,
      rpe: done.rpe ?? null,
      rir: done.rir ?? null,
      completed_at: done.completedAt,
    })
    .eq('id', setId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}
```

to:

```ts
export async function updateSetLog(
  client: SupotsuClient,
  setId: string,
  done: SetLogPatch,
): Promise<WorkoutSetRow> {
  const { data, error } = await client
    .from('workout_sets')
    .update({
      reps: done.reps ?? null,
      weight_kg: done.weightKg ?? null,
      rpe: done.rpe ?? null,
      rir: done.rir ?? null,
      completed_at: done.completedAt,
      // Unlike the fields above, distance/duration are NOT reset to null when
      // absent: whichever of the two is this station's fixed target (set at
      // creation, never part of a log call) must survive. Omitting the key
      // entirely — not `?? null` — is what makes Postgrest leave the column
      // untouched.
      ...(done.distanceM !== undefined ? { distance_m: done.distanceM } : {}),
      ...(done.durationSec !== undefined ? { duration_sec: done.durationSec } : {}),
    })
    .eq('id', setId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}
```

- [ ] **Step 4: Creation and edit paths forward `distanceM` (both repos, 3 functions each)**

In `apps/mobile/src/lib/data/repository.ts`, the demo repo's `addCircuitWorkout`, `addSetsToWorkout`, and `editCircuitWorkout` each build a `LoggedSetRow`-shaped object per set. Add `distanceM: s.distanceM ?? null,` to each (alongside the existing `restSec: s.restSec ?? null,` line in each):

- `addCircuitWorkout`'s `newSets.push({...})` (~line 1372)
- `addSetsToWorkout`'s `sets.map((s) => ({...}))` (~line 1470)
- `editCircuitWorkout`'s `newSets.push({...})` (~line 1516)

The Supabase repo's equivalents already map `duration_sec: s.durationSec ?? null,` (added for a prior format and never used until now) — add `distance_m: s.distanceM ?? null,` next to it in each:

- `addCircuitWorkout`'s `sets: b.sets.map((s) => ({...}))` (~line 3269)
- `addSetsToWorkout`'s `sets.map((s) => ({...}))` passed to `insertWorkoutSets` (~line 3319)
- `editCircuitWorkout`'s `sets: b.sets.map((s) => ({...}))` passed to `replaceWorkoutBlocksDb` (~line 3352)

- [ ] **Step 5: `getBlockSets` reads `distanceM` back (both repos)**

In `apps/mobile/src/lib/data/repository.ts`, the demo repo's `getBlockSets` (~line 1397) maps `LoggedSetRow` to `SetEntry` field by field but never reads `durationSec` either. Change:

```ts
        .map((r) => ({
          id: r.id ?? `${r.workoutId}-${r.blockId}-${r.order}`,
          workoutId: r.workoutId,
          blockId: r.blockId,
          exerciseId: r.exerciseId,
          order: r.order,
          reps: r.reps ?? undefined,
          weightKg: r.weightKg ?? undefined,
          restSec: r.restSec ?? undefined,
          supersetGroup: r.supersetGroup ?? undefined,
          plannedReps: r.plannedReps ?? undefined,
          plannedWeightKg: r.plannedWeightKg ?? undefined,
          rir: r.rir ?? undefined,
          isWarmup: r.isWarmup ?? undefined,
          completedAt: r.completedAt ?? undefined,
        }));
```

to:

```ts
        .map((r) => ({
          id: r.id ?? `${r.workoutId}-${r.blockId}-${r.order}`,
          workoutId: r.workoutId,
          blockId: r.blockId,
          exerciseId: r.exerciseId,
          order: r.order,
          reps: r.reps ?? undefined,
          weightKg: r.weightKg ?? undefined,
          restSec: r.restSec ?? undefined,
          supersetGroup: r.supersetGroup ?? undefined,
          plannedReps: r.plannedReps ?? undefined,
          plannedWeightKg: r.plannedWeightKg ?? undefined,
          rir: r.rir ?? undefined,
          isWarmup: r.isWarmup ?? undefined,
          completedAt: r.completedAt ?? undefined,
          distanceM: r.distanceM ?? undefined,
          durationSec: r.durationSec ?? undefined,
        }));
```

The Supabase repo's `getBlockSets` (~line 3288) already reads `durationSec: r.duration_sec ?? undefined,` — add `distanceM: r.distance_m ?? undefined,` next to it in the same mapped object.

- [ ] **Step 6: Type-check**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "reminderScheduler\|notificationHost"`
Expected: PASS.

Run: `cd packages/database && npx tsc --noEmit -p tsconfig.json`
Expected: PASS.

- [ ] **Step 7: Full test suite**

Run: `cd packages/database && npx vitest run`
Expected: PASS — `updateSetLog` isn't directly unit-tested today, so this just guards against a syntax/type slip elsewhere in the file.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/lib/data/repository.ts packages/database/src/repositories/workouts.ts
git commit -m "Faire circuler distanceM sur les 7 chemins d'écriture/lecture d'une série"
```

---

### Task 6: `sessionBuilder.ts` — draft state and both submission mappings

**Files:**
- Modify: `apps/mobile/src/features/training/sessionBuilder.ts`
- Modify: `apps/mobile/src/features/training/sessionBuilder.test.ts`

**Interfaces:**
- Consumes: `BlockFormat` (Task 2), `SessionExerciseInput` (Task 3).
- Produces: `SetDraft.distance?: string`, `SetDraft.duration?: string`, `SetDraft.hyroxMode?: 'distance' | 'time'`; `formatLabel('hyrox', t)` returns `'Hyrox'`; `blocksToWorkoutInput`/`blocksToSessionInput` carry `distanceM`/`durationSec` for hyrox sets.

**Note:** `distance`/`duration` must be **optional**, not required like `reps`/`weight`/`rest` are. Dozens of existing test literals across `sessionBuilder.test.ts` and `sessionToDrafts.test.ts` construct a `SetDraft`/`selected` entry with only `{ exerciseId, reps, weight, rest }` — making the new fields mandatory would turn every one of those into a type error. `isWarmup?` already sets the precedent for "optional, not every format uses it".

- [ ] **Step 1: Extend `SetDraft` and `emptySet`**

Change:

```ts
export interface SetDraft {
  /** The real exercise this slot references — `order`/`selected` are keyed by a synthetic slot id, not this, so the same exercise can appear more than once in a block. */
  exerciseId: string;
  reps: string;
  weight: string;
  rest: string;
  /** Warm-up slot: kept out of volume and records. Set by the runner's auto-ramp (lot 2) or by hand. */
  isWarmup?: boolean;
}
```

to:

```ts
export interface SetDraft {
  /** The real exercise this slot references — `order`/`selected` are keyed by a synthetic slot id, not this, so the same exercise can appear more than once in a block. */
  exerciseId: string;
  reps: string;
  weight: string;
  rest: string;
  /** Hyrox station distance target, in meters — meaningful only when `hyroxMode` is `'distance'`. Optional like `isWarmup`: no other format sets it. */
  distance?: string;
  /** Hyrox station time target, in seconds — meaningful only when `hyroxMode` is `'time'`. Optional like `isWarmup`: no other format sets it. */
  duration?: string;
  /** Which of `distance`/`duration` is this station's fixed target — builder UI state only, never persisted (the saved set only ever carries the one field that matters; this flag exists purely to decide which single input to show). Defaults to `'distance'`. */
  hyroxMode?: 'distance' | 'time';
  /** Warm-up slot: kept out of volume and records. Set by the runner's auto-ramp (lot 2) or by hand. */
  isWarmup?: boolean;
}
```

Change:

```ts
export const emptySet = (exerciseId: string): SetDraft => ({ exerciseId, reps: '', weight: '', rest: '' });
```

to:

```ts
export const emptySet = (exerciseId: string): SetDraft => ({ exerciseId, reps: '', weight: '', rest: '', distance: '', duration: '', hyroxMode: 'distance' });
```

- [ ] **Step 2: `formatLabel` gains Hyrox**

Change:

```ts
export function formatLabel(format: BlockFormat, t: TFunction): string {
  if (format === 'strength') return t('sport.sessionBuilder.blockFormat.strength');
  if (format === 'for_time') return t('sport.sessionBuilder.blockFormat.forTime');
  if (format === 'amrap') return 'AMRAP';
  if (format === 'tabata') return 'Tabata';
  return 'EMOM';
}
```

to:

```ts
export function formatLabel(format: BlockFormat, t: TFunction): string {
  if (format === 'strength') return t('sport.sessionBuilder.blockFormat.strength');
  if (format === 'for_time') return t('sport.sessionBuilder.blockFormat.forTime');
  if (format === 'amrap') return 'AMRAP';
  if (format === 'tabata') return 'Tabata';
  if (format === 'hyrox') return 'Hyrox';
  return 'EMOM';
}
```

- [ ] **Step 3: `blocksToWorkoutInput` carries `distanceM`/`durationSec`**

Change the function's return type annotation and body:

```ts
export function blocksToWorkoutInput(blocks: BlockDraft[]): {
  format: BlockFormat;
  timeCapSec?: number;
  restSec?: number;
  targetRounds?: number;
  sets: {
    exerciseId: string;
    order: number;
    reps?: number;
    weightKg?: number;
    restSec?: number;
    isWarmup?: boolean;
    supersetGroup?: number;
  }[];
}[] {
  return blocks.map((b) => ({
    format: b.format,
    timeCapSec: timeCapSecondsOf(b),
    // 0 est un repos légitime (Tabata dégénéré en EMOM), donc test explicite.
    restSec: b.format === 'tabata' && b.restSec.trim() !== '' ? Number(b.restSec) : undefined,
    targetRounds: HAS_ROUNDS.includes(b.format) ? Number(b.targetRounds) || undefined : undefined,
    sets: b.order.map((slotId, i) => {
      const s = b.selected[slotId]!;
      return {
        exerciseId: s.exerciseId,
        order: i,
        reps: s.reps ? Number(s.reps) : undefined,
        weightKg: s.weight ? Number(s.weight) : undefined,
        restSec: b.format === 'strength' && s.rest ? Number(s.rest) : undefined,
        isWarmup: s.isWarmup,
        supersetGroup: b.supersetGroups[slotId],
      };
    }),
  }));
}
```

to:

```ts
export function blocksToWorkoutInput(blocks: BlockDraft[]): {
  format: BlockFormat;
  timeCapSec?: number;
  restSec?: number;
  targetRounds?: number;
  sets: {
    exerciseId: string;
    order: number;
    reps?: number;
    weightKg?: number;
    restSec?: number;
    distanceM?: number;
    durationSec?: number;
    isWarmup?: boolean;
    supersetGroup?: number;
  }[];
}[] {
  return blocks.map((b) => ({
    format: b.format,
    timeCapSec: timeCapSecondsOf(b),
    // 0 est un repos légitime (Tabata dégénéré en EMOM), donc test explicite.
    restSec: b.format === 'tabata' && b.restSec.trim() !== '' ? Number(b.restSec) : undefined,
    targetRounds: HAS_ROUNDS.includes(b.format) ? Number(b.targetRounds) || undefined : undefined,
    sets: b.order.map((slotId, i) => {
      const s = b.selected[slotId]!;
      const isHyroxTime = b.format === 'hyrox' && s.hyroxMode === 'time';
      return {
        exerciseId: s.exerciseId,
        order: i,
        reps: s.reps ? Number(s.reps) : undefined,
        weightKg: s.weight ? Number(s.weight) : undefined,
        restSec: b.format === 'strength' && s.rest ? Number(s.rest) : undefined,
        distanceM: b.format === 'hyrox' && !isHyroxTime && s.distance ? Number(s.distance) : undefined,
        durationSec: isHyroxTime && s.duration ? Number(s.duration) : undefined,
        isWarmup: s.isWarmup,
        supersetGroup: b.supersetGroups[slotId],
      };
    }),
  }));
}
```

- [ ] **Step 4: `blocksToSessionInput` carries `distanceM`/`durationSec`**

Change:

```ts
      exercises.push({
        exerciseId: draft.exerciseId,
        order: exercises.length,
        reps: draft.reps ? Number(draft.reps) : undefined,
        weightKg: draft.weight ? Number(draft.weight) : undefined,
        restSec: block.format === 'strength' && draft.rest ? Number(draft.rest) : undefined,
      });
```

to:

```ts
      const isHyroxTime = block.format === 'hyrox' && draft.hyroxMode === 'time';
      exercises.push({
        exerciseId: draft.exerciseId,
        order: exercises.length,
        reps: draft.reps ? Number(draft.reps) : undefined,
        weightKg: draft.weight ? Number(draft.weight) : undefined,
        restSec: block.format === 'strength' && draft.rest ? Number(draft.rest) : undefined,
        distanceM: block.format === 'hyrox' && !isHyroxTime && draft.distance ? Number(draft.distance) : undefined,
        durationSec: isHyroxTime && draft.duration ? Number(draft.duration) : undefined,
      });
```

- [ ] **Step 5: Add Hyrox coverage to `sessionBuilder.test.ts`**

In the `describe('blocksToWorkoutInput', ...)` block, add after the last existing `it(...)`:

```ts
  it('mappe la distance pour une station distance, la durée pour une station temps', () => {
    const [out] = blocksToWorkoutInput([
      withSlot({
        format: 'hyrox',
        order: ['slot-1', 'slot-2'],
        selected: {
          'slot-1': { exerciseId: 'rowing', reps: '', weight: '20', rest: '', distance: '1000', hyroxMode: 'distance' },
          'slot-2': { exerciseId: 'skierg', reps: '', weight: '', rest: '', duration: '240', hyroxMode: 'time' },
        },
      }),
    ]);
    expect(out!.sets[0]).toMatchObject({ exerciseId: 'rowing', distanceM: 1000, durationSec: undefined, weightKg: 20 });
    expect(out!.sets[1]).toMatchObject({ exerciseId: 'skierg', distanceM: undefined, durationSec: 240 });
  });

  it('ne pose ni distance ni durée sur un format qui n est pas hyrox', () => {
    const [out] = blocksToWorkoutInput([withSlot({ format: 'strength' })]);
    expect(out!.sets[0]!.distanceM).toBeUndefined();
    expect(out!.sets[0]!.durationSec).toBeUndefined();
  });
```

In the `describe('blocksToSessionInput', ...)` block, add after its last existing `it(...)`:

```ts
  it('mappe la distance et la durée d un bloc hyrox', () => {
    const b = block({
      format: 'hyrox',
      order: ['slot1', 'slot2'],
      selected: {
        slot1: { exerciseId: 'rowing', reps: '', weight: '', rest: '', distance: '1000', hyroxMode: 'distance' },
        slot2: { exerciseId: 'skierg', reps: '', weight: '', rest: '', duration: '240', hyroxMode: 'time' },
      },
    });
    const [out] = blocksToSessionInput([b]);
    expect(out!.exercises[0]).toMatchObject({ exerciseId: 'rowing', distanceM: 1000, durationSec: undefined });
    expect(out!.exercises[1]).toMatchObject({ exerciseId: 'skierg', distanceM: undefined, durationSec: 240 });
  });
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/mobile && npx vitest run src/features/training/sessionBuilder.test.ts`
Expected: PASS, including the 3 new tests.

- [ ] **Step 7: Type-check**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "reminderScheduler\|notificationHost"`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/features/training/sessionBuilder.ts apps/mobile/src/features/training/sessionBuilder.test.ts
git commit -m "sessionBuilder : SetDraft.distance/duration, mapping hyrox sur les deux chemins de soumission"
```

---

### Task 7: `sessionToDrafts.ts` — restitution à l'édition

**Files:**
- Modify: `apps/mobile/src/features/training/sessionToDrafts.ts`
- Modify: `apps/mobile/src/features/training/sessionToDrafts.test.ts`

**Interfaces:**
- Consumes: `SetDraft` (Task 6), `UserSessionExercise.distanceM` (Task 2).

- [ ] **Step 1: Update `draftFor`'s exercise mapping**

Change:

```ts
    selected[slotId] = { exerciseId: e.exerciseId, reps: str(e.reps), weight: str(e.weightKg), rest: str(e.restSec) };
```

to:

```ts
    selected[slotId] = {
      exerciseId: e.exerciseId,
      reps: str(e.reps),
      weight: str(e.weightKg),
      rest: str(e.restSec),
      distance: str(e.distanceM),
      duration: str(e.durationSec),
      hyroxMode: e.durationSec != null ? 'time' : 'distance',
    };
```

- [ ] **Step 2: Add a round-trip test to `sessionToDrafts.test.ts`**

Add to the `describe('sessionToBlockDrafts', ...)` block, after its last existing `it(...)`:

```ts
  it('restitue le mode et la valeur d une station hyrox', () => {
    const drafts = sessionToBlockDrafts(
      [block({ id: 'b1', order: 0, format: 'hyrox' })],
      [
        ex({ id: 'e1', order: 0, exerciseId: 'rowing', blockId: 'b1', distanceM: 1000 }),
        ex({ id: 'e2', order: 1, exerciseId: 'skierg', blockId: 'b1', durationSec: 240 }),
      ],
    );
    const slots = drafts[0]!.order.map((slotId) => drafts[0]!.selected[slotId]!);
    expect(slots[0]).toMatchObject({ exerciseId: 'rowing', distance: '1000', duration: '', hyroxMode: 'distance' });
    expect(slots[1]).toMatchObject({ exerciseId: 'skierg', distance: '', duration: '240', hyroxMode: 'time' });
  });
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd apps/mobile && npx vitest run src/features/training/sessionToDrafts.test.ts`
Expected: PASS, including the new test.

- [ ] **Step 4: Type-check**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "reminderScheduler\|notificationHost"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/training/sessionToDrafts.ts apps/mobile/src/features/training/sessionToDrafts.test.ts
git commit -m "Restituer le mode et la valeur d'une station hyrox à l'édition"
```

---

### Task 8: `SessionBlocksEditor.tsx` — format option and per-station fields

**Files:**
- Modify: `apps/mobile/src/features/training/SessionBlocksEditor.tsx`
- Modify: `apps/mobile/src/i18n/locales/fr.json`, `en.json`, `es.json`, `de.json`, `pt.json`

**Interfaces:**
- Consumes: `formatLabel`, `SetDraft.distance/duration/hyroxMode` (Task 6).
- Produces: the "Hyrox" format is selectable in the block editor; a station's row shows a Distance/Temps toggle plus the matching input, no rest/cap/rounds fields.

- [ ] **Step 1: Add "Hyrox" to `FORMAT_OPTIONS`**

Change:

```ts
  const FORMAT_OPTIONS: { value: BlockFormat; label: string }[] = [
    { value: 'strength', label: formatLabel('strength', t) },
    { value: 'amrap', label: formatLabel('amrap', t) },
    { value: 'emom', label: formatLabel('emom', t) },
    { value: 'for_time', label: formatLabel('for_time', t) },
    { value: 'tabata', label: formatLabel('tabata', t) },
  ];
```

to:

```ts
  const FORMAT_OPTIONS: { value: BlockFormat; label: string }[] = [
    { value: 'strength', label: formatLabel('strength', t) },
    { value: 'amrap', label: formatLabel('amrap', t) },
    { value: 'emom', label: formatLabel('emom', t) },
    { value: 'for_time', label: formatLabel('for_time', t) },
    { value: 'tabata', label: formatLabel('tabata', t) },
    { value: 'hyrox', label: formatLabel('hyrox', t) },
  ];
```

- [ ] **Step 2: Block-level help text resolves for `hyrox`**

The existing line `{t(\`sport.sessionBuilder.block.help.${b.format === 'for_time' ? 'forTime' : b.format}\`)}` already resolves to `sport.sessionBuilder.block.help.hyrox` for this format with no code change — just needs the i18n key added (Step 6). No block-level time-cap/rest/rounds input block is added for `hyrox` (intentional — matches every other format's "no block have no branch" pattern for fields it doesn't use).

- [ ] **Step 3: Per-station fields — replace the always-shown Reps/Weight row for Hyrox**

Find:

```ts
    const isStrength = activeFormat === 'strength';
```

Change to:

```ts
    const isStrength = activeFormat === 'strength';
    const isHyrox = activeFormat === 'hyrox';
```

Find:

```ts
          <View style={{ flexDirection: 'row', gap: spacing[3], marginTop: spacing[2] }}>
            <Stepper label={t('sport.sessionBuilder.set.repsLabel')} value={draft.reps} step={1} onChange={(v) => builder.updateExercise(slotId, { reps: v })} />
            <Stepper label={t('sport.sessionBuilder.set.weightLabel')} value={draft.weight} step={2.5} unit="kg" onChange={(v) => builder.updateExercise(slotId, { weight: v })} />
          </View>
          {isStrength ? (
            <View style={{ marginTop: spacing[2] }}>
              <Stepper label={t('sport.sessionBuilder.set.restLabel')} value={draft.rest} step={15} unit="s" onChange={(v) => builder.updateExercise(slotId, { rest: v })} />
            </View>
          ) : null}
```

Change to:

```ts
          {isHyrox ? (
            <>
              <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[2] }}>
                <FilterChip
                  label={t('sport.sessionBuilder.hyrox.distanceMode')}
                  active={(draft.hyroxMode ?? 'distance') === 'distance'}
                  onPress={() => builder.updateExercise(slotId, { hyroxMode: 'distance' })}
                />
                <FilterChip
                  label={t('sport.sessionBuilder.hyrox.timeMode')}
                  active={draft.hyroxMode === 'time'}
                  onPress={() => builder.updateExercise(slotId, { hyroxMode: 'time' })}
                />
              </View>
              <View style={{ flexDirection: 'row', gap: spacing[3], marginTop: spacing[2] }}>
                {(draft.hyroxMode ?? 'distance') === 'distance' ? (
                  <Stepper label={t('sport.sessionBuilder.hyrox.distanceLabel')} value={draft.distance} step={50} unit="m" onChange={(v) => builder.updateExercise(slotId, { distance: v })} />
                ) : (
                  <Stepper label={t('sport.sessionBuilder.hyrox.durationLabel')} value={draft.duration} step={15} unit="s" onChange={(v) => builder.updateExercise(slotId, { duration: v })} />
                )}
                <Stepper label={t('sport.sessionBuilder.set.weightLabel')} value={draft.weight} step={2.5} unit="kg" onChange={(v) => builder.updateExercise(slotId, { weight: v })} />
              </View>
            </>
          ) : (
            <>
              <View style={{ flexDirection: 'row', gap: spacing[3], marginTop: spacing[2] }}>
                <Stepper label={t('sport.sessionBuilder.set.repsLabel')} value={draft.reps} step={1} onChange={(v) => builder.updateExercise(slotId, { reps: v })} />
                <Stepper label={t('sport.sessionBuilder.set.weightLabel')} value={draft.weight} step={2.5} unit="kg" onChange={(v) => builder.updateExercise(slotId, { weight: v })} />
              </View>
              {isStrength ? (
                <View style={{ marginTop: spacing[2] }}>
                  <Stepper label={t('sport.sessionBuilder.set.restLabel')} value={draft.rest} step={15} unit="s" onChange={(v) => builder.updateExercise(slotId, { rest: v })} />
                </View>
              ) : null}
            </>
          )}
```

`FilterChip` needs no import: it's a local component already defined in this same file (`SessionBlocksEditor.tsx:144`, `{ label: string; active: boolean; onPress: () => void }`, static `style` object — not the `@supotsu/ui` component of the same name), already used for the muscle/equipment filters in the "Ajouter un exercice" sheet.

- [ ] **Step 4: Verify `Stepper` accepts a plain numeric string step for distance/duration**

Run: `grep -n "interface StepperProps\|export function Stepper" -A15 packages/ui/src/Stepper.tsx`

Confirm its `value`/`onChange` are plain strings (matching how `reps`/`weight` already use it) — no changes expected here, this is a verification step, not an edit.

- [ ] **Step 5: Add the new i18n keys to all 5 locales**

Add to `apps/mobile/src/i18n/locales/fr.json`, inside `sport.sessionBuilder` (alongside the existing `blockFormat`/`block`/`set` objects — follow the existing nesting):

In `sport.sessionBuilder.blockFormat`, no new key needed (formatLabel returns the literal `'Hyrox'`, matching how `'AMRAP'`/`'Tabata'` are also literals, not translated — same convention).

In `sport.sessionBuilder.block.help`, add:
```json
"hyrox": "Stations enchaînées sans repos. Chacune a un objectif de distance ou de temps — jamais les deux — et tu notes le résultat à la fin."
```

Add a new `sport.sessionBuilder.hyrox` object (sibling of `block`/`set`):
```json
"hyrox": {
 "distanceMode": "Distance",
 "timeMode": "Temps",
 "distanceLabel": "Distance",
 "durationLabel": "Durée"
}
```

Repeat with translated strings in `en.json`, `es.json`, `de.json`, `pt.json` — same key structure, e.g. for `en.json`:
```json
"hyrox": "Chained stations, no rest. Each has a distance or a time target — never both — and you log the result at the end."
```
```json
"hyrox": {
 "distanceMode": "Distance",
 "timeMode": "Time",
 "distanceLabel": "Distance",
 "durationLabel": "Duration"
}
```
For `es.json`:
```json
"hyrox": "Estaciones encadenadas sin descanso. Cada una tiene un objetivo de distancia o de tiempo — nunca los dos — y anotas el resultado al final."
```
```json
"hyrox": {
 "distanceMode": "Distancia",
 "timeMode": "Tiempo",
 "distanceLabel": "Distancia",
 "durationLabel": "Duración"
}
```
For `de.json`:
```json
"hyrox": "Stationen ohne Pause hintereinander. Jede hat ein Distanz- oder Zeitziel — nie beides — und du trägst das Ergebnis am Ende ein."
```
```json
"hyrox": {
 "distanceMode": "Distanz",
 "timeMode": "Zeit",
 "distanceLabel": "Distanz",
 "durationLabel": "Dauer"
}
```
For `pt.json`:
```json
"hyrox": "Estações encadeadas sem descanso. Cada uma tem uma meta de distância ou de tempo — nunca as duas — e você registra o resultado no final."
```
```json
"hyrox": {
 "distanceMode": "Distância",
 "timeMode": "Tempo",
 "distanceLabel": "Distância",
 "durationLabel": "Duração"
}
```

- [ ] **Step 6: Validate JSON and type-check**

Run: `for f in fr en es de pt; do node -e "JSON.parse(require('fs').readFileSync('apps/mobile/src/i18n/locales/$f.json','utf8')); console.log('$f OK')"; done`
Expected: all 5 print OK.

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "reminderScheduler\|notificationHost"`
Expected: PASS.

- [ ] **Step 7: Manual check in the running app**

Open the session builder, add a block, switch its format to Hyrox, add an exercise, confirm the Distance/Temps toggle appears with the matching single input, and that no rest/plafond/rounds field shows for this format.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/features/training/SessionBlocksEditor.tsx apps/mobile/src/i18n/locales/*.json
git commit -m "Éditeur de séance : format Hyrox, bascule Distance/Temps par station"
```

---

### Task 9: `HyroxRunner.tsx` (new component)

**Files:**
- Create: `apps/mobile/src/features/training/HyroxRunner.tsx`
- Modify: `apps/mobile/src/i18n/locales/fr.json`, `en.json`, `es.json`, `de.json`, `pt.json`

**Interfaces:**
- Consumes: `computeHyroxStationState` (Task 1), `TimedRunnerProps` (from `./AmrapRunner`), `useRunClock`, `RunnerFocus`, `useLogSet`, `SetLogInput.distanceM/durationSec` (Task 5).
- Produces: `export function HyroxRunner({ block, sets, onFinished }: TimedRunnerProps): React.JSX.Element`

- [ ] **Step 1: Write the component**

Create `apps/mobile/src/features/training/HyroxRunner.tsx`:

```tsx
import React, { useEffect, useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text, triggerHaptic, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { EXERCISE_LIBRARY } from '@supotsu/shared';
import { EXERCISES } from '@/features/exercises/catalog';
import { useCustomExercises, useLogSet } from '@/lib/data/queries';
import { computeHyroxStationState, formatClock } from './blockRunnerEngine';
import { useRunClock } from './useRunClock';
import { RunnerFocus } from './RunnerFocus';
import type { TimedRunnerProps } from './AmrapRunner';

/**
 * Hyrox en direct : stations enchaînées sans repos, chacune avec son propre
 * chrono (chronomètre pour une station distance, décompte pour une station
 * temps) et sa propre saisie du réalisé — cycle `work` → `log`, comme la
 * Musculation, pas un chrono unique sur tout le bloc comme Pour le temps.
 */
export function HyroxRunner({ block, sets, onFinished }: TimedRunnerProps): React.JSX.Element {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { data: customExercises = [] } = useCustomExercises();
  const logSet = useLogSet();

  const ordered = useMemo(() => [...sets].sort((a, b) => a.order - b.order), [sets]);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeSet = ordered[activeIndex];
  const [phase, setPhase] = useState<'work' | 'log'>('work');
  const [totalSec, setTotalSec] = useState(0);
  // Capturé au moment où une station distance est arrêtée manuellement — la
  // phase log affiche ce temps figé, pas le chrono qui continue de tourner.
  const [stationResultSec, setStationResultSec] = useState(0);
  const [distanceDraft, setDistanceDraft] = useState('');
  const [weightDraft, setWeightDraft] = useState('');

  const clock = useRunClock(activeSet?.id);
  const isTimeMode = activeSet?.durationSec != null;
  const state = activeSet ? computeHyroxStationState(clock.elapsedSec, activeSet) : undefined;

  useEffect(() => {
    setPhase('work');
    setDistanceDraft('');
    setWeightDraft(activeSet?.weightKg != null ? String(activeSet.weightKg) : '');
  }, [activeSet?.id]);

  useEffect(() => {
    if (state?.isFinished && phase === 'work') {
      triggerHaptic();
      setStationResultSec(activeSet?.durationSec ?? 0);
      setPhase('log');
    }
  }, [state?.isFinished, phase]);

  useEffect(() => {
    if (!activeSet && ordered.length > 0) onFinished(ordered.length, totalSec);
  }, [activeSet]);

  const exerciseName = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of EXERCISE_LIBRARY) map.set(e.id, e.name);
    for (const e of EXERCISES) map.set(e.id, e.name);
    for (const e of customExercises) map.set(e.id, e.name);
    return (exerciseId: string): string => map.get(exerciseId) ?? exerciseId;
  }, [customExercises]);

  if (!activeSet) {
    return <RunnerFocus title={t('sport.runner.allDone')} value="✓" actionLabel={t('sport.runner.validate')} onAction={() => onFinished(ordered.length, totalSec)} />;
  }

  const finishWork = (): void => {
    triggerHaptic();
    setStationResultSec(clock.elapsedSec);
    setPhase('log');
  };

  const finishStation = (): void => {
    const resultSec = isTimeMode ? (activeSet.durationSec ?? 0) : stationResultSec;
    logSet.mutate({
      setId: activeSet.id,
      workoutId: block.workoutId,
      done: {
        distanceM: isTimeMode ? (distanceDraft ? Number(distanceDraft) : undefined) : undefined,
        durationSec: isTimeMode ? undefined : resultSec,
        weightKg: weightDraft ? Number(weightDraft) : undefined,
        completedAt: new Date().toISOString(),
      },
    });
    setTotalSec((t) => t + resultSec);
    setActiveIndex((i) => i + 1);
  };

  if (phase === 'work') {
    return (
      <RunnerFocus
        tag={t('sport.sessionBuilder.blockFormat.hyrox')}
        title={exerciseName(activeSet.exerciseId)}
        total={ordered.length}
        current={activeIndex + 1}
        context={isTimeMode ? t('sport.runner.remaining') : t('sport.runner.elapsed')}
        value={formatClock(state!.displaySec)}
        valueHint={!isTimeMode && activeSet.distanceM != null ? t('sport.runner.hyroxTargetDistance', { distance: activeSet.distanceM }) : undefined}
        actionLabel={isTimeMode ? t('sport.runner.hyroxInProgress') : t('sport.runner.hyroxDistanceReached')}
        onAction={isTimeMode ? () => undefined : finishWork}
        actionDisabled={isTimeMode}
      />
    );
  }

  return (
    <RunnerFocus
      tag={t('sport.sessionBuilder.blockFormat.hyrox')}
      title={exerciseName(activeSet.exerciseId)}
      total={ordered.length}
      current={activeIndex + 1}
      context={t('sport.runner.hyroxLogContext')}
      value={formatClock(resultSecForDisplay(isTimeMode, activeSet.durationSec, stationResultSec))}
      actionLabel={t('sport.runner.saveAndContinue')}
      onAction={finishStation}
    >
      {isTimeMode ? (
        <View style={{ marginBottom: spacing[3] }}>
          <Text variant="label" color="textMuted" style={{ marginBottom: spacing[2] }}>{t('sport.runner.hyroxDistanceA11y')}</Text>
          <TextInput
            value={distanceDraft}
            onChangeText={setDistanceDraft}
            keyboardType="numeric"
            accessibilityLabel={t('sport.runner.hyroxDistanceA11y')}
            style={{ color: colors.text, fontSize: 22, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, paddingVertical: spacing[3], textAlign: 'center' }}
          />
        </View>
      ) : null}
      <View>
        <Text variant="label" color="textMuted" style={{ marginBottom: spacing[2] }}>{t('sport.runner.weightA11y')}</Text>
        <TextInput
          value={weightDraft}
          onChangeText={setWeightDraft}
          keyboardType="numeric"
          accessibilityLabel={t('sport.runner.weightA11y')}
          style={{ color: colors.text, fontSize: 22, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, paddingVertical: spacing[3], textAlign: 'center' }}
        />
      </View>
    </RunnerFocus>
  );
}

function resultSecForDisplay(isTimeMode: boolean, durationSec: number | undefined, stationResultSec: number): number {
  return isTimeMode ? (durationSec ?? 0) : stationResultSec;
}
```

- [ ] **Step 2: Add the new i18n keys to all 5 locales**

Add to `sport.runner` in `apps/mobile/src/i18n/locales/fr.json`:
```json
"hyroxTargetDistance": "Objectif : {{distance}} m",
"hyroxInProgress": "Décompte en cours…",
"hyroxDistanceReached": "Distance atteinte",
"hyroxLogContext": "Station terminée",
"hyroxDistanceA11y": "Distance parcourue (m)"
```

`en.json`:
```json
"hyroxTargetDistance": "Target: {{distance}} m",
"hyroxInProgress": "Counting down…",
"hyroxDistanceReached": "Distance reached",
"hyroxLogContext": "Station done",
"hyroxDistanceA11y": "Distance covered (m)"
```

`es.json`:
```json
"hyroxTargetDistance": "Objetivo: {{distance}} m",
"hyroxInProgress": "Cuenta atrás…",
"hyroxDistanceReached": "Distancia alcanzada",
"hyroxLogContext": "Estación terminada",
"hyroxDistanceA11y": "Distancia recorrida (m)"
```

`de.json`:
```json
"hyroxTargetDistance": "Ziel: {{distance}} m",
"hyroxInProgress": "Countdown läuft…",
"hyroxDistanceReached": "Distanz erreicht",
"hyroxLogContext": "Station beendet",
"hyroxDistanceA11y": "Zurückgelegte Distanz (m)"
```

`pt.json`:
```json
"hyroxTargetDistance": "Meta: {{distance}} m",
"hyroxInProgress": "Contagem regressiva…",
"hyroxDistanceReached": "Distância alcançada",
"hyroxLogContext": "Estação concluída",
"hyroxDistanceA11y": "Distância percorrida (m)"
```

(`sport.runner.remaining`, `sport.runner.elapsed`, `sport.runner.saveAndContinue`, `sport.runner.weightA11y`, `sport.runner.allDone`, `sport.runner.validate` already exist — reused as-is.)

- [ ] **Step 3: Validate JSON and type-check**

Run: `for f in fr en es de pt; do node -e "JSON.parse(require('fs').readFileSync('apps/mobile/src/i18n/locales/$f.json','utf8')); console.log('$f OK')"; done`
Expected: all 5 print OK.

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "reminderScheduler\|notificationHost"`
Expected: PASS.

- [ ] **Step 4: Lint**

Run: `cd /path/to/repo/root && npx eslint apps/mobile/src/features/training/HyroxRunner.tsx`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/training/HyroxRunner.tsx apps/mobile/src/i18n/locales/*.json
git commit -m "Ajouter HyroxRunner (cycle work/log par station)"
```

---

### Task 10: Wire `HyroxRunner` into `CircuitRunnerScreen`

**Files:**
- Modify: `apps/mobile/src/features/training/CircuitRunnerScreen.tsx`

**Interfaces:**
- Consumes: `HyroxRunner` (Task 9).

- [ ] **Step 1: Import it**

Add, alongside the other runner imports (after `import { ForTimeRunner } from './ForTimeRunner';`):

```ts
import { HyroxRunner } from './HyroxRunner';
```

- [ ] **Step 2: Route the format to it**

Change:

```tsx
      ) : active.format === 'amrap' ? (
        <AmrapRunner block={active} sets={sets} onFinished={(r) => void finishTimedBlock(r)} />
      ) : active.format === 'emom' ? (
        <EmomRunner block={active} sets={sets} onFinished={(r) => void finishTimedBlock(r)} />
      ) : active.format === 'tabata' ? (
        <TabataRunner block={active} sets={sets} onFinished={(r) => void finishTimedBlock(r)} />
      ) : (
        <ForTimeRunner block={active} sets={sets} onFinished={(r, e) => void finishTimedBlock(r, e)} />
      )}
```

to:

```tsx
      ) : active.format === 'amrap' ? (
        <AmrapRunner block={active} sets={sets} onFinished={(r) => void finishTimedBlock(r)} />
      ) : active.format === 'emom' ? (
        <EmomRunner block={active} sets={sets} onFinished={(r) => void finishTimedBlock(r)} />
      ) : active.format === 'tabata' ? (
        <TabataRunner block={active} sets={sets} onFinished={(r) => void finishTimedBlock(r)} />
      ) : active.format === 'hyrox' ? (
        <HyroxRunner block={active} sets={sets} onFinished={(r, e) => void finishTimedBlock(r, e)} />
      ) : (
        <ForTimeRunner block={active} sets={sets} onFinished={(r, e) => void finishTimedBlock(r, e)} />
      )}
```

- [ ] **Step 3: `finishTimedBlock` records the summed time as `resultTimeSec`**

Change:

```ts
      resultTimeSec:
        active.format === 'for_time'
          ? elapsed
          : active.format === 'amrap'
```

to:

```ts
      resultTimeSec:
        active.format === 'for_time' || active.format === 'hyrox'
          ? elapsed
          : active.format === 'amrap'
```

(`elapsed` here is `HyroxRunner`'s `onFinished`'s second argument — the running `totalSec` it accumulated across stations, exactly the semantics `for_time` already gives this parameter.)

- [ ] **Step 4: Type-check**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "reminderScheduler\|notificationHost"`
Expected: PASS.

- [ ] **Step 5: Manual run-through**

Build a session with a Hyrox block (one distance station, one time station), start it from the Sport tab, run through both stations, confirm the block completes and the workout's finish sheet appears afterward exactly as it does for other formats.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/features/training/CircuitRunnerScreen.tsx
git commit -m "Router le format hyrox vers HyroxRunner dans CircuitRunnerScreen"
```

---

### Task 11: `WorkoutDetailScreen.tsx` — labels, result line, distance display

**Files:**
- Modify: `apps/mobile/src/features/training/WorkoutDetailScreen.tsx`
- Modify: `apps/mobile/src/i18n/locales/fr.json`, `en.json`, `es.json`, `de.json`, `pt.json`

**Interfaces:**
- Consumes: `WorkoutBlock.format === 'hyrox'`, `SetEntry.distanceM` (Task 2).

- [ ] **Step 1: Format label**

Change:

```ts
  if (format === 'strength') return t('sport.workoutDetail.blockFormat.strength');
  if (format === 'for_time') return t('sport.workoutDetail.blockFormat.forTime');
  if (format === 'amrap') return 'AMRAP';
  if (format === 'tabata') return 'Tabata';
  return 'EMOM';
}
```

to:

```ts
  if (format === 'strength') return t('sport.workoutDetail.blockFormat.strength');
  if (format === 'for_time') return t('sport.workoutDetail.blockFormat.forTime');
  if (format === 'amrap') return 'AMRAP';
  if (format === 'tabata') return 'Tabata';
  if (format === 'hyrox') return 'Hyrox';
  return 'EMOM';
}
```

- [ ] **Step 2: Result line**

Change:

```ts
  if (b.format === 'for_time') return `${t('sport.workoutDetail.blockFormat.forTime')}${b.resultTimeSec != null ? ` — ${Math.floor(b.resultTimeSec / 60)} min ${b.resultTimeSec % 60}` : ''}`;
  const rounds = b.completedRounds ?? b.targetRounds;
  return rounds ? t('sport.workoutDetail.blockFormat.strengthRepeated', { rounds }) : t('sport.workoutDetail.blockFormat.strength');
}
```

to:

```ts
  if (b.format === 'for_time') return `${t('sport.workoutDetail.blockFormat.forTime')}${b.resultTimeSec != null ? ` — ${Math.floor(b.resultTimeSec / 60)} min ${b.resultTimeSec % 60}` : ''}`;
  if (b.format === 'hyrox') return `Hyrox${b.resultTimeSec != null ? ` — ${Math.floor(b.resultTimeSec / 60)} min ${b.resultTimeSec % 60}` : ''}`;
  const rounds = b.completedRounds ?? b.targetRounds;
  return rounds ? t('sport.workoutDetail.blockFormat.strengthRepeated', { rounds }) : t('sport.workoutDetail.blockFormat.strength');
}
```

- [ ] **Step 3: Per-exercise distance display in `BlockSummaryCard`**

Change:

```tsx
            <Text variant="caption" color="textSubtle">
              {exerciseName(s.exerciseId)}{s.reps != null ? ` · ${s.reps} reps` : ''}{s.weightKg != null ? ` · ${s.weightKg} kg` : ''}
            </Text>
```

to:

```tsx
            <Text variant="caption" color="textSubtle">
              {exerciseName(s.exerciseId)}{s.reps != null ? ` · ${s.reps} reps` : ''}{s.distanceM != null ? ` · ${s.distanceM} m` : ''}{s.weightKg != null ? ` · ${s.weightKg} kg` : ''}
            </Text>
```

- [ ] **Step 4: Type-check**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "reminderScheduler\|notificationHost"`
Expected: PASS.

- [ ] **Step 5: Full test suite**

Run: `cd apps/mobile && npx vitest run`
Expected: all tests pass, including the 3 new `computeHyroxStationState` tests from Task 1.

Run: `cd packages/database && npx vitest run`
Expected: all tests pass.

- [ ] **Step 6: Lint everything touched by this plan**

Run: `cd /path/to/repo/root && npx eslint "apps/mobile/src/features/training/*.tsx" "apps/mobile/src/lib/data/repository.ts" "apps/mobile/src/lib/data/queries.ts"`
Expected: no new errors (pre-existing unrelated warnings in other files are fine).

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/features/training/WorkoutDetailScreen.tsx apps/mobile/src/i18n/locales/*.json
git commit -m "Afficher le format Hyrox et la distance des stations sur la fiche séance"
```

---

## Known pre-existing gap, deliberately out of scope

`addPlannedWorkout` (schedule a structured session for a future date, both repos) never gained the per-set/per-block fields Tabata needed either — its Supabase implementation maps no `duration_sec`, `rest_sec` at the block level, or `superset_group`. This predates Hyrox and isn't part of what was asked; piling `distance_m` onto an already-incomplete path isn't this plan's job. A planned (not yet started) Hyrox session with stations built this way would lose its distance/time targets — noted here so it doesn't come as a surprise, not fixed by this plan.

## Post-implementation checklist

- [ ] Re-read `docs/superpowers/specs/2026-09-18-hyrox-block-format-design.md` once more and confirm every numbered decision and every row of the "Portée" table maps to a task above.
- [ ] Confirm the "Global Constraints" bullets were honored in every task that touched a duplicated write path.
- [ ] Push the branch once all 11 tasks are committed (per the user's own standing instruction: always push right after committing).
