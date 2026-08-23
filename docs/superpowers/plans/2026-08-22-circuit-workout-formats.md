# Circuit Workout Formats (AMRAP/EMOM/Pour le temps) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user build a session out of one or more ordered blocks (Musculation / AMRAP / EMOM / Pour le temps), each with its own exercises and timing, and be guided live through them block-by-block with a timer.

**Architecture:** New `workout_blocks` table (ordered, one row per block, carries format + timing + result) between `workouts` and `workout_sets` (`workout_sets` gains an optional `block_id`). Plain strength-only workouts (today's entire existing flow — manual logging, Garmin import) keep zero blocks and are untouched. A new pure module (`blockRunnerEngine.ts`) computes each timed format's countdown/round state from elapsed seconds; a new screen (`CircuitRunnerScreen`) drives it block-to-block, reusing `IntervalTimerScreen`'s tick pattern.

**Tech Stack:** React Native (Expo/expo-router), TypeScript, Supabase (Postgres + PostgREST via `@supabase/supabase-js`), TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-22-circuit-workout-formats-design.md`

## Global Constraints

- Plain strength-only workouts (no blocks) must keep working exactly as today — every change here is additive, never a breaking change to the existing `workouts`/`workout_sets` flow.
- `format` values are exactly `'strength' | 'amrap' | 'emom' | 'for_time'` everywhere (DB check constraint, TS union, UI copy) — never introduce a fifth spelling like `'complex'` or `'crossfit'`.
- All new user-facing copy is French, matching the app's existing tone (see `NewWorkoutScreen.tsx`, `IntervalTimerScreen.tsx` for register).
- No new npm dependencies — everything reuses `IntervalTimerScreen`'s existing `setInterval`/`setTimeout` timer approach and the design system already in `packages/ui`/`packages/design-system`.
- Follow the codebase's existing test convention exactly: pure logic (`packages/*`, standalone algorithms) gets Vitest TDD; Supabase repository wrappers and React Native screens do not have a unit-test harness in this repo — verify those with `tsc --noEmit`, `eslint`, and a manual run instead of writing tests for them.

---

## Task 1: Migration — `workout_blocks` table

**Files:**
- Create: `supabase/migrations/0023_circuit_workout_formats.sql`

**Interfaces:**
- Produces: table `public.workout_blocks` (columns: `id uuid`, `workout_id uuid`, `"order" smallint`, `format text`, `time_cap_sec integer`, `target_rounds smallint`, `completed_rounds smallint`, `result_time_sec integer`); `public.workout_sets.block_id uuid` (nullable, FK to `workout_blocks.id`).

- [x] **Step 1: Write the migration**

```sql
-- Circuit workout formats (AMRAP/EMOM/Pour le temps): a session becomes a
-- sequence of blocks instead of one flat format. Plain strength-only
-- workouts keep zero blocks — workout_sets.block_id stays null for them,
-- exactly as today. See docs/superpowers/specs/2026-08-22-circuit-workout-formats-design.md.

create table public.workout_blocks (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts (id) on delete cascade,
  "order" smallint not null default 0,
  format text not null check (format in ('strength', 'amrap', 'emom', 'for_time')),
  time_cap_sec integer,
  target_rounds smallint,
  completed_rounds smallint,
  result_time_sec integer
);

create index workout_blocks_workout_idx on public.workout_blocks (workout_id);

alter table public.workout_sets
  add column block_id uuid references public.workout_blocks (id) on delete cascade;

create index workout_sets_block_idx on public.workout_sets (block_id) where block_id is not null;

alter table public.workout_blocks enable row level security;

create policy "workout_blocks follow workout ownership"
  on public.workout_blocks for all
  using (
    exists (select 1 from public.workouts w where w.id = workout_blocks.workout_id and w.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.workouts w where w.id = workout_blocks.workout_id and w.user_id = auth.uid())
  );
```

- [x] **Step 2: Verify the SQL is syntactically valid**

There is no local Postgres in this environment. Sanity-check by eye against
`supabase/migrations/0001_init.sql`'s `workout_sets`/`workouts` block (same
column/constraint style) and `supabase/migrations/0022_fix_workouts_dedup_conflict_target.sql`
(most recent migration, same file header style). The user applies this
migration themselves (`supabase db push` or the dashboard SQL editor) — flag
that explicitly when this task is done.

- [x] **Step 3: Commit**

```bash
git add supabase/migrations/0023_circuit_workout_formats.sql
git commit -m "Add workout_blocks table for multi-format circuit sessions"
```

---

## Task 2: Generated Supabase types

**Files:**
- Modify: `packages/database/src/generated/database.types.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `Database['public']['Tables']['workout_blocks']` (Row/Insert/Update), `Database['public']['Tables']['workout_sets']['Row'|'Insert']` gains `block_id`.

- [x] **Step 1: Add `block_id` to the existing `workout_sets` entry**

In the `workout_sets` block (currently `id`, `workout_id`, `exercise_id`,
`order`, `reps`, `weight_kg`, `duration_sec`, `rest_sec`, `rpe`), add
`block_id: string | null;` to `Row` and `block_id?: string | null;` to
`Insert`:

```ts
      workout_sets: {
        Row: {
          id: string;
          workout_id: string;
          exercise_id: string;
          order: number;
          reps: number | null;
          weight_kg: number | null;
          duration_sec: number | null;
          rest_sec: number | null;
          rpe: number | null;
          block_id: string | null;
        };
        Insert: {
          workout_id: string;
          exercise_id: string;
          order?: number;
          reps?: number | null;
          weight_kg?: number | null;
          duration_sec?: number | null;
          rest_sec?: number | null;
          rpe?: number | null;
          block_id?: string | null;
        };
        Update: Partial<Database['public']['Tables']['workout_sets']['Insert']>;
        Relationships: [];
      };
```

- [x] **Step 2: Add the `workout_blocks` table entry**

Insert this new block directly after `workout_sets` (same file, same
nesting level as `workouts`/`workout_sets`):

```ts
      workout_blocks: {
        Row: {
          id: string;
          workout_id: string;
          order: number;
          format: 'strength' | 'amrap' | 'emom' | 'for_time';
          time_cap_sec: number | null;
          target_rounds: number | null;
          completed_rounds: number | null;
          result_time_sec: number | null;
        };
        Insert: {
          workout_id: string;
          order?: number;
          format: 'strength' | 'amrap' | 'emom' | 'for_time';
          time_cap_sec?: number | null;
          target_rounds?: number | null;
          completed_rounds?: number | null;
          result_time_sec?: number | null;
        };
        Update: Partial<Database['public']['Tables']['workout_blocks']['Insert']>;
        Relationships: [];
      };
```

- [x] **Step 3: Typecheck**

Run: `cd packages/database && npx tsc --noEmit`
Expected: no errors.

- [x] **Step 4: Commit**

```bash
git add packages/database/src/generated/database.types.ts
git commit -m "Add workout_blocks to generated Supabase types"
```

---

## Task 3: Domain types

**Files:**
- Modify: `packages/core/src/training.ts`

**Interfaces:**
- Produces: `BlockFormat`, `WorkoutBlock` (exported from `@supotsu/core`); `SetEntry` gains optional `blockId`.

- [x] **Step 1: Add `BlockFormat` and `WorkoutBlock`, extend `SetEntry`**

In `packages/core/src/training.ts`, right after the existing `WorkoutStatus`/`Workout` block (after line 49, before `SetEntry`):

```ts
export type BlockFormat = 'strength' | 'amrap' | 'emom' | 'for_time';

/**
 * One ordered segment of a session (Master Prompt — circuit workout
 * formats). A plain strength-only workout has zero blocks; its sets hang
 * directly off `workoutId` with no `blockId`, exactly as before this
 * existed. A session with one or more blocks (AMRAP/EMOM/Pour le temps, or
 * even a single strength block) runs them in order.
 */
export interface WorkoutBlock {
  id: UUID;
  workoutId: UUID;
  order: number;
  format: BlockFormat;
  /** AMRAP cap, or EMOM interval length, in seconds. */
  timeCapSec?: number;
  /** EMOM interval count, or "pour le temps" round count. */
  targetRounds?: number;
  /** Rounds actually completed — set once the block finishes. */
  completedRounds?: number;
  /** "Pour le temps" finish time, in seconds — set once the block finishes. */
  resultTimeSec?: number;
}
```

Then add `blockId?: UUID;` to `SetEntry`:

```ts
/** A single performed set (Master Prompt P32.9, P51.7). */
export interface SetEntry {
  id: UUID;
  workoutId: UUID;
  /** The block this set belongs to, for a circuit-format session — absent for a plain strength set. */
  blockId?: UUID;
  exerciseId: UUID;
  order: number;
  reps?: number;
  weightKg?: number;
  durationSec?: number;
  restSec?: number;
  /** Set-level RPE. */
  rpe?: number;
}
```

- [x] **Step 2: Export from the package index**

Check `packages/core/src/index.ts` re-exports `training.ts` with `export *`
(it already does for `Workout`/`SetEntry` to work today) — no change needed
there, just confirm:

Run: `grep -n "training" packages/core/src/index.ts`
Expected: a line like `export * from './training';`

- [x] **Step 3: Typecheck**

Run: `cd packages/core && npx tsc --noEmit`
Expected: no errors.

- [x] **Step 4: Commit**

```bash
git add packages/core/src/training.ts
git commit -m "Add BlockFormat/WorkoutBlock domain types"
```

---

## Task 4: Pure block-runner engine (TDD)

**Files:**
- Create: `apps/mobile/src/features/training/blockRunnerEngine.ts`
- Test: `apps/mobile/src/features/training/blockRunnerEngine.test.ts`

**Interfaces:**
- Consumes: `BlockFormat` from `@supotsu/core` (Task 3).
- Produces: `BlockRunnerState { displaySec: number; currentRound: number; isFinished: boolean }`, `computeAmrapState(elapsedSec, timeCapSec, roundsCompleted)`, `computeEmomState(elapsedSec, intervalSec, targetRounds)`, `computeForTimeState(elapsedSec, roundsCompleted, targetRounds)`, `formatClock(totalSec): string` — all pure functions, no React/timer state. `CircuitRunnerScreen` (Task 9) is the only consumer.

- [x] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { computeAmrapState, computeEmomState, computeForTimeState, formatClock } from './blockRunnerEngine';

describe('computeAmrapState', () => {
  it('counts down from the time cap', () => {
    expect(computeAmrapState(45, 720, 0)).toEqual({ displaySec: 675, currentRound: 1, isFinished: false });
  });

  it('reflects rounds already completed in the round number', () => {
    expect(computeAmrapState(200, 720, 3)).toEqual({ displaySec: 520, currentRound: 4, isFinished: false });
  });

  it('finishes at (and clamps past) the time cap', () => {
    expect(computeAmrapState(720, 720, 5)).toEqual({ displaySec: 0, currentRound: 6, isFinished: true });
    expect(computeAmrapState(999, 720, 5)).toEqual({ displaySec: 0, currentRound: 6, isFinished: true });
  });
});

describe('computeEmomState', () => {
  it('starts on round 1 with the full interval remaining', () => {
    expect(computeEmomState(0, 60, 10)).toEqual({ displaySec: 60, currentRound: 1, isFinished: false });
  });

  it('advances the round automatically as elapsed time crosses an interval boundary', () => {
    expect(computeEmomState(65, 60, 10)).toEqual({ displaySec: 55, currentRound: 2, isFinished: false });
  });

  it('finishes once elapsed time reaches targetRounds * interval', () => {
    expect(computeEmomState(600, 60, 10)).toEqual({ displaySec: 0, currentRound: 10, isFinished: true });
  });

  it('clamps the round number at targetRounds past the end', () => {
    expect(computeEmomState(700, 60, 10)).toEqual({ displaySec: 0, currentRound: 10, isFinished: true });
  });
});

describe('computeForTimeState', () => {
  it('counts elapsed time up, round number one ahead of completed', () => {
    expect(computeForTimeState(142, 3, 8)).toEqual({ displaySec: 142, currentRound: 4, isFinished: false });
  });

  it('finishes once every round is completed', () => {
    expect(computeForTimeState(522, 8, 8)).toEqual({ displaySec: 522, currentRound: 8, isFinished: true });
  });
});

describe('formatClock', () => {
  it('formats minutes:seconds with a zero-padded seconds field', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(38)).toBe('0:38');
    expect(formatClock(452)).toBe('7:32');
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/mobile/src/features/training/blockRunnerEngine.test.ts`
Expected: FAIL — `blockRunnerEngine.ts` does not exist yet.

- [x] **Step 3: Write the implementation**

```ts
export interface BlockRunnerState {
  /** Seconds to display — counts down for amrap/emom, up for for_time. */
  displaySec: number;
  /** 1-based current round/interval number. */
  currentRound: number;
  /** True once the block's timing condition is satisfied. */
  isFinished: boolean;
}

/**
 * AMRAP: counts down from the time cap. `roundsCompleted` is caller-owned
 * state (incremented by the "Round terminé" button) — this only reports the
 * countdown, the current round number, and whether the cap has been hit.
 */
export function computeAmrapState(elapsedSec: number, timeCapSec: number, roundsCompleted: number): BlockRunnerState {
  const remaining = Math.max(0, timeCapSec - elapsedSec);
  return { displaySec: remaining, currentRound: roundsCompleted + 1, isFinished: remaining <= 0 };
}

/**
 * EMOM: one round per fixed interval, advancing automatically as elapsed
 * time crosses each interval boundary — no caller-owned round state needed.
 */
export function computeEmomState(elapsedSec: number, intervalSec: number, targetRounds: number): BlockRunnerState {
  const totalSec = targetRounds * intervalSec;
  const isFinished = elapsedSec >= totalSec;
  const round = Math.min(targetRounds, Math.floor(elapsedSec / intervalSec) + 1);
  const intoInterval = elapsedSec - (round - 1) * intervalSec;
  const remaining = isFinished ? 0 : Math.max(0, intervalSec - intoInterval);
  return { displaySec: remaining, currentRound: round, isFinished };
}

/**
 * Pour le temps: stopwatch counts up. `roundsCompleted` is caller-owned
 * state (the "Round terminé" button) — finishes once every round is done.
 */
export function computeForTimeState(elapsedSec: number, roundsCompleted: number, targetRounds: number): BlockRunnerState {
  return {
    displaySec: elapsedSec,
    currentRound: Math.min(targetRounds, roundsCompleted + 1),
    isFinished: roundsCompleted >= targetRounds,
  };
}

/** "m:ss" — matches IntervalTimerScreen's plain-seconds display, just with a minutes component for longer AMRAP/for-time durations. */
export function formatClock(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/mobile/src/features/training/blockRunnerEngine.test.ts`
Expected: PASS — 9 tests.

- [x] **Step 5: Commit**

```bash
git add apps/mobile/src/features/training/blockRunnerEngine.ts apps/mobile/src/features/training/blockRunnerEngine.test.ts
git commit -m "Add pure AMRAP/EMOM/for-time block timing engine"
```

---

## Task 5: Database repository functions

**Files:**
- Modify: `packages/database/src/repositories/workouts.ts`

**Interfaces:**
- Consumes: `SupotsuClient`, `Database` (existing), Task 2's `workout_blocks` types.
- Produces: `WorkoutBlockRow`, `WorkoutBlockInsertRow`, `insertWorkoutWithBlocks(client, workout, blocks)`, `listBlocksForWorkout(client, workoutId)`, `listSetsForBlock(client, blockId)`, `updateBlockResult(client, blockId, result)` — Task 6 consumes all four.

- [x] **Step 1: Add the row types**

Right after the existing `export type WorkoutSetInsertRow = ...` line near
the top of `packages/database/src/repositories/workouts.ts`:

```ts
export type WorkoutBlockRow = Database['public']['Tables']['workout_blocks']['Row'];
export type WorkoutBlockInsertRow = Database['public']['Tables']['workout_blocks']['Insert'];
```

- [x] **Step 2: Add `insertWorkoutWithBlocks`**

Add after `insertWorkout` (which stays untouched — plain strength workouts
keep using it exactly as today):

```ts
/**
 * Create a session made of one or more ordered blocks (AMRAP/EMOM/Pour le
 * temps/strength) — each block's exercises are its own workout_sets rows,
 * tagged with block_id. Sequential inserts (workout, then each block, then
 * that block's sets) rather than one giant statement: a session is created
 * once by hand, not in a hot loop, and this keeps error attribution clear
 * (which block failed) over a marginal round-trip savings.
 */
export async function insertWorkoutWithBlocks(
  client: SupotsuClient,
  workout: WorkoutInsertRow,
  blocks: {
    format: WorkoutBlockRow['format'];
    timeCapSec?: number;
    targetRounds?: number;
    sets: Omit<WorkoutSetInsertRow, 'workout_id' | 'block_id'>[];
  }[],
): Promise<WorkoutRow> {
  const { data: workoutRow, error } = await client.from('workouts').insert(workout).select('*').single();
  if (error) throw error;

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    const { data: blockRow, error: blockError } = await client
      .from('workout_blocks')
      .insert({
        workout_id: workoutRow.id,
        order: i,
        format: b.format,
        time_cap_sec: b.timeCapSec ?? null,
        target_rounds: b.targetRounds ?? null,
      })
      .select('*')
      .single();
    if (blockError) throw blockError;

    if (b.sets.length > 0) {
      const { error: setError } = await client
        .from('workout_sets')
        .insert(b.sets.map((s) => ({ ...s, workout_id: workoutRow.id, block_id: blockRow.id })));
      if (setError) throw setError;
    }
  }

  return workoutRow;
}

/** A session's blocks, in order. */
export async function listBlocksForWorkout(client: SupotsuClient, workoutId: string): Promise<WorkoutBlockRow[]> {
  const { data, error } = await client
    .from('workout_blocks')
    .select('*')
    .eq('workout_id', workoutId)
    .order('order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** One block's exercises, in order (RLS scopes workout_blocks/workout_sets to the caller's own workouts). */
export async function listSetsForBlock(client: SupotsuClient, blockId: string): Promise<WorkoutSetRow[]> {
  const { data, error } = await client
    .from('workout_sets')
    .select('*')
    .eq('block_id', blockId)
    .order('order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Record a finished timed block's result (rounds completed / elapsed time). */
export async function updateBlockResult(
  client: SupotsuClient,
  blockId: string,
  result: { completedRounds?: number; resultTimeSec?: number },
): Promise<WorkoutBlockRow> {
  const { data, error } = await client
    .from('workout_blocks')
    .update({
      completed_rounds: result.completedRounds ?? null,
      result_time_sec: result.resultTimeSec ?? null,
    })
    .eq('id', blockId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}
```

Note `listSetsForBlock` is defined above `listSetsForWorkout` currently
appears later in the file (around line 162 in the pre-existing file) — place
`listSetsForBlock` right next to it for readability; exact position doesn't
matter, only that it's a top-level export in this file.

- [x] **Step 3: Typecheck**

Run: `cd packages/database && npx tsc --noEmit`
Expected: no errors.

- [x] **Step 4: Commit**

```bash
git add packages/database/src/repositories/workouts.ts
git commit -m "Add workout_blocks repository functions"
```

---

## Task 6: App-level repository wiring (demo + Supabase)

**Files:**
- Modify: `apps/mobile/src/lib/data/repository.ts`

**Interfaces:**
- Consumes: Task 3's `BlockFormat`/`WorkoutBlock`/`SetEntry.blockId`; Task 5's `insertWorkoutWithBlocks`, `listBlocksForWorkout`, `listSetsForBlock`, `updateBlockResult`, `WorkoutBlockRow`.
- Produces: `NewCircuitBlockInput`, `NewCircuitWorkout` types; `DataRepository.addCircuitWorkout`, `.getWorkoutBlocks`, `.getBlockSets`, `.completeBlock` — Task 7's hooks consume all four.

- [x] **Step 1: Import the new repository functions**

In the `@supotsu/database` import block (where `updateWorkoutStatus as
updateWorkoutStatusDb` already is), add, aliased the same way as the rest of
that block:

```ts
  insertWorkoutWithBlocks as insertWorkoutWithBlocksDb,
  listBlocksForWorkout as listBlocksForWorkoutDb,
  listSetsForBlock as listSetsForBlockDb,
  updateBlockResult as updateBlockResultDb,
  type WorkoutBlockRow,
```

- [x] **Step 2: Add the input types**

Right after the existing `NewWorkout` interface:

```ts
export interface NewCircuitBlockInput {
  format: BlockFormat;
  timeCapSec?: number;
  targetRounds?: number;
  sets: Omit<SetEntry, 'id' | 'workoutId' | 'blockId'>[];
}

/** A session made of one or more ordered blocks (Musculation/AMRAP/EMOM/Pour le temps). */
export interface NewCircuitWorkout {
  name: string;
  blocks: NewCircuitBlockInput[];
}
```

(`BlockFormat` and `SetEntry` are already imported from `@supotsu/core` in
this file — confirm with `grep -n "BlockFormat\|SetEntry" apps/mobile/src/lib/data/repository.ts | head -3`
and add `BlockFormat` and `WorkoutBlock` to that import line if they aren't
already there.)

- [x] **Step 3: Extend the `DataRepository` interface**

Right after the existing `getWorkoutSets` line:

```ts
  /** Create a multi-block session (AMRAP/EMOM/Pour le temps/strength blocks in sequence). */
  addCircuitWorkout(userId: string, workout: NewCircuitWorkout): Promise<Workout>;
  /** A session's blocks, in order. */
  getWorkoutBlocks(userId: string, workoutId: string): Promise<WorkoutBlock[]>;
  /** The exercises logged for one specific block, in order. */
  getBlockSets(userId: string, blockId: string): Promise<SetEntry[]>;
  /** Record a finished block's result (rounds completed / elapsed time). */
  completeBlock(userId: string, blockId: string, result: { completedRounds?: number; resultTimeSec?: number }): Promise<WorkoutBlock>;
```

- [x] **Step 4: Add `blockId` to the demo-mode local row shape**

`LoggedSetRow` (the demo-mode local-storage row shape) gets an optional
`blockId`:

```ts
interface LoggedSetRow {
  workoutId: string;
  blockId?: string;
  exerciseId: string;
  order: number;
  reps: number | null;
  weightKg: number | null;
  restSec?: number | null;
}
```

Add the storage key helper next to `wkKey`/`setKey`:

```ts
const blockKey = (u: string): string => `supotsu.blocks.${u}`;
```

- [x] **Step 5: Implement the four methods on `createDemoRepository`**

Add after the existing `getWorkoutSets` method in `createDemoRepository()`:

```ts
    async addCircuitWorkout(userId, workout) {
      const now = new Date().toISOString();
      const created: Workout = {
        id: randomId(),
        userId,
        name: workout.name,
        status: 'planned',
        plannedFor: todayKey(),
        createdAt: now,
        updatedAt: now,
      };
      const workouts = await readJson<Workout>(wkKey(userId));
      await writeJson(wkKey(userId), [created, ...workouts]);

      const existingBlocks = await readJson<WorkoutBlock>(blockKey(userId));
      const existingSets = await readJson<LoggedSetRow & { date: string }>(setKey(userId));
      const newBlocks: WorkoutBlock[] = [];
      const newSets: (LoggedSetRow & { date: string })[] = [];
      workout.blocks.forEach((b, i) => {
        const block: WorkoutBlock = {
          id: randomId(),
          workoutId: created.id,
          order: i,
          format: b.format,
          timeCapSec: b.timeCapSec,
          targetRounds: b.targetRounds,
        };
        newBlocks.push(block);
        b.sets.forEach((s) => {
          newSets.push({
            workoutId: created.id,
            blockId: block.id,
            exerciseId: s.exerciseId,
            order: s.order,
            reps: s.reps ?? null,
            weightKg: s.weightKg ?? null,
            restSec: s.restSec ?? null,
            date: now,
          });
        });
      });
      await writeJson(blockKey(userId), [...newBlocks, ...existingBlocks]);
      await writeJson(setKey(userId), [...newSets, ...existingSets]);
      return created;
    },
    async getWorkoutBlocks(userId, workoutId) {
      const items = await readJson<WorkoutBlock>(blockKey(userId));
      return items.filter((b) => b.workoutId === workoutId).sort((a, b) => a.order - b.order);
    },
    async getBlockSets(userId, blockId) {
      const rows = await readJson<LoggedSetRow & { date: string }>(setKey(userId));
      return rows
        .filter((r) => r.blockId === blockId)
        .sort((a, b) => a.order - b.order)
        .map((r) => ({
          id: `${r.workoutId}-${r.blockId}-${r.order}`,
          workoutId: r.workoutId,
          blockId: r.blockId,
          exerciseId: r.exerciseId,
          order: r.order,
          reps: r.reps ?? undefined,
          weightKg: r.weightKg ?? undefined,
          restSec: r.restSec ?? undefined,
        }));
    },
    async completeBlock(userId, blockId, result) {
      const items = await readJson<WorkoutBlock>(blockKey(userId));
      let updated: WorkoutBlock | undefined;
      const next = items.map((b) => {
        if (b.id !== blockId) return b;
        updated = { ...b, ...result };
        return updated;
      });
      await writeJson(blockKey(userId), next);
      if (!updated) throw new Error('Bloc introuvable.');
      return updated;
    },
```

- [x] **Step 6: Add `rowToWorkoutBlock` and implement the four methods on `createSupabaseRepository`**

Add the mapping helper right after `rowToWorkout`:

```ts
function rowToWorkoutBlock(r: WorkoutBlockRow): WorkoutBlock {
  return {
    id: r.id,
    workoutId: r.workout_id,
    order: r.order,
    format: r.format,
    timeCapSec: r.time_cap_sec ?? undefined,
    targetRounds: r.target_rounds ?? undefined,
    completedRounds: r.completed_rounds ?? undefined,
    resultTimeSec: r.result_time_sec ?? undefined,
  };
}
```

Add after the existing `getWorkoutSets` method in `createSupabaseRepository()`:

```ts
    async addCircuitWorkout(userId, workout) {
      const row = await insertWorkoutWithBlocksDb(
        client,
        { user_id: userId, name: workout.name, status: 'planned' },
        workout.blocks.map((b) => ({
          format: b.format,
          timeCapSec: b.timeCapSec,
          targetRounds: b.targetRounds,
          sets: b.sets.map((s) => ({
            exercise_id: s.exerciseId,
            order: s.order,
            reps: s.reps ?? null,
            weight_kg: s.weightKg ?? null,
            duration_sec: s.durationSec ?? null,
            rest_sec: s.restSec ?? null,
          })),
        })),
      );
      return rowToWorkout(row);
    },
    async getWorkoutBlocks(_userId, workoutId) {
      return (await listBlocksForWorkoutDb(client, workoutId)).map(rowToWorkoutBlock);
    },
    async getBlockSets(_userId, blockId) {
      const rows = await listSetsForBlockDb(client, blockId);
      return rows.map((r) => ({
        id: r.id,
        workoutId: r.workout_id,
        blockId: r.block_id ?? undefined,
        exerciseId: r.exercise_id,
        order: r.order,
        reps: r.reps ?? undefined,
        weightKg: r.weight_kg ?? undefined,
        durationSec: r.duration_sec ?? undefined,
        restSec: r.rest_sec ?? undefined,
        rpe: r.rpe ?? undefined,
      }));
    },
    async completeBlock(_userId, blockId, result) {
      return rowToWorkoutBlock(await updateBlockResultDb(client, blockId, result));
    },
```

- [x] **Step 7: Add `blockId` to the existing `getWorkoutSets` mapping (both implementations)**

The demo `getWorkoutSets` method's returned object literal gets `blockId:
r.blockId,` added; the Supabase `getWorkoutSets` method's returned object
literal gets `blockId: r.block_id ?? undefined,` added — same shape as
`getBlockSets` above, so a set's block membership is visible everywhere it's
read, not just from `getBlockSets`.

- [x] **Step 8: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit -p .`
Expected: no errors.

- [x] **Step 9: Commit**

```bash
git add apps/mobile/src/lib/data/repository.ts
git commit -m "Wire circuit-workout blocks into the app data repository"
```

---

## Task 7: Query hooks

**Files:**
- Modify: `apps/mobile/src/lib/data/queries.ts`

**Interfaces:**
- Consumes: Task 6's `NewCircuitWorkout`, `DataRepository.addCircuitWorkout/getWorkoutBlocks/getBlockSets/completeBlock`.
- Produces: `useAddCircuitWorkout()`, `useWorkoutBlocks(workoutId)`, `useBlockSets(blockId)`, `useCompleteBlock()` — Task 9 (`CircuitRunnerScreen`) and Task 8/10 consume these.

- [x] **Step 1: Add the import**

In the `./repository` import line (where `NewWorkout`/`PlannedInput` are
already imported), add `type NewCircuitWorkout`.

- [x] **Step 2: Add the hooks**

Add right after `useAddWorkout`:

```ts
export function useAddCircuitWorkout() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (workout: NewCircuitWorkout) => repo.addCircuitWorkout(user!.id, workout),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workouts', user?.id] });
      qc.invalidateQueries({ queryKey: ['muscleSessions', user?.id] });
    },
  });
}

export function useWorkoutBlocks(workoutId: string | undefined) {
  const { user } = useAuth();
  const repo = useRepository();
  return useQuery({
    queryKey: ['workoutBlocks', workoutId],
    enabled: !!user && !!workoutId,
    queryFn: () => repo.getWorkoutBlocks(user!.id, workoutId!),
  });
}

export function useBlockSets(blockId: string | undefined) {
  const { user } = useAuth();
  const repo = useRepository();
  return useQuery({
    queryKey: ['blockSets', blockId],
    enabled: !!user && !!blockId,
    queryFn: () => repo.getBlockSets(user!.id, blockId!),
  });
}

export function useCompleteBlock() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { blockId: string; workoutId: string; completedRounds?: number; resultTimeSec?: number }) =>
      repo.completeBlock(user!.id, input.blockId, { completedRounds: input.completedRounds, resultTimeSec: input.resultTimeSec }),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ['workoutBlocks', input.workoutId] });
    },
  });
}
```

- [x] **Step 3: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit -p .`
Expected: no errors.

- [x] **Step 4: Commit**

```bash
git add apps/mobile/src/lib/data/queries.ts
git commit -m "Add circuit-workout block query hooks"
```

---

## Task 8: `NewWorkoutScreen` — block-based creation

**Files:**
- Modify: `apps/mobile/src/features/training/NewWorkoutScreen.tsx`

**Interfaces:**
- Consumes: Task 7's `useAddCircuitWorkout`; existing `useAddWorkout`, `useCustomExercises`, `useExerciseHistory`, `useWorkouts`, `useWorkoutSets`; `EXERCISE_LIBRARY` from `@supotsu/shared` (already imported per the Garmin-exercise-lookup fix).
- Produces: nothing new consumed elsewhere — this is a leaf screen.

The screen's exercise-adding UI (search, `order`/`selected` state, the
exercise picker, the Garmin-import "Reprendre une séance déjà faite"
pre-fill) all currently operate on ONE flat list. This task turns that state
into an array of block drafts, keeping today's single-strength-block case
fully backward compatible (same `addWorkout` call, same UI look, when the
user never touches the block picker).

- [x] **Step 1: Add block draft state above the existing `order`/`selected` state**

Replace:

```ts
  const [order, setOrder] = useState<string[]>([]);
  const [selected, setSelected] = useState<Record<string, SetDraft>>({});
```

with:

```ts
  interface BlockDraft {
    format: BlockFormat;
    timeCapSec: string;
    targetRounds: string;
    order: string[];
    selected: Record<string, SetDraft>;
  }
  const emptyBlock = (): BlockDraft => ({ format: 'strength', timeCapSec: '12', targetRounds: '10', order: [], selected: {} });
  const [blocks, setBlocks] = useState<BlockDraft[]>([emptyBlock()]);
  const [activeBlock, setActiveBlock] = useState(0);
  const order = blocks[activeBlock]!.order;
  const selected = blocks[activeBlock]!.selected;
  const updateActiveBlock = (patch: Partial<BlockDraft>): void => {
    setBlocks((prev) => prev.map((b, i) => (i === activeBlock ? { ...b, ...patch } : b)));
  };
```

Add `import type { BlockFormat } from '@supotsu/core';` to the top imports.

- [x] **Step 2: Rewire every existing `setOrder`/`setSelected` call to go through `updateActiveBlock`**

Search the file for `setOrder(` and `setSelected(` (both take a function or
value updater) — each becomes `updateActiveBlock({ order: ... })` /
`updateActiveBlock({ selected: ... })` using the current `order`/`selected`
values already destructured above, e.g. a call like
`setOrder((prev) => [...prev, id])` becomes:

```ts
updateActiveBlock({ order: [...order, id] });
```

and a call like `setSelected((prev) => ({ ...prev, [id]: draft }))` becomes:

```ts
updateActiveBlock({ selected: { ...selected, [id]: draft } });
```

(There are a handful of these — `add`, `remove`, `update` helper functions
in the file's body. Convert each the same way: read `order`/`selected` from
the destructured `const`s above, write through `updateActiveBlock`.)

- [x] **Step 3: Add the block-list UI above the existing exercise-search section**

Insert, right before the existing `<Text variant="heading" ...>Ajouter un
exercice</Text>` block:

```tsx
      <View style={{ gap: spacing[3] }}>
        {blocks.map((b, i) => (
          <Pressable key={i} onPress={() => setActiveBlock(i)}>
            <Card elevated={i === activeBlock} style={i === activeBlock ? { borderColor: colors.primary } : undefined}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                    <Text variant="caption" style={{ color: '#04140b', fontWeight: '700' }}>{i + 1}</Text>
                  </View>
                  <Text variant="body" style={{ fontWeight: '700' }}>
                    {b.format === 'strength' ? 'Musculation' : b.format === 'amrap' ? 'AMRAP' : b.format === 'emom' ? 'EMOM' : 'Pour le temps'}
                  </Text>
                </View>
                {blocks.length > 1 ? (
                  <Pressable onPress={() => { setBlocks((prev) => prev.filter((_, j) => j !== i)); setActiveBlock(0); }} hitSlop={8}>
                    <Text variant="body" style={{ color: colors.error }}>×</Text>
                  </Pressable>
                ) : null}
              </View>
              {i === activeBlock ? (
                <>
                  <SegmentedControl
                    options={[
                      { value: 'strength', label: 'Musculation' },
                      { value: 'amrap', label: 'AMRAP' },
                      { value: 'emom', label: 'EMOM' },
                      { value: 'for_time', label: 'Pour le temps' },
                    ]}
                    value={b.format}
                    onChange={(v) => updateActiveBlock({ format: v as BlockFormat })}
                  />
                  {b.format === 'amrap' ? (
                    <Input label="Temps limite (min)" keyboardType="numeric" value={b.timeCapSec} onChangeText={(v) => updateActiveBlock({ timeCapSec: v })} />
                  ) : null}
                  {b.format === 'emom' ? (
                    <View style={{ flexDirection: 'row', gap: spacing[3] }}>
                      <View style={{ flex: 1 }}>
                        <Input label="Intervalle (s)" keyboardType="numeric" value={b.timeCapSec} onChangeText={(v) => updateActiveBlock({ timeCapSec: v })} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Input label="Nombre d'intervalles" keyboardType="numeric" value={b.targetRounds} onChangeText={(v) => updateActiveBlock({ targetRounds: v })} />
                      </View>
                    </View>
                  ) : null}
                  {b.format === 'for_time' ? (
                    <Input label="Nombre de rounds" keyboardType="numeric" value={b.targetRounds} onChangeText={(v) => updateActiveBlock({ targetRounds: v })} />
                  ) : null}
                </>
              ) : (
                <Text variant="caption" color="textSubtle">{b.order.length} exercice{b.order.length > 1 ? 's' : ''}</Text>
              )}
            </Card>
          </Pressable>
        ))}
        <Pressable onPress={() => { setBlocks((prev) => [...prev, emptyBlock()]); setActiveBlock(blocks.length); }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radii.lg, padding: spacing[4] }}>
            <Text variant="body" color="textMuted">+ Ajouter un bloc</Text>
          </View>
        </Pressable>
      </View>
```

Add `SegmentedControl` and `Input` to the existing `@supotsu/ui` import line
if not already imported.

- [x] **Step 4: Change the exercise-search section's title to reference the active block**

Where the file currently renders a static `<Text variant="heading">Ajouter
un exercice</Text>`, leave it as-is (it now implicitly applies to the active
block, consistent with the mockup) — no change needed here beyond what Step
3 already added above it.

- [x] **Step 5: Wire submit to branch on block count/format**

Find the existing submit handler (the function passed to "Créer la séance",
currently calling `addWorkout.mutateAsync` with `{ name, sets: order.map(...)
}`). Replace its body with:

```ts
  const addWorkout = useAddWorkout();
  const addCircuitWorkout = useAddCircuitWorkout();

  const submit = async (): Promise<void> => {
    setError(null);
    if (!name.trim()) {
      setError('Donne un nom à ta séance.');
      return;
    }
    const isSingleStrength = blocks.length === 1 && blocks[0]!.format === 'strength';
    try {
      if (isSingleStrength) {
        await addWorkout.mutateAsync({
          name: name.trim(),
          sets: blocks[0]!.order.map((id, i) => {
            const s = blocks[0]!.selected[id]!;
            return { exerciseId: id, order: i, reps: s.reps ? Number(s.reps) : undefined, weightKg: s.weight ? Number(s.weight) : undefined, restSec: s.rest ? Number(s.rest) : undefined };
          }),
        });
      } else {
        await addCircuitWorkout.mutateAsync({
          name: name.trim(),
          blocks: blocks.map((b) => ({
            format: b.format,
            timeCapSec: b.format === 'amrap' || b.format === 'emom' ? Number(b.timeCapSec) || undefined : undefined,
            targetRounds: b.format === 'emom' || b.format === 'for_time' ? Number(b.targetRounds) || undefined : undefined,
            sets: b.order.map((id, i) => {
              const s = b.selected[id]!;
              return {
                exerciseId: id,
                order: i,
                reps: s.reps ? Number(s.reps) : undefined,
                weightKg: b.format === 'strength' && s.weight ? Number(s.weight) : undefined,
                restSec: b.format === 'strength' && s.rest ? Number(s.rest) : undefined,
              };
            }),
          })),
        });
      }
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Échec de la création.');
    }
  };
```

(Keep the existing `useAddWorkout` import/usage — only add
`useAddCircuitWorkout` alongside it, and replace whatever the prior submit
function was named with this `submit`, updating the "Créer la séance"
button's `onPress` to call it.)

- [x] **Step 6: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit -p .`
Expected: no errors.

- [x] **Step 7: Lint**

Run: `npx eslint apps/mobile/src/features/training/NewWorkoutScreen.tsx`
Expected: no errors.

- [x] **Step 8: Manual check**

Run the app (`run` skill or `npx expo start`), open Sport → Nouvelle
séance: confirm a single default Musculation block behaves exactly like
before (search, add exercise, create — same as pre-change), then add a
second block, switch its format to AMRAP, confirm the time-cap field
appears, and create a mixed session without errors.

- [x] **Step 9: Commit**

```bash
git add apps/mobile/src/features/training/NewWorkoutScreen.tsx
git commit -m "NewWorkoutScreen: build sessions as a sequence of blocks"
```

---

## Task 9: `CircuitRunnerScreen` — live block-by-block execution

**Files:**
- Create: `apps/mobile/src/features/training/CircuitRunnerScreen.tsx`
- Create: `apps/mobile/app/(tabs)/sport/workout/[id]/run.tsx`
- Modify: `apps/mobile/src/features/training/WorkoutDetailScreen.tsx`

**Interfaces:**
- Consumes: Task 4's `computeAmrapState`/`computeEmomState`/`computeForTimeState`/`formatClock`; Task 7's `useWorkoutBlocks`, `useBlockSets`, `useCompleteBlock`; existing `useSetWorkoutStatus`, `EXERCISE_LIBRARY`.
- Produces: route `/sport/workout/[id]/run` — nothing else consumes this screen.

- [x] **Step 1: Write `CircuitRunnerScreen.tsx`**

```tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Badge, Button, Card, EmptyState, Icon, Screen, Text, triggerHaptic, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { EXERCISE_LIBRARY } from '@supotsu/shared';
import { useSetWorkoutStatus, useWorkoutBlocks, useBlockSets, useCompleteBlock, useCustomExercises } from '@/lib/data/queries';
import { computeAmrapState, computeEmomState, computeForTimeState, formatClock } from './blockRunnerEngine';

const FORMAT_LABEL: Record<string, string> = { strength: 'Musculation', amrap: 'AMRAP', emom: 'EMOM', for_time: 'Pour le temps' };
const FORMAT_COLOR_KEY: Record<string, 'accentStrength' | 'accentEndurance' | 'accentLime'> = {
  amrap: 'accentStrength',
  emom: 'accentEndurance',
  for_time: 'accentLime',
};

/** Live-guided execution for a session's blocks, one at a time — timer + the current block's exercises, advancing automatically when a timed block finishes. */
export function CircuitRunnerScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: blocks = [], isLoading } = useWorkoutBlocks(id);
  const { data: customExercises = [] } = useCustomExercises();
  const completeBlock = useCompleteBlock();
  const setWorkoutStatus = useSetWorkoutStatus();

  const exerciseName = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of EXERCISE_LIBRARY) map.set(e.id, e.name);
    for (const e of customExercises) map.set(e.id, e.name);
    return (exerciseId: string): string => map.get(exerciseId) ?? exerciseId;
  }, [customExercises]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [roundsCompleted, setRoundsCompleted] = useState(0);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  const active = blocks[activeIndex];
  const { data: sets = [] } = useBlockSets(active?.id);

  useEffect(() => {
    setElapsedSec(0);
    setRoundsCompleted(0);
  }, [activeIndex]);

  useEffect(() => {
    if (!active || active.format === 'strength') return;
    tick.current = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => {
      if (tick.current) clearInterval(tick.current);
    };
  }, [active?.id, active?.format]);

  const state =
    active?.format === 'amrap'
      ? computeAmrapState(elapsedSec, active.timeCapSec ?? 0, roundsCompleted)
      : active?.format === 'emom'
        ? computeEmomState(elapsedSec, active.timeCapSec ?? 60, active.targetRounds ?? 1)
        : active?.format === 'for_time'
          ? computeForTimeState(elapsedSec, roundsCompleted, active.targetRounds ?? 1)
          : null;

  const finishActiveBlock = async (): Promise<void> => {
    if (!active) return;
    if (tick.current) clearInterval(tick.current);
    if (active.format !== 'strength') {
      await completeBlock.mutateAsync({
        blockId: active.id,
        workoutId: active.workoutId,
        completedRounds: active.format === 'emom' ? active.targetRounds : roundsCompleted,
        resultTimeSec: active.format === 'for_time' ? elapsedSec : active.format === 'amrap' ? (active.timeCapSec ?? 0) : (active.timeCapSec ?? 0) * (active.targetRounds ?? 0),
      });
    }
    if (activeIndex + 1 < blocks.length) {
      setActiveIndex(activeIndex + 1);
    } else {
      await setWorkoutStatus.mutateAsync({ workoutId: active.workoutId, status: 'completed', completedAt: new Date().toISOString() });
      router.replace({ pathname: '/sport/workout/[id]', params: { id: active.workoutId } });
    }
  };

  useEffect(() => {
    if (state?.isFinished) {
      triggerHaptic();
      void finishActiveBlock();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.isFinished]);

  if (isLoading) {
    return (
      <Screen>
        <Text variant="body" color="textMuted">Chargement…</Text>
      </Screen>
    );
  }
  if (!active) {
    return (
      <Screen>
        <EmptyState icon={<Icon name="dumbbell" size={44} color={colors.textSubtle} />} title="Séance introuvable" message="Cette séance n'a pas de bloc à exécuter." actionLabel="Retour" onAction={() => router.back()} />
      </Screen>
    );
  }

  const colorKey = FORMAT_COLOR_KEY[active.format];
  const accent = colorKey ? colors[colorKey] : colors.primary;

  return (
    <Screen style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
        <Text variant="heading">{FORMAT_LABEL[active.format]}</Text>
        {blocks.length > 1 ? <Badge label={`Bloc ${activeIndex + 1} / ${blocks.length}`} tone="info" /> : null}
      </View>

      {active.format === 'strength' ? (
        <View style={{ flex: 1, gap: spacing[3] }}>
          <View style={{ gap: spacing[2] }}>
            {sets.map((s) => (
              <Card key={s.id}>
                <Text variant="body" style={{ fontWeight: '700' }}>{exerciseName(s.exerciseId)}</Text>
                <Text variant="caption" color="textSubtle">
                  {s.reps != null ? `${s.reps} reps` : '—'}{s.weightKg != null ? ` · ${s.weightKg} kg` : ''}
                </Text>
              </Card>
            ))}
          </View>
          <Button label="Bloc suivant" onPress={() => void finishActiveBlock()} />
        </View>
      ) : (
        <View style={{ flex: 1, gap: spacing[4] }}>
          <View style={{ alignItems: 'center', gap: spacing[3] }}>
            <Text variant="caption" color="textSubtle">{active.format === 'emom' ? `Intervalle ${state!.currentRound} / ${active.targetRounds}` : `Round ${state!.currentRound}`}</Text>
            <View style={{ width: 224, height: 224, borderRadius: radii.full, borderWidth: 3, borderColor: accent, backgroundColor: `${accent}22`, alignItems: 'center', justifyContent: 'center' }}>
              <Text variant="display">{formatClock(state!.displaySec)}</Text>
            </View>
          </View>
          <View style={{ gap: spacing[2] }}>
            {sets.map((s) => (
              <Card key={s.id}>
                <Text variant="body" style={{ fontWeight: '700' }}>{exerciseName(s.exerciseId)}</Text>
                <Text variant="caption" color="textSubtle">{s.reps != null ? `${s.reps} reps` : s.durationSec != null ? `${s.durationSec} s` : '—'}</Text>
              </Card>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <Button label="Arrêter" variant="secondary" onPress={() => router.back()} />
            {active.format !== 'emom' ? <Button label="Round terminé" onPress={() => setRoundsCompleted((r) => r + 1)} /> : null}
          </View>
        </View>
      )}
    </Screen>
  );
}
```

- [x] **Step 2: Add the route file**

```tsx
import React from 'react';
import { CircuitRunnerScreen } from '@/features/training/CircuitRunnerScreen';

export default function WorkoutRun(): React.JSX.Element {
  return <CircuitRunnerScreen />;
}
```

- [x] **Step 3: Add a "Lancer" button to `WorkoutDetailScreen`**

In `WorkoutDetailScreen.tsx`, add the hook and a conditional button. Import
`useWorkoutBlocks` from `@/lib/data/queries`, and inside the component:

```ts
  const { data: blocks = [] } = useWorkoutBlocks(id);
```

In the button row near the bottom (currently `Retour` / `Modifier` /
`Supprimer`), add a `Lancer` button before them when the workout is startable:

```tsx
      {!confirmingDelete && workout.status === 'planned' && blocks.length > 0 ? (
        <View style={{ alignItems: 'flex-start' }}>
          <Button label="Lancer" onPress={() => router.push({ pathname: '/sport/workout/[id]/run', params: { id: workout.id } })} />
        </View>
      ) : null}
```

Place it right above the existing `{confirmingDelete ? (...) : (...)}` block.

- [x] **Step 4: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit -p .`
Expected: no errors.

- [x] **Step 5: Lint**

Run: `npx eslint apps/mobile/src/features/training/CircuitRunnerScreen.tsx apps/mobile/src/features/training/WorkoutDetailScreen.tsx`
Expected: no errors.

- [x] **Step 6: Manual check**

Create a mixed EMOM+AMRAP session via Task 8's UI, open its detail page,
tap "Lancer": confirm the EMOM block's ring counts down and advances
intervals automatically, then the AMRAP block appears with a working "Round
terminé" button and finishes at 0:00, then the workout's status becomes
"Terminée" and you land back on the detail screen.

- [x] **Step 7: Commit**

```bash
git add apps/mobile/src/features/training/CircuitRunnerScreen.tsx "apps/mobile/app/(tabs)/sport/workout/[id]/run.tsx" apps/mobile/src/features/training/WorkoutDetailScreen.tsx
git commit -m "Add live block-by-block circuit workout execution"
```

---

## Task 10: Block-aware history display

**Files:**
- Modify: `apps/mobile/src/features/training/WorkoutDetailScreen.tsx`
- Modify: `apps/mobile/src/features/activities/ActivityDetailScreen.tsx`

**Interfaces:**
- Consumes: Task 7's `useWorkoutBlocks`, `useBlockSets`.

- [x] **Step 1: `WorkoutDetailScreen` — show blocks instead of the flat exercise list when the session has any**

The screen already calls `useWorkoutBlocks(id)` (Task 9, Step 3). Replace
the existing "Exercices" `<Card>` block with a conditional: when `blocks.length
> 0`, render one card per block (name + result line + its own exercises via
`useBlockSets`); otherwise keep today's flat `byExercise` card unchanged.

```tsx
      {blocks.length > 0 ? (
        <View style={{ gap: spacing[3] }}>
          {blocks.map((b, i) => (
            <BlockSummaryCard key={b.id} block={b} index={i} exerciseName={exerciseName} />
          ))}
        </View>
      ) : (
        <Card>
          {/* existing "Exercices" card content, unchanged */}
        </Card>
      )}
```

Add the helper component at the bottom of the file, exported so
`ActivityDetailScreen.tsx` (Step 2) can reuse it directly instead of
duplicating the block-summary layout:

```tsx
const BLOCK_FORMAT_LABEL: Record<WorkoutBlock['format'], string> = {
  strength: 'Musculation',
  amrap: 'AMRAP',
  emom: 'EMOM',
  for_time: 'Pour le temps',
};

function blockResultLine(b: WorkoutBlock): string {
  if (b.format === 'amrap') return `AMRAP ${b.timeCapSec ? Math.round(b.timeCapSec / 60) : '?'} min${b.completedRounds != null ? ` — ${b.completedRounds} rounds` : ''}`;
  if (b.format === 'emom') return `EMOM ${b.targetRounds ?? '?'}×${b.timeCapSec ?? '?'} s`;
  if (b.format === 'for_time') return `Pour le temps${b.resultTimeSec != null ? ` — ${Math.floor(b.resultTimeSec / 60)} min ${b.resultTimeSec % 60}` : ''}`;
  return 'Musculation';
}

export function BlockSummaryCard({
  block,
  index,
  exerciseName,
}: {
  block: WorkoutBlock;
  index: number;
  exerciseName: (id: string) => string;
}): React.JSX.Element {
  const { data: sets = [] } = useBlockSets(block.id);
  return (
    <Card>
      <Text variant="heading">Bloc {index + 1} · {BLOCK_FORMAT_LABEL[block.format]}</Text>
      <Text variant="caption" color="textMuted">{blockResultLine(block)}</Text>
      <View style={{ marginTop: spacing[2], gap: spacing[1] }}>
        {sets.map((s) => (
          <Text key={s.id} variant="caption" color="textSubtle">
            {exerciseName(s.exerciseId)}{s.reps != null ? ` · ${s.reps} reps` : ''}{block.format === 'strength' && s.weightKg != null ? ` · ${s.weightKg} kg` : ''}
          </Text>
        ))}
      </View>
    </Card>
  );
}
```

Import `useBlockSets` alongside `useWorkoutBlocks`, and `type { WorkoutBlock
}` from `@supotsu/core` (already imported for `WorkoutStatus` in this file —
add `WorkoutBlock` to that same import line).

- [x] **Step 2: `ActivityDetailScreen` — same block-aware summary for a matched workout**

The screen already computes `matchedWorkout` and reads its sets via
`useWorkoutSets(matchedWorkout?.id)`. Import `BlockSummaryCard` from
`WorkoutDetailScreen.tsx` and `useWorkoutBlocks` from `@/lib/data/queries`,
add:

```ts
  const { data: blocks = [] } = useWorkoutBlocks(matchedWorkout?.id);
```

Then, in the JSX where the screen currently renders `byExercise` groups for
`matchedWorkout`, wrap that block in a check and render
`BlockSummaryCard` per block when there are any:

```tsx
      {matchedWorkout && blocks.length > 0 ? (
        <View style={{ gap: spacing[3] }}>
          {blocks.map((b, i) => (
            <BlockSummaryCard key={b.id} block={b} index={i} exerciseName={exerciseName} />
          ))}
        </View>
      ) : matchedWorkout ? (
        // existing byExercise rendering, unchanged
        <View />
      ) : null}
```

(Keep the existing `byExercise`-based JSX exactly as it is today in the
`matchedWorkout ? (...)` branch — only the `blocks.length > 0` branch above
it is new.)

- [x] **Step 3: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit -p .`
Expected: no errors.

- [x] **Step 4: Lint**

Run: `npx eslint apps/mobile/src/features/training/WorkoutDetailScreen.tsx apps/mobile/src/features/activities/ActivityDetailScreen.tsx`
Expected: no errors.

- [x] **Step 5: Manual check**

Open the detail page and the matched activity page for the mixed session
created in Task 9's manual check: confirm both show "Bloc 1 · EMOM" / "Bloc
2 · AMRAP" with their own exercises and result lines instead of one flat
list.

- [x] **Step 6: Commit**

```bash
git add apps/mobile/src/features/training/WorkoutDetailScreen.tsx apps/mobile/src/features/activities/ActivityDetailScreen.tsx
git commit -m "Show block-by-block summaries in workout/activity history"
```

---

## Task 11: Full verification pass

**Files:** none (verification only).

- [x] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass, including Task 4's 9 new ones.

- [x] **Step 2: Full typecheck**

Run: `cd apps/mobile && npx tsc --noEmit -p .`
Expected: no errors.

- [x] **Step 3: Full lint**

Run: `cd /path/to/repo && npx eslint apps/mobile/src apps/mobile/app`
Expected: no errors.

- [x] **Step 4: Web bundle sanity check**

Run: `npx pnpm --filter @supotsu/mobile export:web`
Expected: exports successfully (catches any RN-only API used somewhere it
shouldn't be, same check used throughout this project for UI changes).

- [x] **Step 5: Remind the user about the migration**

State explicitly at the end of this task: migration `0023` (Task 1) still
needs to be applied to the live Supabase project by the user
(`supabase db push` after `supabase login`, or the dashboard SQL editor) —
same as `0022` earlier in this project's history — before any of this
feature works against production data.
