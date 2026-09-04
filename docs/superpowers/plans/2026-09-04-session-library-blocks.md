# "Mes séances" Library Blocks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve a session's block structure (format/timeCapSec/targetRounds) through the "Mes séances" library and through scheduling, so launching, planning, or reprogramming an AMRAP/EMOM/pour-le-temps session recreates its real blocks (and therefore its live-runner timer) instead of always flattening to one plain strength block.

**Architecture:** Mirror the existing `workouts`/`workout_blocks`/`workout_sets` model onto `user_sessions`: a new `user_session_blocks` table plus a nullable `block_id` on `user_session_exercises`. Every function that reads or writes session exercises becomes block-aware; `usePlanUserSession`/`useReprogramWorkout` gain the ability to create a *planned* workout with real blocks (via the already-existing `insertWorkoutWithBlocks`, previously only used for immediately-completed circuit workouts).

**Tech Stack:** TypeScript, Supabase (Postgres + RLS), Zod, TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-04-session-library-blocks-design.md`

## Global Constraints

- A session saved before this migration has zero `user_session_blocks` rows and every `user_session_exercises.block_id` is `null` — every reader must treat "no blocks found" as "legacy flat session" and fall back to exactly today's behavior (one synthetic `'strength'` block). No backfill.
- `user_session_blocks` RLS follows the **parent session's** `visibility`/ownership (public sessions are readable by other users, same as `user_session_exercises` today) — this differs from `workout_blocks`, which is always owner-only since workouts are never public.
- `addPlannedWorkout`'s new `blocks` field is mutually exclusive with its existing `sets` field: when `blocks` is present, `sets` is ignored and the repository calls `insertWorkoutWithBlocks`; `sets`-only calls keep today's blockless behavior.
- Every native/DB error still propagates via `if (error) throw error`, matching every existing function in the touched files — no new error-handling pattern.

---

### Task 1: Migration + core types + shared input schema

**Files:**
- Create: `supabase/migrations/0028_user_session_blocks.sql`
- Modify: `packages/core/src/user-programs.ts`
- Modify: `packages/shared/src/schemas.ts`

**Interfaces:**
- Produces: `user_session_blocks` table (`id`, `session_id`, `order`, `format`, `time_cap_sec`, `target_rounds`); `user_session_exercises.block_id` (nullable uuid).
- Produces: `export interface UserSessionBlock { id: UUID; sessionId: UUID; order: number; format: BlockFormat; timeCapSec?: number; targetRounds?: number }` (packages/core).
- Produces: `UserSessionExercise` gains `blockId?: UUID`.
- Produces: `export const sessionBlockInputSchema` / `export type SessionBlockInput` (packages/shared) — `{ format: 'strength'|'amrap'|'emom'|'for_time'; timeCapSec?: number; targetRounds?: number; exercises: SessionExerciseInput[] (1-50) }`.
- Produces: `userSessionInputSchema` changes from `exercises: SessionExerciseInput[]` to `blocks: SessionBlockInput[] (1-10)`; `UserSessionInput` type shape changes accordingly.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0028_user_session_blocks.sql`:

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

This cannot be applied by the agent (no service-role key in this environment) — same as migrations 0025-0027, it needs to be run manually against Supabase before this feature works end-to-end. Flag this at hand-off.

- [ ] **Step 2: Add `UserSessionBlock` to core types**

In `packages/core/src/user-programs.ts`, find:

```ts
export interface UserSessionExercise {
  id: UUID;
  sessionId: UUID;
  exerciseId: UUID;
  order: number;
  reps?: number;
  weightKg?: number;
  durationSec?: number;
  restSec?: number;
}
```

Replace with:

```ts
export interface UserSessionExercise {
  id: UUID;
  sessionId: UUID;
  /** The block this exercise belongs to — absent for a session saved before block support existed (treated as a legacy flat session everywhere it's read). */
  blockId?: UUID;
  exerciseId: UUID;
  order: number;
  reps?: number;
  weightKg?: number;
  durationSec?: number;
  restSec?: number;
}

/** One block within a user-created session template (mirrors WorkoutBlock). */
export interface UserSessionBlock {
  id: UUID;
  sessionId: UUID;
  order: number;
  format: BlockFormat;
  timeCapSec?: number;
  targetRounds?: number;
}
```

Then find, at the top of the file:

```ts
import type { OwnedEntity, UUID } from './common';
import type { ProgramFocus } from './marketplace';
import type { SportLevel } from './user';
```

Replace with:

```ts
import type { OwnedEntity, UUID } from './common';
import type { ProgramFocus } from './marketplace';
import type { BlockFormat } from './training';
import type { SportLevel } from './user';
```

- [ ] **Step 3: Add the block input schema**

In `packages/shared/src/schemas.ts`, find:

```ts
/** One exercise prescription within a user-created session (mirrors workout_sets). */
export const sessionExerciseInputSchema = z.object({
  exerciseId: z.string().min(1),
  order: z.number().int().nonnegative().default(0),
  reps: z.number().int().positive().max(1000).optional(),
  weightKg: z.number().nonnegative().max(1000).optional(),
  durationSec: z.number().int().positive().max(36000).optional(),
  restSec: z.number().int().nonnegative().max(3600).optional(),
});
export type SessionExerciseInput = z.infer<typeof sessionExerciseInputSchema>;

/** A user-created reusable session template (Master Prompt-adjacent: user-generated content). */
export const userSessionInputSchema = z.object({
  name: z.string().min(1).max(120),
  notes: z.string().max(1000).optional(),
  visibility: visibilitySchema.default('private'),
  exercises: z.array(sessionExerciseInputSchema).min(1).max(50),
});
export type UserSessionInput = z.infer<typeof userSessionInputSchema>;
```

Replace with:

```ts
/** One exercise prescription within a user-created session (mirrors workout_sets). */
export const sessionExerciseInputSchema = z.object({
  exerciseId: z.string().min(1),
  order: z.number().int().nonnegative().default(0),
  reps: z.number().int().positive().max(1000).optional(),
  weightKg: z.number().nonnegative().max(1000).optional(),
  durationSec: z.number().int().positive().max(36000).optional(),
  restSec: z.number().int().nonnegative().max(3600).optional(),
});
export type SessionExerciseInput = z.infer<typeof sessionExerciseInputSchema>;

/** One block within a user-created session (mirrors workout_blocks). */
export const sessionBlockInputSchema = z.object({
  format: z.enum(['strength', 'amrap', 'emom', 'for_time']),
  timeCapSec: z.number().int().positive().max(36000).optional(),
  targetRounds: z.number().int().positive().max(100).optional(),
  exercises: z.array(sessionExerciseInputSchema).min(1).max(50),
});
export type SessionBlockInput = z.infer<typeof sessionBlockInputSchema>;

/** A user-created reusable session template (Master Prompt-adjacent: user-generated content). */
export const userSessionInputSchema = z.object({
  name: z.string().min(1).max(120),
  notes: z.string().max(1000).optional(),
  visibility: visibilitySchema.default('private'),
  blocks: z.array(sessionBlockInputSchema).min(1).max(10),
});
export type UserSessionInput = z.infer<typeof userSessionInputSchema>;
```

- [ ] **Step 4: Typecheck**

Run: `cd packages/core && npx tsc --noEmit`
Expected: no errors (nothing references `UserSessionInput`'s new shape yet — that's Task 3-5).

Run: `cd packages/shared && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0028_user_session_blocks.sql packages/core/src/user-programs.ts packages/shared/src/schemas.ts
git commit -m "Add user_session_blocks schema + UserSessionInput blocks shape"
```

---

### Task 2: Database package — block-aware session repository functions

**Files:**
- Modify: `packages/database/src/generated/database.types.ts`
- Modify: `packages/database/src/repositories/user-programs.ts`

**Interfaces:**
- Consumes: Task 1's schema.
- Produces: `export type UserSessionBlockRow = Database['public']['Tables']['user_session_blocks']['Row'];` and `UserSessionBlockInsertRow`.
- Produces: `insertUserSession(client, input: UserSessionInsertRow, blocks: { format: UserSessionBlockRow['format']; timeCapSec?: number; targetRounds?: number; exercises: Omit<UserSessionExerciseInsertRow, 'session_id' | 'block_id'>[] }[]): Promise<UserSessionRow>` (signature changed from the old `exercises` param).
- Produces: `export async function listSessionBlocks(client: SupotsuClient, sessionId: string): Promise<UserSessionBlockRow[]>`.
- `listSessionExercises` unchanged in signature — its rows now carry `block_id`.

- [ ] **Step 1: Add the generated types**

In `packages/database/src/generated/database.types.ts`, find the `user_session_exercises` block:

```ts
      user_session_exercises: {
        Row: {
          id: string;
          session_id: string;
          exercise_id: string;
          order: number;
          reps: number | null;
          weight_kg: number | null;
          duration_sec: number | null;
          rest_sec: number | null;
        };
        Insert: {
          session_id: string;
          exercise_id: string;
          order?: number;
          reps?: number | null;
          weight_kg?: number | null;
          duration_sec?: number | null;
          rest_sec?: number | null;
        };
        Update: Partial<Database['public']['Tables']['user_session_exercises']['Insert']>;
        Relationships: [];
      };
```

Replace with (adding `block_id` and a new `user_session_blocks` table entry right after it):

```ts
      user_session_exercises: {
        Row: {
          id: string;
          session_id: string;
          block_id: string | null;
          exercise_id: string;
          order: number;
          reps: number | null;
          weight_kg: number | null;
          duration_sec: number | null;
          rest_sec: number | null;
        };
        Insert: {
          session_id: string;
          block_id?: string | null;
          exercise_id: string;
          order?: number;
          reps?: number | null;
          weight_kg?: number | null;
          duration_sec?: number | null;
          rest_sec?: number | null;
        };
        Update: Partial<Database['public']['Tables']['user_session_exercises']['Insert']>;
        Relationships: [];
      };
      user_session_blocks: {
        Row: {
          id: string;
          session_id: string;
          order: number;
          format: 'strength' | 'amrap' | 'emom' | 'for_time';
          time_cap_sec: number | null;
          target_rounds: number | null;
        };
        Insert: {
          session_id: string;
          order?: number;
          format: 'strength' | 'amrap' | 'emom' | 'for_time';
          time_cap_sec?: number | null;
          target_rounds?: number | null;
        };
        Update: Partial<Database['public']['Tables']['user_session_blocks']['Insert']>;
        Relationships: [];
      };
```

- [ ] **Step 2: Rewrite `insertUserSession` to accept blocks; add `listSessionBlocks`**

In `packages/database/src/repositories/user-programs.ts`, find:

```ts
export type UserSessionRow = Database['public']['Tables']['user_sessions']['Row'];
export type UserSessionInsertRow = Database['public']['Tables']['user_sessions']['Insert'];
export type UserSessionExerciseRow = Database['public']['Tables']['user_session_exercises']['Row'];
export type UserSessionExerciseInsertRow = Database['public']['Tables']['user_session_exercises']['Insert'];
```

Replace with:

```ts
export type UserSessionRow = Database['public']['Tables']['user_sessions']['Row'];
export type UserSessionInsertRow = Database['public']['Tables']['user_sessions']['Insert'];
export type UserSessionExerciseRow = Database['public']['Tables']['user_session_exercises']['Row'];
export type UserSessionExerciseInsertRow = Database['public']['Tables']['user_session_exercises']['Insert'];
export type UserSessionBlockRow = Database['public']['Tables']['user_session_blocks']['Row'];
export type UserSessionBlockInsertRow = Database['public']['Tables']['user_session_blocks']['Insert'];
```

Then find:

```ts
export async function listSessionExercises(
  client: SupotsuClient,
  sessionId: string,
): Promise<UserSessionExerciseRow[]> {
  const { data, error } = await client
    .from('user_session_exercises')
    .select('*')
    .eq('session_id', sessionId)
    .order('order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Insert a session and its exercises; the quota trigger rejects past the 50 limit. */
export async function insertUserSession(
  client: SupotsuClient,
  input: UserSessionInsertRow,
  exercises: Omit<UserSessionExerciseInsertRow, 'session_id'>[],
): Promise<UserSessionRow> {
  const { data, error } = await client.from('user_sessions').insert(input).select('*').single();
  if (error) throw error;
  if (exercises.length > 0) {
    const { error: exError } = await client
      .from('user_session_exercises')
      .insert(exercises.map((e) => ({ ...e, session_id: data.id })));
    if (exError) throw exError;
  }
  return data;
}
```

Replace with:

```ts
export async function listSessionExercises(
  client: SupotsuClient,
  sessionId: string,
): Promise<UserSessionExerciseRow[]> {
  const { data, error } = await client
    .from('user_session_exercises')
    .select('*')
    .eq('session_id', sessionId)
    .order('order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** A session's blocks, in order — empty for a session saved before block support existed. */
export async function listSessionBlocks(
  client: SupotsuClient,
  sessionId: string,
): Promise<UserSessionBlockRow[]> {
  const { data, error } = await client
    .from('user_session_blocks')
    .select('*')
    .eq('session_id', sessionId)
    .order('order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Insert a session made of one or more blocks; the quota trigger rejects past the 50 limit. */
export async function insertUserSession(
  client: SupotsuClient,
  input: UserSessionInsertRow,
  blocks: {
    format: UserSessionBlockRow['format'];
    timeCapSec?: number;
    targetRounds?: number;
    exercises: Omit<UserSessionExerciseInsertRow, 'session_id' | 'block_id'>[];
  }[],
): Promise<UserSessionRow> {
  const { data, error } = await client.from('user_sessions').insert(input).select('*').single();
  if (error) throw error;

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    const { data: blockRow, error: blockError } = await client
      .from('user_session_blocks')
      .insert({
        session_id: data.id,
        order: i,
        format: b.format,
        time_cap_sec: b.timeCapSec ?? null,
        target_rounds: b.targetRounds ?? null,
      })
      .select('*')
      .single();
    if (blockError) throw blockError;

    if (b.exercises.length > 0) {
      const { error: exError } = await client
        .from('user_session_exercises')
        .insert(b.exercises.map((e) => ({ ...e, session_id: data.id, block_id: blockRow.id })));
      if (exError) throw exError;
    }
  }

  return data;
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `cd packages/database && npx tsc --noEmit && npx eslint src/repositories/user-programs.ts src/generated/database.types.ts`
Expected: no errors. (`copySession`/`copyProgram` in `apps/mobile` will fail to typecheck until Task 3 — that's expected and fixed there, not here.)

- [ ] **Step 4: Commit**

```bash
git add packages/database/src/generated/database.types.ts packages/database/src/repositories/user-programs.ts
git commit -m "Make insertUserSession block-aware, add listSessionBlocks"
```

---

### Task 3: App repository wiring (demo + Supabase)

**Files:**
- Modify: `apps/mobile/src/lib/data/repository.ts`

**Interfaces:**
- Consumes: `UserSessionBlock` (Task 1), `insertUserSession`/`listSessionBlocks` (Task 2).
- Produces: `DataRepository.getSessionBlocks(userId: string, sessionId: string): Promise<UserSessionBlock[]>`.
- Produces: `DataRepository.addUserSession` — same signature, `input: UserSessionInput` now carries `blocks` (Task 1's type change flows through automatically).
- Produces: `PlannedInput` gains `blocks?: { format: BlockFormat; timeCapSec?: number; targetRounds?: number; sets: Omit<SetEntry, 'id' | 'workoutId' | 'blockId'>[] }[]` (mutually exclusive with existing `sets?`).
- `copySession`, `copyProgram`, `addPlannedWorkout` become block-aware internally; their external signatures are unchanged.

- [ ] **Step 1: Add `UserSessionBlock` to the core-types import and the `DataRepository` interface**

Find:

```ts
  UserSession,
  UserSessionExercise,
```

Replace with:

```ts
  UserSession,
  UserSessionBlock,
  UserSessionExercise,
```

Find:

```ts
export interface PlannedInput {
  name: string;
  /** ISO date (YYYY-MM-DD) the session is planned for. */
  plannedFor: string;
  notes?: string;
  /** Optional exercise list, e.g. when reprogramming a past session or planning from a template. */
  sets?: Omit<SetEntry, 'id' | 'workoutId'>[];
}
```

Replace with:

```ts
export interface PlannedInput {
  name: string;
  /** ISO date (YYYY-MM-DD) the session is planned for. */
  plannedFor: string;
  notes?: string;
  /** Optional flat exercise list, e.g. when reprogramming a past plain-strength session or planning from a legacy flat template. Ignored when `blocks` is present. */
  sets?: Omit<SetEntry, 'id' | 'workoutId'>[];
  /** Optional block structure (AMRAP/EMOM/pour le temps/musculation) — takes priority over `sets` when present, so the planned workout is created with real blocks via insertWorkoutWithBlocks. */
  blocks?: { format: BlockFormat; timeCapSec?: number; targetRounds?: number; sets: Omit<SetEntry, 'id' | 'workoutId' | 'blockId'>[] }[];
}
```

Find the `addUserSession` and `getSessionExercises` declarations in the `DataRepository` interface:

```ts
  getSessionExercises(sessionId: string): Promise<UserSessionExercise[]>;
```

Add right after it:

```ts
  getSessionBlocks(userId: string, sessionId: string): Promise<UserSessionBlock[]>;
```

- [ ] **Step 2: Demo repository — `getSessionBlocks`, block-aware `addUserSession`, `copySession`, `copyProgram`**

Find (demo repo):

```ts
    async getSessionExercises(sessionId) {
      return readJson<UserSessionExercise>(usExKey(sessionId));
    },
    async addUserSession(userId, input) {
      const all = await readJson<UserSession>(usKey());
      if (all.filter((s) => s.userId === userId).length >= SESSIONS_QUOTA) {
        throw new Error(`Limite de ${SESSIONS_QUOTA} séances atteinte.`);
      }
      const now = new Date().toISOString();
      const session: UserSession = {
        id: randomId(),
        userId,
        name: input.name,
        notes: input.notes,
        visibility: input.visibility,
        createdAt: now,
        updatedAt: now,
      };
      await writeJson(usKey(), [session, ...all]);
      const exercises: UserSessionExercise[] = input.exercises.map((e, i) => ({
        id: randomId(),
        sessionId: session.id,
        exerciseId: e.exerciseId,
        order: e.order ?? i,
        reps: e.reps,
        weightKg: e.weightKg,
        durationSec: e.durationSec,
        restSec: e.restSec,
      }));
      await writeJson(usExKey(session.id), exercises);
      return session;
    },
```

Replace with (introduces a `usBlockKey` storage key — add it next to `usExKey`'s own definition, see Step 3 below):

```ts
    async getSessionExercises(sessionId) {
      return readJson<UserSessionExercise>(usExKey(sessionId));
    },
    async getSessionBlocks(_userId, sessionId) {
      const items = await readJson<UserSessionBlock>(usBlockKey(sessionId));
      return items.sort((a, b) => a.order - b.order);
    },
    async addUserSession(userId, input) {
      const all = await readJson<UserSession>(usKey());
      if (all.filter((s) => s.userId === userId).length >= SESSIONS_QUOTA) {
        throw new Error(`Limite de ${SESSIONS_QUOTA} séances atteinte.`);
      }
      const now = new Date().toISOString();
      const session: UserSession = {
        id: randomId(),
        userId,
        name: input.name,
        notes: input.notes,
        visibility: input.visibility,
        createdAt: now,
        updatedAt: now,
      };
      await writeJson(usKey(), [session, ...all]);
      const blocks: UserSessionBlock[] = [];
      const exercises: UserSessionExercise[] = [];
      input.blocks.forEach((b, i) => {
        const block: UserSessionBlock = {
          id: randomId(),
          sessionId: session.id,
          order: i,
          format: b.format,
          timeCapSec: b.timeCapSec,
          targetRounds: b.targetRounds,
        };
        blocks.push(block);
        b.exercises.forEach((e, j) => {
          exercises.push({
            id: randomId(),
            sessionId: session.id,
            blockId: block.id,
            exerciseId: e.exerciseId,
            order: e.order ?? j,
            reps: e.reps,
            weightKg: e.weightKg,
            durationSec: e.durationSec,
            restSec: e.restSec,
          });
        });
      });
      await writeJson(usBlockKey(session.id), blocks);
      await writeJson(usExKey(session.id), exercises);
      return session;
    },
```

- [ ] **Step 3: Demo repository — storage key + `copySession`/`copyProgram`**

Find:

```ts
const usExKey = (sessionId: string): string => `supotsu.usersessionexercises.${sessionId}`;
```

Add right after it:

```ts
const usBlockKey = (sessionId: string): string => `supotsu.usersessionblocks.${sessionId}`;
```

Find (demo repo's `copySession`):

```ts
    async copySession(userId, sourceSessionId) {
      const all = await readJson<UserSession>(usKey());
      const source = all.find((s) => s.id === sourceSessionId);
      if (!source) throw new Error('Séance introuvable.');
      if (all.filter((s) => s.userId === userId).length >= SESSIONS_QUOTA) {
        throw new Error(`Limite de ${SESSIONS_QUOTA} séances atteinte.`);
      }
      const exercises = await readJson<UserSessionExercise>(usExKey(sourceSessionId));
      const now = new Date().toISOString();
      const copy: UserSession = {
        id: randomId(),
        userId,
        name: source.name,
        notes: source.notes,
        visibility: 'private',
        createdAt: now,
        updatedAt: now,
      };
      await writeJson(usKey(), [copy, ...all]);
      await writeJson(
        usExKey(copy.id),
        exercises.map((e) => ({ ...e, id: randomId(), sessionId: copy.id })),
      );
      return copy;
    },
```

Replace with (copying blocks means giving each copied exercise the COPY's new block id, not the source's):

```ts
    async copySession(userId, sourceSessionId) {
      const all = await readJson<UserSession>(usKey());
      const source = all.find((s) => s.id === sourceSessionId);
      if (!source) throw new Error('Séance introuvable.');
      if (all.filter((s) => s.userId === userId).length >= SESSIONS_QUOTA) {
        throw new Error(`Limite de ${SESSIONS_QUOTA} séances atteinte.`);
      }
      const sourceBlocks = await readJson<UserSessionBlock>(usBlockKey(sourceSessionId));
      const exercises = await readJson<UserSessionExercise>(usExKey(sourceSessionId));
      const now = new Date().toISOString();
      const copy: UserSession = {
        id: randomId(),
        userId,
        name: source.name,
        notes: source.notes,
        visibility: 'private',
        createdAt: now,
        updatedAt: now,
      };
      await writeJson(usKey(), [copy, ...all]);
      const blockIdMap = new Map<string, string>();
      const newBlocks = sourceBlocks.map((b) => {
        const newId = randomId();
        blockIdMap.set(b.id, newId);
        return { ...b, id: newId, sessionId: copy.id };
      });
      await writeJson(usBlockKey(copy.id), newBlocks);
      await writeJson(
        usExKey(copy.id),
        exercises.map((e) => ({
          ...e,
          id: randomId(),
          sessionId: copy.id,
          blockId: e.blockId ? blockIdMap.get(e.blockId) : undefined,
        })),
      );
      return copy;
    },
```

Find (demo repo's `copyProgram`, inside its session-copy loop):

```ts
      const now = new Date().toISOString();
      const idMap = new Map<string, string>();
      const newSessions: UserSession[] = [];
      for (const sid of distinctSessionIds) {
        const src = allSessions.find((s) => s.id === sid);
        if (!src) continue;
        const newId = randomId();
        idMap.set(sid, newId);
        newSessions.push({ ...src, id: newId, userId, visibility: 'private', createdAt: now, updatedAt: now });
        const exercises = await readJson<UserSessionExercise>(usExKey(sid));
        await writeJson(usExKey(newId), exercises.map((e) => ({ ...e, id: randomId(), sessionId: newId })));
      }
      await writeJson(usKey(), [...newSessions, ...allSessions]);
```

Replace with:

```ts
      const now = new Date().toISOString();
      const idMap = new Map<string, string>();
      const newSessions: UserSession[] = [];
      for (const sid of distinctSessionIds) {
        const src = allSessions.find((s) => s.id === sid);
        if (!src) continue;
        const newId = randomId();
        idMap.set(sid, newId);
        newSessions.push({ ...src, id: newId, userId, visibility: 'private', createdAt: now, updatedAt: now });
        const sourceBlocks = await readJson<UserSessionBlock>(usBlockKey(sid));
        const exercises = await readJson<UserSessionExercise>(usExKey(sid));
        const blockIdMap = new Map<string, string>();
        const newBlocks = sourceBlocks.map((b) => {
          const newBlockId = randomId();
          blockIdMap.set(b.id, newBlockId);
          return { ...b, id: newBlockId, sessionId: newId };
        });
        await writeJson(usBlockKey(newId), newBlocks);
        await writeJson(
          usExKey(newId),
          exercises.map((e) => ({
            ...e,
            id: randomId(),
            sessionId: newId,
            blockId: e.blockId ? blockIdMap.get(e.blockId) : undefined,
          })),
        );
      }
      await writeJson(usKey(), [...newSessions, ...allSessions]);
```

- [ ] **Step 4: Demo repository — `addPlannedWorkout` blocks branch**

Find:

```ts
    async addPlannedWorkout(userId, input) {
      const now = new Date().toISOString();
      const created: Workout = {
        id: randomId(),
        userId,
        name: input.name,
        status: 'planned',
        plannedFor: input.plannedFor,
        notes: input.notes,
        createdAt: now,
        updatedAt: now,
      };
      const items = await readJson<Workout>(wkKey(userId));
      await writeJson(wkKey(userId), [created, ...items]);
      if (input.sets && input.sets.length > 0) {
        const rows = await readJson<LoggedSetRow & { date: string }>(setKey(userId));
        const added = input.sets.map((s) => ({
          workoutId: created.id,
          exerciseId: s.exerciseId,
          order: s.order,
          reps: s.reps ?? null,
          weightKg: s.weightKg ?? null,
          restSec: s.restSec ?? null,
          date: now,
        }));
        await writeJson(setKey(userId), [...added, ...rows]);
      }
      return created;
    },
```

Replace with:

```ts
    async addPlannedWorkout(userId, input) {
      const now = new Date().toISOString();
      const created: Workout = {
        id: randomId(),
        userId,
        name: input.name,
        status: 'planned',
        plannedFor: input.plannedFor,
        notes: input.notes,
        createdAt: now,
        updatedAt: now,
      };
      const items = await readJson<Workout>(wkKey(userId));
      await writeJson(wkKey(userId), [created, ...items]);
      if (input.blocks && input.blocks.length > 0) {
        const existingBlocks = await readJson<WorkoutBlock>(blockKey(userId));
        const existingSets = await readJson<LoggedSetRow & { date: string }>(setKey(userId));
        const newBlocks: WorkoutBlock[] = [];
        const newSets: (LoggedSetRow & { date: string })[] = [];
        input.blocks.forEach((b, i) => {
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
      } else if (input.sets && input.sets.length > 0) {
        const rows = await readJson<LoggedSetRow & { date: string }>(setKey(userId));
        const added = input.sets.map((s) => ({
          workoutId: created.id,
          exerciseId: s.exerciseId,
          order: s.order,
          reps: s.reps ?? null,
          weightKg: s.weightKg ?? null,
          restSec: s.restSec ?? null,
          date: now,
        }));
        await writeJson(setKey(userId), [...added, ...rows]);
      }
      return created;
    },
```

- [ ] **Step 5: Supabase repository — imports, `getSessionBlocks`, block-aware `addUserSession`**

Find:

```ts
  listUserSessions as listUserSessionsDb,
  listCommunitySessions as listCommunitySessionsDb,
  getUserSession as getUserSessionDb,
  listSessionExercises as listSessionExercisesDb,
  insertUserSession as insertUserSessionDb,
```

Replace with:

```ts
  listUserSessions as listUserSessionsDb,
  listCommunitySessions as listCommunitySessionsDb,
  getUserSession as getUserSessionDb,
  listSessionExercises as listSessionExercisesDb,
  listSessionBlocks,
  insertUserSession as insertUserSessionDb,
```

(this is the same `@supotsu/database` import block the existing `getUserSessionDb`/`listSessionExercisesDb` come from — `listSessionBlocks` isn't aliased since nothing else in this file uses that name).

Find (Supabase repo):

```ts
    async getSessionExercises(sessionId) {
      return (await listSessionExercisesDb(client, sessionId)).map(rowToUserSessionExercise);
    },
    async addUserSession(userId, input) {
      const row = await insertUserSessionDb(
        client,
        { user_id: userId, name: input.name, notes: input.notes ?? null, visibility: input.visibility },
        input.exercises.map((e, i) => ({
          exercise_id: e.exerciseId,
          order: e.order ?? i,
          reps: e.reps ?? null,
          weight_kg: e.weightKg ?? null,
          duration_sec: e.durationSec ?? null,
          rest_sec: e.restSec ?? null,
        })),
      );
      return rowToUserSession(row);
    },
```

Replace with:

```ts
    async getSessionExercises(sessionId) {
      return (await listSessionExercisesDb(client, sessionId)).map(rowToUserSessionExercise);
    },
    async getSessionBlocks(_userId, sessionId) {
      return (await listSessionBlocks(client, sessionId)).map(rowToUserSessionBlock);
    },
    async addUserSession(userId, input) {
      const row = await insertUserSessionDb(
        client,
        { user_id: userId, name: input.name, notes: input.notes ?? null, visibility: input.visibility },
        input.blocks.map((b) => ({
          format: b.format,
          timeCapSec: b.timeCapSec,
          targetRounds: b.targetRounds,
          exercises: b.exercises.map((e, i) => ({
            exercise_id: e.exerciseId,
            order: e.order ?? i,
            reps: e.reps ?? null,
            weight_kg: e.weightKg ?? null,
            duration_sec: e.durationSec ?? null,
            rest_sec: e.restSec ?? null,
          })),
        })),
      );
      return rowToUserSession(row);
    },
```

- [ ] **Step 6: Supabase repository — `copySession`, `copyProgram`**

Find:

```ts
    async copySession(userId, sourceSessionId) {
      const source = await getUserSessionDb(client, sourceSessionId);
      if (!source) throw new Error('Séance introuvable.');
      const exercises = await listSessionExercisesDb(client, sourceSessionId);
      const row = await insertUserSessionDb(
        client,
        { user_id: userId, name: source.name, notes: source.notes, visibility: 'private' },
        exercises.map((e) => ({
          exercise_id: e.exercise_id,
          order: e.order,
          reps: e.reps,
          weight_kg: e.weight_kg,
          duration_sec: e.duration_sec,
          rest_sec: e.rest_sec,
        })),
      );
      return rowToUserSession(row);
    },
```

Replace with:

```ts
    async copySession(userId, sourceSessionId) {
      const source = await getUserSessionDb(client, sourceSessionId);
      if (!source) throw new Error('Séance introuvable.');
      const sourceBlocks = await listSessionBlocks(client, sourceSessionId);
      const exercises = await listSessionExercisesDb(client, sourceSessionId);
      const blocksInput = sourceBlocks.length > 0
        ? sourceBlocks.map((b) => ({
            format: b.format,
            timeCapSec: b.time_cap_sec ?? undefined,
            targetRounds: b.target_rounds ?? undefined,
            exercises: exercises
              .filter((e) => e.block_id === b.id)
              .map((e) => ({
                exercise_id: e.exercise_id,
                order: e.order,
                reps: e.reps,
                weight_kg: e.weight_kg,
                duration_sec: e.duration_sec,
                rest_sec: e.rest_sec,
              })),
          }))
        : [
            {
              format: 'strength' as const,
              exercises: exercises.map((e) => ({
                exercise_id: e.exercise_id,
                order: e.order,
                reps: e.reps,
                weight_kg: e.weight_kg,
                duration_sec: e.duration_sec,
                rest_sec: e.rest_sec,
              })),
            },
          ];
      const row = await insertUserSessionDb(
        client,
        { user_id: userId, name: source.name, notes: source.notes, visibility: 'private' },
        blocksInput,
      );
      return rowToUserSession(row);
    },
```

Find (Supabase repo's `copyProgram`, inside its session-copy loop — distinct from the demo one already edited in Step 3):

```ts
      const idMap = new Map<string, string>();
      for (const sid of distinctSessionIds) {
        const src = await getUserSessionDb(client, sid);
        if (!src) continue;
        const exercises = await listSessionExercisesDb(client, sid);
        const newSession = await insertUserSessionDb(
          client,
          { user_id: userId, name: src.name, notes: src.notes, visibility: 'private' },
          exercises.map((e) => ({
            exercise_id: e.exercise_id,
            order: e.order,
            reps: e.reps,
            weight_kg: e.weight_kg,
            duration_sec: e.duration_sec,
            rest_sec: e.rest_sec,
          })),
        );
        idMap.set(sid, newSession.id);
      }
```

Replace with:

```ts
      const idMap = new Map<string, string>();
      for (const sid of distinctSessionIds) {
        const src = await getUserSessionDb(client, sid);
        if (!src) continue;
        const sourceBlocks = await listSessionBlocks(client, sid);
        const exercises = await listSessionExercisesDb(client, sid);
        const blocksInput = sourceBlocks.length > 0
          ? sourceBlocks.map((b) => ({
              format: b.format,
              timeCapSec: b.time_cap_sec ?? undefined,
              targetRounds: b.target_rounds ?? undefined,
              exercises: exercises
                .filter((e) => e.block_id === b.id)
                .map((e) => ({
                  exercise_id: e.exercise_id,
                  order: e.order,
                  reps: e.reps,
                  weight_kg: e.weight_kg,
                  duration_sec: e.duration_sec,
                  rest_sec: e.rest_sec,
                })),
            }))
          : [
              {
                format: 'strength' as const,
                exercises: exercises.map((e) => ({
                  exercise_id: e.exercise_id,
                  order: e.order,
                  reps: e.reps,
                  weight_kg: e.weight_kg,
                  duration_sec: e.duration_sec,
                  rest_sec: e.rest_sec,
                })),
              },
            ];
        const newSession = await insertUserSessionDb(
          client,
          { user_id: userId, name: src.name, notes: src.notes, visibility: 'private' },
          blocksInput,
        );
        idMap.set(sid, newSession.id);
      }
```

- [ ] **Step 7: Supabase repository — `addPlannedWorkout` blocks branch**

Find:

```ts
    async addPlannedWorkout(userId, input) {
      const row = input.sets && input.sets.length > 0
        ? await insertWorkout(
            client,
            {
              user_id: userId,
              name: input.name,
              status: 'planned',
              planned_for: input.plannedFor,
              notes: input.notes ?? null,
            },
            input.sets.map((s) => ({
              exercise_id: s.exerciseId,
              order: s.order,
              reps: s.reps ?? null,
              weight_kg: s.weightKg ?? null,
              rest_sec: s.restSec ?? null,
              rpe: s.rpe ?? null,
            })),
          )
        : await insertPlannedWorkout(client, {
            user_id: userId,
            name: input.name,
            planned_for: input.plannedFor,
            notes: input.notes ?? null,
          });
      return rowToWorkout(row);
    },
```

Replace with:

```ts
    async addPlannedWorkout(userId, input) {
      const row = input.blocks && input.blocks.length > 0
        ? await insertWorkoutWithBlocks(
            client,
            {
              user_id: userId,
              name: input.name,
              status: 'planned',
              planned_for: input.plannedFor,
              notes: input.notes ?? null,
            },
            input.blocks.map((b) => ({
              format: b.format,
              timeCapSec: b.timeCapSec,
              targetRounds: b.targetRounds,
              sets: b.sets.map((s) => ({
                exercise_id: s.exerciseId,
                order: s.order,
                reps: s.reps ?? null,
                weight_kg: s.weightKg ?? null,
                rest_sec: s.restSec ?? null,
              })),
            })),
          )
        : input.sets && input.sets.length > 0
        ? await insertWorkout(
            client,
            {
              user_id: userId,
              name: input.name,
              status: 'planned',
              planned_for: input.plannedFor,
              notes: input.notes ?? null,
            },
            input.sets.map((s) => ({
              exercise_id: s.exerciseId,
              order: s.order,
              reps: s.reps ?? null,
              weight_kg: s.weightKg ?? null,
              rest_sec: s.restSec ?? null,
              rpe: s.rpe ?? null,
            })),
          )
        : await insertPlannedWorkout(client, {
            user_id: userId,
            name: input.name,
            planned_for: input.plannedFor,
            notes: input.notes ?? null,
          });
      return rowToWorkout(row);
    },
```

`insertWorkoutWithBlocks` is already imported in this file (used by `addCircuitWorkout` — verify with `grep -n "insertWorkoutWithBlocks" apps/mobile/src/lib/data/repository.ts`; it's already present, no new import needed).

- [ ] **Step 8: Add `rowToUserSessionBlock` and map `block_id` in `rowToUserSessionExercise`**

Find:

```ts
function rowToUserSessionExercise(r: UserSessionExerciseRow): UserSessionExercise {
  return {
    id: r.id,
    sessionId: r.session_id,
    exerciseId: r.exercise_id,
    order: r.order,
    reps: r.reps ?? undefined,
    weightKg: r.weight_kg ?? undefined,
    durationSec: r.duration_sec ?? undefined,
    restSec: r.rest_sec ?? undefined,
  };
}
```

Replace with:

```ts
function rowToUserSessionExercise(r: UserSessionExerciseRow): UserSessionExercise {
  return {
    id: r.id,
    sessionId: r.session_id,
    blockId: r.block_id ?? undefined,
    exerciseId: r.exercise_id,
    order: r.order,
    reps: r.reps ?? undefined,
    weightKg: r.weight_kg ?? undefined,
    durationSec: r.duration_sec ?? undefined,
    restSec: r.rest_sec ?? undefined,
  };
}

function rowToUserSessionBlock(r: UserSessionBlockRow): UserSessionBlock {
  return {
    id: r.id,
    sessionId: r.session_id,
    order: r.order,
    format: r.format,
    timeCapSec: r.time_cap_sec ?? undefined,
    targetRounds: r.target_rounds ?? undefined,
  };
}
```

- [ ] **Step 9: Typecheck and lint**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json && npx eslint src/lib/data/repository.ts --ext .ts,.tsx`
Expected: no errors. (`sessionBuilder.ts`/screens calling `addUserSession` with the old `exercises` shape will fail here — that's Task 4, fixed next.)

- [ ] **Step 10: Commit**

```bash
git add apps/mobile/src/lib/data/repository.ts
git commit -m "Wire block-aware session repository methods (demo + Supabase)"
```

---

### Task 4: Session builder + screen call sites

**Files:**
- Modify: `apps/mobile/src/features/training/sessionBuilder.ts`
- Modify: `apps/mobile/src/features/training/NewWorkoutScreen.tsx`
- Modify: `apps/mobile/src/features/marketplace/SessionBuilderScreen.tsx`
- Create: `apps/mobile/src/features/training/sessionBuilder.test.ts`

**Interfaces:**
- Consumes: `SessionBlockInput` (Task 1, from `@supotsu/shared`).
- Produces: `export function blocksToSessionInput(blocks: BlockDraft[]): SessionBlockInput[]` (replaces `flattenBlocksToExercises`/`FlatSessionExercise`).

- [ ] **Step 1: Replace `flattenBlocksToExercises` with `blocksToSessionInput`**

In `apps/mobile/src/features/training/sessionBuilder.ts`, find:

```ts
export interface FlatSessionExercise {
  exerciseId: string;
  order: number;
  reps?: number;
  weightKg?: number;
  restSec?: number;
}

/**
 * Flattens all blocks into one sequential exercise list — used when saving a
 * (possibly multi-block) session into the "Mes séances" library, whose
 * UserSessionExercise model has no concept of blocks/formats. Block
 * boundaries are lost; the exercise order is preserved.
 */
export function flattenBlocksToExercises(blocks: BlockDraft[]): FlatSessionExercise[] {
  const out: FlatSessionExercise[] = [];
  for (const block of blocks) {
    for (const slotId of block.order) {
      const draft = block.selected[slotId];
      if (!draft) continue;
      out.push({
        exerciseId: draft.exerciseId,
        order: out.length,
        reps: draft.reps ? Number(draft.reps) : undefined,
        weightKg: draft.weight ? Number(draft.weight) : undefined,
        restSec: block.format === 'strength' && draft.rest ? Number(draft.rest) : undefined,
      });
    }
  }
  return out;
}
```

Replace with:

```ts
/**
 * Converts the builder's blocks into the library's SessionBlockInput shape —
 * used when saving a (possibly multi-block) session into "Mes séances".
 * Unlike the old flattenBlocksToExercises, block boundaries and format are
 * preserved (the library now has its own block model, see
 * user_session_blocks). Blocks with zero exercises are dropped since
 * userSessionInputSchema requires at least one exercise per block.
 */
export function blocksToSessionInput(blocks: BlockDraft[]): SessionBlockInput[] {
  const out: SessionBlockInput[] = [];
  for (const block of blocks) {
    const exercises: SessionExerciseInput[] = [];
    for (const slotId of block.order) {
      const draft = block.selected[slotId];
      if (!draft) continue;
      exercises.push({
        exerciseId: draft.exerciseId,
        order: exercises.length,
        reps: draft.reps ? Number(draft.reps) : undefined,
        weightKg: draft.weight ? Number(draft.weight) : undefined,
        restSec: block.format === 'strength' && draft.rest ? Number(draft.rest) : undefined,
      });
    }
    if (exercises.length === 0) continue;
    out.push({
      format: block.format,
      timeCapSec: block.format === 'amrap' ? (Number(block.timeCapSec) || 0) * 60 || undefined : block.format === 'emom' ? Number(block.timeCapSec) || undefined : undefined,
      targetRounds: block.format === 'emom' || block.format === 'for_time' || block.format === 'strength' ? Number(block.targetRounds) || undefined : undefined,
      exercises,
    });
  }
  return out;
}
```

Add `SessionBlockInput` and `SessionExerciseInput` to this file's imports — find its top `import` lines and add `import type { SessionBlockInput, SessionExerciseInput } from '@supotsu/shared';`.

- [ ] **Step 2: Write and verify a unit test for `blocksToSessionInput`**

`flattenBlocksToExercises` had no test coverage before this change — add real coverage for its replacement now, since a bug here would silently corrupt every session saved to the library.

Create `apps/mobile/src/features/training/sessionBuilder.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { blocksToSessionInput, type BlockDraft } from './sessionBuilder';

function block(overrides: Partial<BlockDraft> = {}): BlockDraft {
  return {
    format: 'strength',
    timeCapSec: '',
    targetRounds: '',
    order: [],
    selected: {},
    supersetGroups: {},
    ...overrides,
  };
}

describe('blocksToSessionInput', () => {
  it('converts a single strength block into one SessionBlockInput', () => {
    const b = block({
      order: ['slot1'],
      selected: { slot1: { exerciseId: 'squat', reps: '12', weight: '60', rest: '90' } },
    });
    const out = blocksToSessionInput([b]);
    expect(out).toEqual([
      {
        format: 'strength',
        timeCapSec: undefined,
        targetRounds: undefined,
        exercises: [{ exerciseId: 'squat', order: 0, reps: 12, weightKg: 60, restSec: 90 }],
      },
    ]);
  });

  it('preserves multiple blocks with their own format and exercises, in order', () => {
    const strength = block({
      order: ['slot1'],
      selected: { slot1: { exerciseId: 'bench', reps: '8', weight: '40', rest: '60' } },
    });
    const amrap = block({
      format: 'amrap',
      timeCapSec: '10',
      order: ['slot2', 'slot3'],
      selected: {
        slot2: { exerciseId: 'burpees', reps: '10', weight: '', rest: '' },
        slot3: { exerciseId: 'situps', reps: '15', weight: '', rest: '' },
      },
    });
    const out = blocksToSessionInput([strength, amrap]);
    expect(out).toHaveLength(2);
    expect(out[0]?.format).toBe('strength');
    expect(out[1]).toEqual({
      format: 'amrap',
      timeCapSec: 600, // 10 min -> seconds
      targetRounds: undefined,
      exercises: [
        { exerciseId: 'burpees', order: 0, reps: 10, weightKg: undefined, restSec: undefined },
        { exerciseId: 'situps', order: 1, reps: 15, weightKg: undefined, restSec: undefined },
      ],
    });
  });

  it('drops a block with zero exercises', () => {
    const empty = block({ order: [] });
    const withOne = block({
      order: ['slot1'],
      selected: { slot1: { exerciseId: 'row', reps: '10', weight: '', rest: '' } },
    });
    const out = blocksToSessionInput([empty, withOne]);
    expect(out).toHaveLength(1);
    expect(out[0]?.exercises[0]?.exerciseId).toBe('row');
  });

  it('ignores rest for non-strength blocks', () => {
    const emom = block({
      format: 'emom',
      order: ['slot1'],
      selected: { slot1: { exerciseId: 'kb-swing', reps: '15', weight: '', rest: '30' } },
    });
    const out = blocksToSessionInput([emom]);
    expect(out[0]?.exercises[0]?.restSec).toBeUndefined();
  });
});
```

Run: `cd apps/mobile && npx vitest run src/features/training/sessionBuilder.test.ts`
Expected: PASS, all 4 tests green (the implementation already exists from Step 1 above — this step is verifying it, not driving it).

- [ ] **Step 3: Update `NewWorkoutScreen.tsx`'s "save to library" call site**

Find:

```ts
import { flattenBlocksToExercises, newSlotId, useSessionBlocks, type SetDraft } from './sessionBuilder';
```

Replace with:

```ts
import { blocksToSessionInput, newSlotId, useSessionBlocks, type SetDraft } from './sessionBuilder';
```

Find:

```ts
      if (addToLibrary && !atQuota) {
        await addUserSession.mutateAsync({
          name: builder.name.trim(),
          visibility,
          exercises: flattenBlocksToExercises(builder.blocks),
        });
      }
```

Replace with:

```ts
      if (addToLibrary && !atQuota) {
        await addUserSession.mutateAsync({
          name: builder.name.trim(),
          visibility,
          blocks: blocksToSessionInput(builder.blocks),
        });
      }
```

- [ ] **Step 4: Update `SessionBuilderScreen.tsx`'s call site**

Find:

```ts
import { flattenBlocksToExercises, useSessionBlocks } from '@/features/training/sessionBuilder';
```

Replace with:

```ts
import { blocksToSessionInput, useSessionBlocks } from '@/features/training/sessionBuilder';
```

Find:

```ts
      await addSession.mutateAsync({
        name: builder.name.trim(),
        visibility,
        exercises: flattenBlocksToExercises(builder.blocks),
      });
```

Replace with:

```ts
      await addSession.mutateAsync({
        name: builder.name.trim(),
        visibility,
        blocks: blocksToSessionInput(builder.blocks),
      });
```

- [ ] **Step 5: Typecheck and lint**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json && npx eslint src/features/training/sessionBuilder.ts src/features/training/sessionBuilder.test.ts src/features/training/NewWorkoutScreen.tsx src/features/marketplace/SessionBuilderScreen.tsx --ext .ts,.tsx`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/features/training/sessionBuilder.ts apps/mobile/src/features/training/sessionBuilder.test.ts apps/mobile/src/features/training/NewWorkoutScreen.tsx apps/mobile/src/features/marketplace/SessionBuilderScreen.tsx
git commit -m "Preserve block structure when saving a session to the library"
```

---

### Task 5: Launch / plan / reprogram read real blocks

**Files:**
- Modify: `apps/mobile/src/lib/data/queries.ts`

**Interfaces:**
- Consumes: `repo.getSessionBlocks`, `repo.getWorkoutBlocks`, `repo.getWorkoutSets` (existing), `PlannedInput.blocks` (Task 3).
- Produces: `export function useSessionBlocks(sessionId: string | undefined)` — mirrors `useWorkoutBlocks`.
- `useLaunchSession`, `usePlanUserSession`, `useReprogramWorkout` internals change; their mutation input/output shapes are unchanged.

- [ ] **Step 1: Add `useSessionBlocks`**

Find:

```ts
export function useSessionExercises(sessionId: string | undefined) {
  const repo = useRepository();
  return useQuery({
    queryKey: ['sessionExercises', sessionId],
    enabled: !!sessionId,
    queryFn: () => repo.getSessionExercises(sessionId!),
  });
}
```

Add right after it:

```ts
export function useSessionBlocks(sessionId: string | undefined) {
  const { user } = useAuth();
  const repo = useRepository();
  return useQuery({
    queryKey: ['sessionBlocks', sessionId],
    enabled: !!user && !!sessionId,
    queryFn: () => repo.getSessionBlocks(user!.id, sessionId!),
  });
}
```

- [ ] **Step 2: `useLaunchSession` reads real blocks, falls back to the legacy single-block shape**

Find:

```ts
export function useLaunchSession() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (session: { id: string; name: string }) => {
      const exercises = await repo.getSessionExercises(session.id);
      // A single 'strength' block (not a blockless workout) so the launched
      // session is immediately eligible for the live runner — WorkoutDetailScreen's
      // "Commencer" button, and CircuitRunnerScreen itself, both require at
      // least one workout_blocks row.
      return repo.addCircuitWorkout(user!.id, {
        name: session.name,
        blocks: [
          {
            format: 'strength',
            sets: exercises.map((e, i) => ({
              exerciseId: e.exerciseId,
              order: e.order ?? i,
              reps: e.reps,
              weightKg: e.weightKg,
              durationSec: e.durationSec,
              restSec: e.restSec,
            })),
          },
        ],
      });
    },
```

Replace with:

```ts
export function useLaunchSession() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (session: { id: string; name: string }) => {
      const [blocks, exercises] = await Promise.all([
        repo.getSessionBlocks(user!.id, session.id),
        repo.getSessionExercises(session.id),
      ]);
      // Real blocks when the library saved them (post block-support saves);
      // a legacy flat session (saved before this, block_id always null) falls
      // back to exactly the previous behavior — one synthetic 'strength'
      // block, so it's still eligible for the live runner even without a
      // remembered format.
      const workoutBlocks =
        blocks.length > 0
          ? blocks.map((b) => ({
              format: b.format,
              timeCapSec: b.timeCapSec,
              targetRounds: b.targetRounds,
              sets: exercises
                .filter((e) => e.blockId === b.id)
                .map((e) => ({
                  exerciseId: e.exerciseId,
                  order: e.order,
                  reps: e.reps,
                  weightKg: e.weightKg,
                  durationSec: e.durationSec,
                  restSec: e.restSec,
                })),
            }))
          : [
              {
                format: 'strength' as const,
                sets: exercises.map((e, i) => ({
                  exerciseId: e.exerciseId,
                  order: e.order ?? i,
                  reps: e.reps,
                  weightKg: e.weightKg,
                  durationSec: e.durationSec,
                  restSec: e.restSec,
                })),
              },
            ];
      // A single or multi-block workout (never blockless) so the launched
      // session is immediately eligible for the live runner — WorkoutDetailScreen's
      // "Commencer" button, and CircuitRunnerScreen itself, both require at
      // least one workout_blocks row.
      return repo.addCircuitWorkout(user!.id, { name: session.name, blocks: workoutBlocks });
    },
```

- [ ] **Step 3: `usePlanUserSession` reads real blocks**

Find:

```ts
export function usePlanUserSession() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { sessionId: string; name: string; plannedFor: string; notes?: string }) => {
      const exercises = await repo.getSessionExercises(input.sessionId);
      return repo.addPlannedWorkout(user!.id, {
        name: input.name,
        plannedFor: input.plannedFor,
        notes: input.notes,
        sets: exercises.map((e) => ({
          exerciseId: e.exerciseId,
          order: e.order,
          reps: e.reps,
          weightKg: e.weightKg,
          durationSec: e.durationSec,
          restSec: e.restSec,
        })),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plannedWorkouts', user?.id] });
    },
  });
}
```

Replace with:

```ts
export function usePlanUserSession() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { sessionId: string; name: string; plannedFor: string; notes?: string }) => {
      const [blocks, exercises] = await Promise.all([
        repo.getSessionBlocks(user!.id, input.sessionId),
        repo.getSessionExercises(input.sessionId),
      ]);
      if (blocks.length > 0) {
        return repo.addPlannedWorkout(user!.id, {
          name: input.name,
          plannedFor: input.plannedFor,
          notes: input.notes,
          blocks: blocks.map((b) => ({
            format: b.format,
            timeCapSec: b.timeCapSec,
            targetRounds: b.targetRounds,
            sets: exercises
              .filter((e) => e.blockId === b.id)
              .map((e) => ({
                exerciseId: e.exerciseId,
                order: e.order,
                reps: e.reps,
                weightKg: e.weightKg,
                durationSec: e.durationSec,
                restSec: e.restSec,
              })),
          })),
        });
      }
      return repo.addPlannedWorkout(user!.id, {
        name: input.name,
        plannedFor: input.plannedFor,
        notes: input.notes,
        sets: exercises.map((e) => ({
          exerciseId: e.exerciseId,
          order: e.order,
          reps: e.reps,
          weightKg: e.weightKg,
          durationSec: e.durationSec,
          restSec: e.restSec,
        })),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plannedWorkouts', user?.id] });
    },
  });
}
```

- [ ] **Step 4: `useReprogramWorkout` reads the source workout's real blocks**

Find:

```ts
export function useReprogramWorkout() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { workoutId: string; name: string; notes?: string; plannedFor: string }) => {
      const sets = await repo.getWorkoutSets(user!.id, input.workoutId);
      return repo.addPlannedWorkout(user!.id, {
        name: input.name,
        plannedFor: input.plannedFor,
        notes: input.notes,
        sets: sets.map(({ exerciseId, order, reps, weightKg, restSec, rpe }) => ({
          exerciseId,
          order,
          reps,
          weightKg,
          restSec,
          rpe,
        })),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plannedWorkouts', user?.id] });
      qc.invalidateQueries({ queryKey: ['workouts', user?.id] });
    },
  });
}
```

Replace with:

```ts
export function useReprogramWorkout() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { workoutId: string; name: string; notes?: string; plannedFor: string }) => {
      const [blocks, sets] = await Promise.all([
        repo.getWorkoutBlocks(user!.id, input.workoutId),
        repo.getWorkoutSets(user!.id, input.workoutId),
      ]);
      if (blocks.length > 0) {
        return repo.addPlannedWorkout(user!.id, {
          name: input.name,
          plannedFor: input.plannedFor,
          notes: input.notes,
          blocks: blocks.map((b) => ({
            format: b.format,
            timeCapSec: b.timeCapSec,
            targetRounds: b.targetRounds,
            sets: sets
              .filter((s) => s.blockId === b.id)
              .map(({ exerciseId, order, reps, weightKg, restSec }) => ({
                exerciseId,
                order,
                reps,
                weightKg,
                restSec,
              })),
          })),
        });
      }
      return repo.addPlannedWorkout(user!.id, {
        name: input.name,
        plannedFor: input.plannedFor,
        notes: input.notes,
        sets: sets.map(({ exerciseId, order, reps, weightKg, restSec, rpe }) => ({
          exerciseId,
          order,
          reps,
          weightKg,
          restSec,
          rpe,
        })),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plannedWorkouts', user?.id] });
      qc.invalidateQueries({ queryKey: ['workouts', user?.id] });
    },
  });
}
```

Note: `PlannedInput.blocks`' `sets` entries don't carry `rpe` (see Task 3's `PlannedInput` shape — mirrors `NewCircuitWorkout['blocks'][number]['sets']`, which has no `rpe` field, same as `addCircuitWorkout`'s existing input shape elsewhere in this file) — the blocks branch above correctly omits it while the flat fallback branch keeps it, matching each branch's own type.

- [ ] **Step 5: Typecheck and lint**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json && npx eslint src/lib/data/queries.ts --ext .ts,.tsx`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/lib/data/queries.ts
git commit -m "Launch/plan/reprogram now recreate a session's real block structure"
```

---

### Task 6: Full regression + hand-off notes

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run` (from the repo root)
Expected: every test file passes.

- [ ] **Step 2: Full typecheck across touched packages**

Run:
```bash
cd packages/core && npx tsc --noEmit
cd ../shared && npx tsc --noEmit
cd ../database && npx tsc --noEmit
cd ../../apps/mobile && npx tsc --noEmit -p tsconfig.json
```
Expected: no errors anywhere.

- [ ] **Step 3: Tell the user about the pending migration**

Migration `0028_user_session_blocks.sql` (Task 1) — like 0025-0027 before it — needs to be applied manually against Supabase; this environment has no service-role key to run it directly. Until it's applied, every block-aware write (`insertUserSession`, `copySession`, `copyProgram`, `addPlannedWorkout`'s blocks branch) will fail against the live `user_session_blocks`/`workout_blocks` (already-applied) tables — `insertUserSession` specifically will throw on its very first `user_session_blocks` insert, since that table won't exist yet. Apply 0025 through 0028 together before shipping a build that includes this work.
