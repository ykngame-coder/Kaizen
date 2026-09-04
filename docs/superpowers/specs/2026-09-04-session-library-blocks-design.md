# "Mes séances" Library Blocks — Design

**Goal:** A session saved to "Mes séances" (the shareable/reusable library) or scheduled via Planning currently loses all block structure — format (AMRAP/EMOM/pour le temps/musculation), time cap, target rounds. Launching, planning, or reprogramming such a session always recreates it as a flat, single-pass strength list, so an AMRAP session never gets its timer back. This extends the library's storage model to preserve block structure, mirroring the `workouts`/`workout_blocks`/`workout_sets` model already built and working for live workouts.

## Background

Two independent code paths both flatten block structure away, for the same underlying reason: neither storage model has ever had a concept of blocks.

- **The library** (`user_sessions`/`user_session_exercises`) is a flat exercise list. `flattenBlocksToExercises` explicitly discards block boundaries when a session is saved to it. `useLaunchSession` (just fixed in the previous session to make launched sessions live-trackable) currently hardcodes every launched session as a single `'strength'` block, since the library never told it otherwise.
- **Scheduling** (`PlannedInput.sets` → `addPlannedWorkout` → always the blockless `insertWorkout`, never `insertWorkoutWithBlocks`) has the identical gap, one level removed: `usePlanUserSession` (start a scheduled library/program session) and `useReprogramWorkout` (reschedule an already-completed workout for a future date) both read a source that may have real blocks and write it out flat.

Both paths converge on the same fix: give a block-aware source (blocks + exercises) all the way through to whatever finally creates the live/planned `workouts` row.

A third, coach-authored catalogue (`programs` table) was checked and is metadata-only (title/focus/level/price) — no exercise-level content, so no second parallel model to reconcile.

## Scope

In scope: `user_sessions`/`user_session_exercises` gain a real block model; every function that reads or writes them becomes block-aware; `usePlanUserSession` and `useReprogramWorkout` are updated to preserve blocks when creating a planned `workouts` row (reusing `insertWorkoutWithBlocks`, already used by `addCircuitWorkout`).

Out of scope: the coach-authored `programs` catalogue (no content to preserve); the live runner UI itself (`CircuitRunnerScreen`) — already handles multi-block sessions correctly, this only ensures it actually receives one.

## Architecture

```
┌─────────────────────┐   flattenBlocksToExercises      ┌──────────────────┐
│ SessionBlocksEditor  │ ─── (REPLACED: keeps blocks) ──▶│ user_sessions +  │
│ (builder.blocks)     │                                  │ user_session_    │
└─────────────────────┘                                  │ blocks +         │
                                                            │ user_session_    │
        ┌──────────────────────────────────────────────── │ exercises        │
        │                                                  └──────────────────┘
        │ useCopySession (block-aware copy)                        │
        ▼                                                           │ useLaunchSession /
┌──────────────────┐                                                │ usePlanUserSession /
│ new user_sessions │◀───────────────────────────────────────────────┘ useReprogramWorkout
│ row (copy)        │                                                │ (read real blocks)
└──────────────────┘                                                ▼
                                                            ┌──────────────────┐
                                                            │ workouts +       │
                                                            │ workout_blocks + │
                                                            │ workout_sets     │
                                                            │ (insertWorkout-  │
                                                            │  WithBlocks)     │
                                                            └──────────────────┘
```

## Components

**Migration `0028_user_session_blocks.sql`**

```sql
create table public.user_session_blocks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.user_sessions (id) on delete cascade,
  "order" smallint not null default 0,
  format text not null check (format in ('strength', 'amrap', 'emom', 'for_time')),
  time_cap_sec integer,
  target_rounds smallint
);

create index user_session_blocks_session_idx on public.user_session_blocks (session_id);

alter table public.user_session_exercises
  add column block_id uuid references public.user_session_blocks (id) on delete cascade;

create index user_session_exercises_block_idx on public.user_session_exercises (block_id) where block_id is not null;

alter table public.user_session_blocks enable row level security;

create policy "user_session_blocks readable via parent session"
  on public.user_session_blocks for select
  to authenticated
  using (
    exists (
      select 1 from public.user_sessions s
      where s.id = session_id and (s.visibility = 'public' or s.user_id = auth.uid())
    )
  );

create policy "user_session_blocks writable via parent session"
  on public.user_session_blocks for all
  using (exists (select 1 from public.user_sessions s where s.id = session_id and s.user_id = auth.uid()))
  with check (exists (select 1 from public.user_sessions s where s.id = session_id and s.user_id = auth.uid()));
```

Same shape and RLS pattern as `workout_blocks` (migration 0023), except readability follows the parent session's `visibility` (public sessions are browsable/copyable by other users — `workout_blocks` never needed this since workouts are always private). `block_id` is nullable: existing rows saved before this migration stay `null` forever — they're not backfilled, just handled as "legacy flat" by every reader (see Backward compatibility below).

**`packages/core/src/user-programs.ts`**
`UserSessionExercise` gains `blockId?: UUID`. New `UserSessionBlock { id: UUID; sessionId: UUID; order: number; format: BlockFormat; timeCapSec?: number; targetRounds?: number }` (imports `BlockFormat` from `./training`, already defined there).

**`packages/shared/src/schemas.ts`**
`sessionExerciseInputSchema` unchanged. New `sessionBlockInputSchema`: `{ format: z.enum(['strength','amrap','emom','for_time']), timeCapSec?: number, targetRounds?: number, exercises: sessionExerciseInputSchema[] (1-50) }`. `userSessionInputSchema` changes from `exercises: [...]` to `blocks: sessionBlockInputSchema[] (1-10)`.

**`packages/database/src/repositories/user-programs.ts`**
- `insertUserSession(client, input, blocks)` — same shape as `insertWorkoutWithBlocks`: insert the session row, then loop blocks inserting into `user_session_blocks`, then that block's exercises into `user_session_exercises` with the resulting `block_id`.
- New `listSessionBlocks(client, sessionId): Promise<UserSessionBlockRow[]>` (mirrors `listBlocksForWorkout`).
- `listSessionExercises` unchanged in shape — its rows now carry `block_id` once the migration lands.
- `copySession` (used by `useCopySession`) — currently reads the source's flat exercises and re-inserts them 1:1 into a new session. Becomes: read source blocks + exercises, re-insert both (new block ids), preserving structure.

**`apps/mobile/src/lib/data/repository.ts` (`DataRepository`, both demo + Supabase impls)**
- `addUserSession(userId, input: UserSessionInput)` — `input.blocks` instead of `input.exercises`; both impls build/insert the block rows.
- `getSessionExercises` stays; new `getSessionBlocks(userId, sessionId): Promise<UserSessionBlock[]>`.
- `copySession` — block-aware, per above.
- Demo (local JSON) repo mirrors the same block/exercise split in its own storage.

**`apps/mobile/src/features/training/sessionBuilder.ts`**
`flattenBlocksToExercises` (discards blocks) is replaced by a structure-preserving equivalent, e.g. `blocksToSessionInput(blocks: BlockDraft[]): SessionBlockInput[]` — same per-exercise mapping it already does, just grouped by block instead of concatenated into one list. Every current caller (`NewWorkoutScreen`'s "save to library" checkbox, `SessionBuilderScreen`) switches to it.

**`apps/mobile/src/lib/data/queries.ts`**
- `useSessionBlocks(sessionId)` — new, mirrors `useWorkoutBlocks`.
- `useAddUserSession` — passes `blocks` through unchanged (just a shape change at the type level).
- `useCopySession` — unchanged signature, block-aware under the hood.
- `useLaunchSession` — reads `getSessionBlocks` + `getSessionExercises`, groups exercises by `blockId`; sessions with a real block structure (post-migration saves) get their actual blocks (format, timeCapSec, targetRounds) passed to `addCircuitWorkout`. Legacy sessions (all `block_id` null, or zero rows in `user_session_blocks`) fall back to exactly today's behavior — one synthetic `'strength'` block from the flat exercise list.
- `usePlanUserSession` — same block-aware read, passes blocks to `addPlannedWorkout` (next point) instead of a flat `sets` list.
- `useReprogramWorkout` — already reads a block-aware source (`workout_blocks`/`workout_sets` via `getWorkoutBlocks`/`getWorkoutSets`, since the source is a live workout, not a library session) — today it flattens that into `PlannedInput.sets`. Fix: pass the source's real blocks through instead.
- `addPlannedWorkout` / `PlannedInput` — gains an optional `blocks` field (same shape as `NewCircuitWorkout['blocks']`), mutually exclusive with the existing optional `sets` field: when `blocks` is present the repository calls `insertWorkoutWithBlocks` instead of the blockless `insertWorkout` (exactly what `addCircuitWorkout` already does) and `sets` is ignored; `sets`-only calls keep today's blockless behavior unchanged. No new workouts-side table needed — `workout_blocks`/`workout_sets` already accept a `'planned'` status workout today.

## Backward compatibility

A session saved before this migration has zero `user_session_blocks` rows and every `user_session_exercises.block_id` is `null`. Every reader treats "no blocks found" as "legacy flat session" and reconstructs the current single-`'strength'`-block behavior — nothing regresses for existing library content; it simply doesn't gain a real format until the user re-saves or rebuilds it through the block-aware editor.

## Error handling

Standard Supabase error propagation (`if (error) throw error`), matching every existing function in this file — no new error-handling pattern introduced. `useLaunchSession`/`usePlanUserSession`/`useReprogramWorkout` keep their existing try/catch-and-surface-a-message behavior at the screen level (`MarketplaceScreen`'s `launchError` state, `PlanningScreen`'s equivalent).

## Testing

- `blocksToSessionInput` (sessionBuilder.ts): pure function, unit-testable — given `BlockDraft[]`, asserts the grouped-by-block output shape (replaces/extends existing `flattenBlocksToExercises` test coverage if any exists — check before writing new tests).
- Repository-layer functions (`insertUserSession`, `listSessionBlocks`, `copySession`): no existing test coverage precedent in this package (same as `workout_blocks`' own repository functions) — typecheck/lint only, consistent with established practice.
- `useLaunchSession`'s legacy-fallback branch (no blocks found → synthetic strength block) is the one behavior with a real regression risk — worth a manual TestFlight check on an existing pre-migration library session after this ships, alongside a newly-saved AMRAP one.

## Out of scope

- Backfilling `block_id` for existing rows (they stay flat/legacy forever, per Backward compatibility).
- The coach-authored `programs` catalogue (metadata-only, nothing to preserve).
- Any change to `CircuitRunnerScreen`/`WorkoutDetailScreen` UI itself — already correctly handles multi-block workouts; this only fixes what reaches them.
