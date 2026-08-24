# Community Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in community leaderboard (général + sport/nutrition/sommeil, over 7j/3mois/1an) reusing the app's existing per-user scores, inside the existing Communauté screen.

**Architecture:** A new `daily_scores` table (one row per user per day, one column per score) is written to by the four screens that already compute these scores client-side (Dashboard/Sport/Nutrition/Sommeil), gated on a new `leaderboard_opt_in` flag on `profiles`. A new `security definer` Postgres RPC (`leaderboard(category, days)`) averages `daily_scores` over the requested window across opted-in users only, mirroring the existing `challenge_leaderboard` RPC. The mobile app's data layer (`repository.ts`/`queries.ts`) exposes this through the same demo/Supabase dual-implementation pattern used everywhere else in the app; UI lives in a new "Classement" segment inside `CommunityScreen.tsx`, plus a pseudo/opt-in section in `ProfileEditScreen.tsx`.

**Tech Stack:** React Native (Expo Router), TypeScript, TanStack Query, Supabase (Postgres + RLS + RPC), vitest.

**Spec:** `docs/superpowers/specs/2026-08-24-community-leaderboard-design.md`

## Global Constraints

- Opt-in is a single global toggle (`profiles.leaderboard_opt_in`) — no per-category opt-in.
- Categories: `general` (Score Kaizen) | `sport` | `nutrition` | `sleep`. Periods: `week` (7j) | `quarter` (3 mois) | `year` (1 an), mapped to `7`/`90`/`365` days.
- `daily_scores` is owner-only under RLS; cross-user reads happen only inside the `security definer` `leaderboard()` RPC — never query `daily_scores` directly for anyone but the current user.
- No `Switch`/toggle component exists anywhere in `@supotsu/ui` or the app today (confirmed by repo-wide search) — the opt-in control must use `SegmentedControl` with two options (Oui/Non), matching how `ProfileEditScreen.tsx` already does binary choices (sex, level), not a newly-introduced toggle primitive.
- Follow the existing demo/Supabase dual-repository pattern exactly (`apps/mobile/src/lib/data/repository.ts`): every new `DataRepository` method needs both a `createDemoRepository()` implementation (local storage, single-user stub, mirroring `challengeLeaderboard`'s existing precedent) and a `createSupabaseRepository()` implementation (thin wrapper calling `packages/database`).
- `packages/database/src/generated/database.types.ts` is hand-maintained in this repo (no live Supabase project to run codegen against) — every new table/RPC must be added there by hand, following the file's own header instructions and existing entries (e.g. `workout_blocks`, `challenge_leaderboard`).
- i18n: every new user-facing string needs keys added to all 5 locale files (`apps/mobile/src/i18n/locales/{fr,en,es,pt,de}.json`) — fr is the source language.
- `noUnusedLocals`/`noUnusedParameters` are enabled in `tsconfig.base.json` — every task's typecheck step must pass with zero errors.

---

### Task 1: Migration + hand-written generated types

**Files:**
- Create: `supabase/migrations/0024_daily_scores_leaderboard.sql`
- Modify: `packages/database/src/generated/database.types.ts:613-630`

**Interfaces:**
- Produces: table `public.daily_scores` (columns `user_id uuid`, `date date`, `kaizen smallint`, `sport smallint`, `nutrition smallint`, `sleep smallint`, `updated_at timestamptz`, PK `(user_id, date)`); new `profiles` columns `display_name text`, `leaderboard_opt_in boolean not null default false`; RPC `public.leaderboard(p_category text, p_days int)` returning `(user_id uuid, display_name text, avatar_url text, avg_score numeric, rank bigint)`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0024_daily_scores_leaderboard.sql`:

```sql
-- Community leaderboard: daily score snapshots (opt-in) + a general/category
-- ranking RPC, mirroring challenge_leaderboard's security-definer aggregation
-- pattern. See docs/superpowers/specs/2026-08-24-community-leaderboard-design.md.

create table public.daily_scores (
  user_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  kaizen smallint,
  sport smallint,
  nutrition smallint,
  sleep smallint,
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

create index daily_scores_date_idx on public.daily_scores (date);

alter table public.daily_scores enable row level security;

create policy "daily_scores are self-owned"
  on public.daily_scores for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.profiles
  add column display_name text,
  add column leaderboard_opt_in boolean not null default false;

create or replace function public.leaderboard(p_category text, p_days int)
returns table (user_id uuid, display_name text, avatar_url text, avg_score numeric, rank bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select
      ds.user_id,
      coalesce(p.display_name, 'Athlète') as display_name,
      p.avatar_url,
      avg(
        case p_category
          when 'general' then ds.kaizen
          when 'sport' then ds.sport
          when 'nutrition' then ds.nutrition
          when 'sleep' then ds.sleep
        end
      ) as avg_score,
      rank() over (
        order by avg(
          case p_category
            when 'general' then ds.kaizen
            when 'sport' then ds.sport
            when 'nutrition' then ds.nutrition
            when 'sleep' then ds.sleep
          end
        ) desc
      ) as rank
    from public.daily_scores ds
    join public.profiles p on p.id = ds.user_id and p.leaderboard_opt_in
    where ds.date >= current_date - p_days
    group by ds.user_id, p.display_name, p.avatar_url
    having avg(
      case p_category
        when 'general' then ds.kaizen
        when 'sport' then ds.sport
        when 'nutrition' then ds.nutrition
        when 'sleep' then ds.sleep
      end
    ) is not null
    order by avg_score desc
    limit 100;
end;
$$;

grant execute on function public.leaderboard(text, int) to authenticated;
```

- [ ] **Step 2: Verify the migration against the existing conventions**

There is no automated SQL test harness in this repo (no live Supabase project to apply migrations against). Instead, diff this migration's structure against `supabase/migrations/0023_circuit_workout_formats.sql` (table → index → RLS enable → policy → function → grant, `security definer` + `set search_path = public`, `grant execute ... to authenticated`) and `0004_community_marketplace.sql`'s `challenge_leaderboard` — confirm every clause has a direct precedent. Read the file back once to check for typos (`create table`, not `create tabel`, etc.) and that every `case p_category when ... end` block is worded identically across the 3 places it appears (a mismatch there is a silent bug).

- [ ] **Step 3: Add `daily_scores` and `leaderboard` to the generated types file**

In `packages/database/src/generated/database.types.ts`, insert a new `daily_scores` table entry right before the closing `};` of the `Tables` object (i.e. right after the existing `user_program_sessions` block, before line `615: };` which closes `Tables`). Insert this block right after `user_program_sessions`'s closing `};` (currently line 614):

```ts
      daily_scores: {
        Row: {
          user_id: string;
          date: string;
          kaizen: number | null;
          sport: number | null;
          nutrition: number | null;
          sleep: number | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          date: string;
          kaizen?: number | null;
          sport?: number | null;
          nutrition?: number | null;
          sleep?: number | null;
        };
        Update: Partial<Database['public']['Tables']['daily_scores']['Insert']>;
        Relationships: [];
      };
```

Also add `display_name: string | null;` and `leaderboard_opt_in: boolean;` to the `profiles.Row` type (after `avatar_url: string | null;`, currently line 26), and `display_name?: string | null;` / `leaderboard_opt_in?: boolean;` to `profiles.Insert` (after `avatar_url?: string | null;`, currently line 38).

Finally, add a `leaderboard` entry to the `Functions` object (currently lines 617-630), as a new sibling after `challenge_leaderboard`:

```ts
      leaderboard: {
        Args: { p_category: string; p_days: number };
        Returns: { user_id: string; display_name: string | null; avatar_url: string | null; avg_score: number; rank: number }[];
      };
```

- [ ] **Step 4: Typecheck the database package**

Run: `cd packages/database && npm run typecheck`
Expected: clean (no output beyond the `tsc --noEmit` command line), confirming the hand-written types are syntactically valid TypeScript.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0024_daily_scores_leaderboard.sql packages/database/src/generated/database.types.ts
git commit -m "Add daily_scores table, leaderboard() RPC, profiles pseudo/opt-in columns"
```

---

### Task 2: Core domain type

**Files:**
- Modify: `packages/core/src/community.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `GeneralLeaderboardEntry` type, exported from `@supotsu/core` (via the existing `export * from './community'` in `packages/core/src/index.ts:10`), used by Task 4 (database repo), Task 5 (app repository interface), and Task 9 (UI).

- [ ] **Step 1: Add the type**

In `packages/core/src/community.ts`, append after the existing `LeaderboardStanding` interface:

```ts

/**
 * One row of the general/category leaderboard (opt-in, averaged over a
 * time window) — distinct from LeaderboardStanding, which is challenge-scoped.
 */
export interface GeneralLeaderboardEntry {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  avgScore: number;
  rank: number;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd packages/core && npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/community.ts
git commit -m "Add GeneralLeaderboardEntry type for the community leaderboard"
```

---

### Task 3: Pure leaderboard helpers (TDD)

**Files:**
- Create: `apps/mobile/src/features/community/leaderboardHelpers.ts`
- Test: `apps/mobile/src/features/community/leaderboardHelpers.test.ts`

**Interfaces:**
- Produces: `LeaderboardCategory` (`'general' | 'sport' | 'nutrition' | 'sleep'`), `LeaderboardPeriod` (`'week' | 'quarter' | 'year'`), `DailyScoreColumn` (`'kaizen' | 'sport' | 'nutrition' | 'sleep'`), `periodToDays(period: LeaderboardPeriod): number`, `categoryToColumn(category: LeaderboardCategory): DailyScoreColumn`, `defaultDisplayName(userId: string): string` — consumed by Task 5 (repository), Task 7 (write-path screens), Task 9 (UI), Task 10 (settings).

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/features/community/leaderboardHelpers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { categoryToColumn, defaultDisplayName, periodToDays } from './leaderboardHelpers';

describe('periodToDays', () => {
  it('maps week to 7 days', () => {
    expect(periodToDays('week')).toBe(7);
  });
  it('maps quarter to 90 days', () => {
    expect(periodToDays('quarter')).toBe(90);
  });
  it('maps year to 365 days', () => {
    expect(periodToDays('year')).toBe(365);
  });
});

describe('categoryToColumn', () => {
  it('maps general to the kaizen column', () => {
    expect(categoryToColumn('general')).toBe('kaizen');
  });
  it('maps sport/nutrition/sleep to their own-named column', () => {
    expect(categoryToColumn('sport')).toBe('sport');
    expect(categoryToColumn('nutrition')).toBe('nutrition');
    expect(categoryToColumn('sleep')).toBe('sleep');
  });
});

describe('defaultDisplayName', () => {
  it('builds a stable "Athlète XXXX" label from the last 4 chars of the user id', () => {
    expect(defaultDisplayName('11111111-2222-3333-4444-abcdef012345')).toBe('Athlète 2345');
  });
  it('is deterministic for the same id', () => {
    const id = '00000000-0000-0000-0000-00000000beef';
    expect(defaultDisplayName(id)).toBe(defaultDisplayName(id));
  });
  it('uppercases the suffix', () => {
    expect(defaultDisplayName('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeabcd')).toBe('Athlète ABCD');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/mobile && npx vitest run src/features/community/leaderboardHelpers.test.ts`
Expected: FAIL — `Cannot find module './leaderboardHelpers'`.

- [ ] **Step 3: Write the implementation**

Create `apps/mobile/src/features/community/leaderboardHelpers.ts`:

```ts
export type LeaderboardCategory = 'general' | 'sport' | 'nutrition' | 'sleep';
export type LeaderboardPeriod = 'week' | 'quarter' | 'year';
export type DailyScoreColumn = 'kaizen' | 'sport' | 'nutrition' | 'sleep';

const PERIOD_DAYS: Record<LeaderboardPeriod, number> = { week: 7, quarter: 90, year: 365 };

/** Rolling-average window, in days, for a leaderboard period selector. */
export function periodToDays(period: LeaderboardPeriod): number {
  return PERIOD_DAYS[period];
}

const CATEGORY_COLUMN: Record<LeaderboardCategory, DailyScoreColumn> = {
  general: 'kaizen',
  sport: 'sport',
  nutrition: 'nutrition',
  sleep: 'sleep',
};

/** Which daily_scores column backs a given leaderboard category. */
export function categoryToColumn(category: LeaderboardCategory): DailyScoreColumn {
  return CATEGORY_COLUMN[category];
}

/** "Athlète 4821" fallback shown when a user opts into the leaderboard without setting a pseudo. */
export function defaultDisplayName(userId: string): string {
  const suffix = userId.replace(/-/g, '').slice(-4).toUpperCase();
  return `Athlète ${suffix}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/mobile && npx vitest run src/features/community/leaderboardHelpers.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/community/leaderboardHelpers.ts apps/mobile/src/features/community/leaderboardHelpers.test.ts
git commit -m "Add pure leaderboard helpers (period/category mapping, default pseudo)"
```

---

### Task 4: Database package repositories

**Files:**
- Modify: `packages/database/src/repositories/profiles.ts`
- Create: `packages/database/src/repositories/leaderboard.ts`
- Modify: `packages/database/src/index.ts:11`

**Interfaces:**
- Consumes: `Database['public']['Tables']['daily_scores']` and `Functions.leaderboard` from Task 1.
- Produces: `updateLeaderboardPrefs(client, userId, patch: { display_name?: string; leaderboard_opt_in?: boolean }): Promise<ProfileRow>`; `upsertDailyScore(client, userId, column, value): Promise<void>`; `fetchGeneralLeaderboard(client, category, days): Promise<GeneralLeaderboardRow[]>` where `GeneralLeaderboardRow = { user_id: string; display_name: string | null; avatar_url: string | null; avg_score: number; rank: number }` — consumed by Task 5.

- [ ] **Step 1: Add `updateLeaderboardPrefs` to `profiles.ts`**

In `packages/database/src/repositories/profiles.ts`, append after `updateProfileAvatar` (after its closing `}` at line 51):

```ts

/** Set the pseudo and/or leaderboard opt-in flag — either field is optional so a caller can update just one. */
export async function updateLeaderboardPrefs(
  client: SupotsuClient,
  userId: string,
  patch: { display_name?: string; leaderboard_opt_in?: boolean },
): Promise<ProfileRow> {
  const { data, error } = await client
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}
```

- [ ] **Step 2: Create `leaderboard.ts`**

Create `packages/database/src/repositories/leaderboard.ts`:

```ts
import type { SupotsuClient } from '../client';
import type { Database } from '../generated/database.types';

export type DailyScoreColumn = 'kaizen' | 'sport' | 'nutrition' | 'sleep';
export type DailyScoreRow = Database['public']['Tables']['daily_scores']['Row'];

/** Upsert today's score for one category — idempotent, safe to call every time the value is (re)computed. */
export async function upsertDailyScore(
  client: SupotsuClient,
  userId: string,
  column: DailyScoreColumn,
  value: number,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await client
    .from('daily_scores')
    .upsert({ user_id: userId, date: today, [column]: value }, { onConflict: 'user_id,date' });
  if (error) throw error;
}

export interface GeneralLeaderboardRow {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  avg_score: number;
  rank: number;
}

/** Ranked, averaged standings for one category over the last `days` days — opted-in users only (RLS + the RPC's own filter). */
export async function fetchGeneralLeaderboard(
  client: SupotsuClient,
  category: 'general' | 'sport' | 'nutrition' | 'sleep',
  days: number,
): Promise<GeneralLeaderboardRow[]> {
  const { data, error } = await client.rpc('leaderboard', { p_category: category, p_days: days });
  if (error) throw error;
  return data ?? [];
}
```

- [ ] **Step 3: Export the new module from the package barrel**

In `packages/database/src/index.ts`, add a new line after `export * from './repositories/community';` (line 11):

```ts
export * from './repositories/leaderboard';
```

- [ ] **Step 4: Typecheck**

Run: `cd packages/database && npm run typecheck`
Expected: clean.

- [ ] **Step 5: Lint**

Run: `cd packages/database && npx eslint src/repositories/profiles.ts src/repositories/leaderboard.ts src/index.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/database/src/repositories/profiles.ts packages/database/src/repositories/leaderboard.ts packages/database/src/index.ts
git commit -m "Add updateLeaderboardPrefs, upsertDailyScore, fetchGeneralLeaderboard DB functions"
```

---

### Task 5: App repository layer (`repository.ts`)

**Files:**
- Modify: `apps/mobile/src/lib/data/repository.ts`

**Interfaces:**
- Consumes: `updateLeaderboardPrefs`, `upsertDailyScore`, `fetchGeneralLeaderboard` from Task 4; `GeneralLeaderboardEntry` from Task 2; `categoryToColumn`, `defaultDisplayName` from Task 3.
- Produces, on `DataRepository`: `getLeaderboardPrefs(userId: string): Promise<{ displayName: string | null; leaderboardOptIn: boolean }>`; `updateLeaderboardPrefs(userId: string, patch: { displayName?: string; leaderboardOptIn?: boolean }): Promise<void>`; `recordDailyScore(userId: string, column: DailyScoreColumn, value: number): Promise<void>`; `getLeaderboard(userId: string, category: LeaderboardCategory, days: number): Promise<GeneralLeaderboardEntry[]>` — consumed by Task 6.

- [ ] **Step 1: Add imports**

In `apps/mobile/src/lib/data/repository.ts`, add to the `@supotsu/database` import block (after `updateProfileAvatar` — search for its import, it's part of the same destructured import as `getAthleteProfile as getAthleteProfileDb` per the file's existing conventions; add alongside it):

```ts
  getProfile as getProfileDb,
  updateLeaderboardPrefs as updateLeaderboardPrefsDb,
  upsertDailyScore as upsertDailyScoreDb,
  fetchGeneralLeaderboard as fetchGeneralLeaderboardDb,
```

Add to the `@supotsu/core` type import block:

```ts
  type GeneralLeaderboardEntry,
```

Add a new import line near the top-level feature imports:

```ts
import { categoryToColumn, defaultDisplayName, type DailyScoreColumn, type LeaderboardCategory } from '@/features/community/leaderboardHelpers';
```

- [ ] **Step 2: Add the four methods to the `DataRepository` interface**

Insert after the `editCircuitWorkout` interface line (added by the earlier multi-block-edit work — search for it, or insert right after `challengeLeaderboard(challenge: Challenge): Promise<{ userId: string; progress: number }[]>;`):

```ts
  /** The current user's leaderboard pseudo + opt-in flag. */
  getLeaderboardPrefs(userId: string): Promise<{ displayName: string | null; leaderboardOptIn: boolean }>;
  /** Update the pseudo and/or opt-in flag — either field optional. */
  updateLeaderboardPrefs(userId: string, patch: { displayName?: string; leaderboardOptIn?: boolean }): Promise<void>;
  /** Upsert today's value for one score column — no-op call site should gate this on opt-in first. */
  recordDailyScore(userId: string, column: DailyScoreColumn, value: number): Promise<void>;
  /** Ranked, averaged standings for one category over the last `days` days. */
  getLeaderboard(userId: string, category: LeaderboardCategory, days: number): Promise<GeneralLeaderboardEntry[]>;
```

- [ ] **Step 3: Add demo-mode storage keys**

In the `// --- demo (local) implementation ---` section, add after `const chJoinKey = (u: string): string => \`supotsu.challengejoins.${u}\`;` (line 864):

```ts
const lbPrefsKey = (u: string): string => `supotsu.leaderboardprefs.${u}`;
const dailyScoreKey = (u: string): string => `supotsu.dailyscores.${u}`;
```

- [ ] **Step 4: Add demo-mode implementations**

Inside `createDemoRepository()`'s returned object, add after the `challengeLeaderboard` method (after its closing `},` — the one reading `progressInWindow(challenge, activities)`):

```ts
    async getLeaderboardPrefs(userId) {
      const raw = await secureStorage.getItem(lbPrefsKey(userId));
      return raw
        ? (JSON.parse(raw) as { displayName: string | null; leaderboardOptIn: boolean })
        : { displayName: null, leaderboardOptIn: false };
    },
    async updateLeaderboardPrefs(userId, patch) {
      const raw = await secureStorage.getItem(lbPrefsKey(userId));
      const current = raw
        ? (JSON.parse(raw) as { displayName: string | null; leaderboardOptIn: boolean })
        : { displayName: null, leaderboardOptIn: false };
      const next = {
        displayName: patch.displayName !== undefined ? patch.displayName : current.displayName,
        leaderboardOptIn: patch.leaderboardOptIn !== undefined ? patch.leaderboardOptIn : current.leaderboardOptIn,
      };
      await secureStorage.setItem(lbPrefsKey(userId), JSON.stringify(next));
    },
    async recordDailyScore(userId, column, value) {
      const today = new Date().toISOString().slice(0, 10);
      const rows = await readJson<{ date: string; kaizen?: number; sport?: number; nutrition?: number; sleep?: number }>(dailyScoreKey(userId));
      const idx = rows.findIndex((r) => r.date === today);
      if (idx >= 0) rows[idx] = { ...rows[idx], [column]: value };
      else rows.push({ date: today, [column]: value });
      await writeJson(dailyScoreKey(userId), rows);
    },
    async getLeaderboard(userId, category, days) {
      const raw = await secureStorage.getItem(lbPrefsKey(userId));
      const prefs = raw
        ? (JSON.parse(raw) as { displayName: string | null; leaderboardOptIn: boolean })
        : { displayName: null, leaderboardOptIn: false };
      if (!prefs.leaderboardOptIn) return [];
      const rows = await readJson<{ date: string; kaizen?: number; sport?: number; nutrition?: number; sleep?: number }>(dailyScoreKey(userId));
      const column = categoryToColumn(category);
      const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
      const inWindow = rows.filter((r) => r.date >= cutoff && r[column] != null);
      if (inWindow.length === 0) return [];
      const avg = inWindow.reduce((sum, r) => sum + (r[column] as number), 0) / inWindow.length;
      return [
        {
          userId,
          displayName: prefs.displayName ?? defaultDisplayName(userId),
          avatarUrl: undefined,
          avgScore: Math.round(avg),
          rank: 1,
        },
      ];
    },
```

- [ ] **Step 5: Add Supabase-mode implementations**

Inside `createSupabaseRepository()`'s returned object, add after its `challengeLeaderboard` method:

```ts
    async getLeaderboardPrefs(userId) {
      const row = await getProfileDb(client, userId);
      return { displayName: row?.display_name ?? null, leaderboardOptIn: row?.leaderboard_opt_in ?? false };
    },
    async updateLeaderboardPrefs(userId, patch) {
      await updateLeaderboardPrefsDb(client, userId, {
        display_name: patch.displayName,
        leaderboard_opt_in: patch.leaderboardOptIn,
      });
    },
    async recordDailyScore(userId, column, value) {
      await upsertDailyScoreDb(client, userId, column, value);
    },
    async getLeaderboard(_userId, category, days) {
      const rows = await fetchGeneralLeaderboardDb(client, category, days);
      return rows.map((r) => ({
        userId: r.user_id,
        displayName: r.display_name ?? 'Athlète',
        avatarUrl: r.avatar_url ?? undefined,
        avgScore: Math.round(r.avg_score),
        rank: r.rank,
      }));
    },
```

- [ ] **Step 6: Typecheck**

Run: `cd apps/mobile && npm run typecheck`
Expected: clean. If it fails on `updateLeaderboardPrefsDb`'s `patch` argument (since `patch.display_name`/`patch.leaderboard_opt_in` may be `undefined`, not omitted), confirm `updateLeaderboardPrefs`'s DB-layer signature in `profiles.ts` accepts `display_name?: string` (optional, so `undefined` is a valid value at the call site) — it does, from Task 4.

- [ ] **Step 7: Lint**

Run: `cd apps/mobile && npx eslint src/lib/data/repository.ts`
Expected: no errors (pre-existing unrelated warnings in this file, if any, are out of scope).

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/lib/data/repository.ts
git commit -m "Wire leaderboard prefs/score recording/reading into DataRepository"
```

---

### Task 6: React Query hooks

**Files:**
- Modify: `apps/mobile/src/lib/data/queries.ts`

**Interfaces:**
- Consumes: the 4 `DataRepository` methods from Task 5; `LeaderboardCategory`, `LeaderboardPeriod`, `DailyScoreColumn`, `periodToDays` from Task 3.
- Produces: `useLeaderboardPrefs()`, `useUpdateLeaderboardPrefs()`, `useRecordDailyScore()`, `useLeaderboard(category: LeaderboardCategory, period: LeaderboardPeriod)` — consumed by Task 7 (write-path), Task 9 (UI), Task 10 (settings).

- [ ] **Step 1: Add the import**

In `apps/mobile/src/lib/data/queries.ts`, add:

```ts
import { periodToDays, type DailyScoreColumn, type LeaderboardCategory, type LeaderboardPeriod } from '@/features/community/leaderboardHelpers';
```

- [ ] **Step 2: Add the hooks**

Append after the existing `useChallengeLeaderboard` hook (after its closing `}` at line 289):

```ts

export function useLeaderboardPrefs() {
  const { user } = useAuth();
  const repo = useRepository();
  return useQuery({
    queryKey: ['leaderboardPrefs', user?.id],
    enabled: !!user,
    queryFn: () => repo.getLeaderboardPrefs(user!.id),
  });
}

export function useUpdateLeaderboardPrefs() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: { displayName?: string; leaderboardOptIn?: boolean }) => repo.updateLeaderboardPrefs(user!.id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leaderboardPrefs', user?.id] });
    },
  });
}

/** Upsert today's value for one score column — call from a screen once the value is known, gated on leaderboard opt-in. */
export function useRecordDailyScore() {
  const { user } = useAuth();
  const repo = useRepository();
  return useMutation({
    mutationFn: (input: { column: DailyScoreColumn; value: number }) => repo.recordDailyScore(user!.id, input.column, input.value),
  });
}

export function useLeaderboard(category: LeaderboardCategory, period: LeaderboardPeriod) {
  const { user } = useAuth();
  const repo = useRepository();
  return useQuery({
    queryKey: ['generalLeaderboard', category, period],
    enabled: !!user,
    queryFn: () => repo.getLeaderboard(user!.id, category, periodToDays(period)),
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/mobile && npm run typecheck`
Expected: clean.

- [ ] **Step 4: Lint**

Run: `cd apps/mobile && npx eslint src/lib/data/queries.ts`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/lib/data/queries.ts
git commit -m "Add useLeaderboardPrefs/useUpdateLeaderboardPrefs/useRecordDailyScore/useLeaderboard hooks"
```

---

### Task 7: Write-path — record scores from the 4 screens

**Files:**
- Modify: `apps/mobile/src/features/dashboard/DashboardScreen.tsx`
- Modify: `apps/mobile/src/features/sport/SportScreen.tsx`
- Modify: `apps/mobile/src/features/nutrition/NutritionScreen.tsx`
- Modify: `apps/mobile/src/features/sommeil/SommeilScreen.tsx`

**Interfaces:**
- Consumes: `useLeaderboardPrefs`, `useRecordDailyScore` from Task 6.
- Produces: nothing new consumed by later tasks — this is a leaf task.

- [ ] **Step 1: Dashboard — record the `kaizen` column**

`DashboardScreen.tsx`'s `asOf` is always "now" (no day navigation, `apps/mobile/src/features/dashboard/DashboardScreen.tsx:180`), so no today-guard is needed here. Add the import:

```ts
import { useLeaderboardPrefs, useRecordDailyScore } from '@/lib/data/queries';
```

(merge into the existing `@/lib/data/queries` import list on line 23 rather than adding a second import line).

Inside the `DashboardScreen` function, after the `snapshot` `useMemo` (the one calling `buildDailySnapshot`, around line 223-230), add:

```tsx
  const { data: leaderboardPrefs } = useLeaderboardPrefs();
  const recordDailyScore = useRecordDailyScore();
  useEffect(() => {
    if (!leaderboardPrefs?.leaderboardOptIn) return;
    const value = snapshot.value.overall;
    if (!Number.isFinite(value)) return;
    recordDailyScore.mutate({ column: 'kaizen', value: Math.round(value) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderboardPrefs?.leaderboardOptIn, snapshot.value.overall]);
```

(`useEffect` is already imported on line 1 of this file.)

- [ ] **Step 2: Sport — record the `sport` column, guarded to today only**

`SportScreen.tsx` has a `DayNav` (`selectedDate`/`asOf`, line 107-108) and already computes `todayKey`/`selectedDayKey` (lines 115-116) — only record when the user is viewing today, not browsing a past day.

Add `useEffect` to the React import (line 1 currently reads `import React, { useMemo, useState } from 'react';` — change to `import React, { useEffect, useMemo, useState } from 'react';`). Add to the `@/lib/data/queries` import list (line 11-17): `useLeaderboardPrefs, useRecordDailyScore`.

After the `sport` `useMemo` (lines 130-133), add:

```tsx
  const { data: leaderboardPrefs } = useLeaderboardPrefs();
  const recordDailyScore = useRecordDailyScore();
  useEffect(() => {
    if (!leaderboardPrefs?.leaderboardOptIn) return;
    if (selectedDayKey !== todayKey) return;
    if (sport == null) return;
    recordDailyScore.mutate({ column: 'sport', value: Math.round(sport.value) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderboardPrefs?.leaderboardOptIn, selectedDayKey, todayKey, sport?.value]);
```

(This must come after line 116 where `todayKey`/`selectedDayKey` are defined — place it right after that, before the JSX `return`.)

- [ ] **Step 3: Nutrition — record the `nutrition` column, guarded to today only**

`NutritionScreen.tsx` also has `selectedDate`/`asOf` (line 136-137) via `useSelectedDay()`, no `todayKey`/`selectedDayKey` variables defined yet — add them.

Change the React import (line 1) to `import React, { useEffect, useMemo, useState } from 'react';`. Add to the `@/lib/data/queries` import list (line 18): `useLeaderboardPrefs, useRecordDailyScore`.

After the `score` `useMemo` (line 181), add:

```tsx
  const { data: leaderboardPrefs } = useLeaderboardPrefs();
  const recordDailyScore = useRecordDailyScore();
  const todayKey = new Date().toISOString().slice(0, 10);
  const selectedDayKey = asOf.slice(0, 10);
  useEffect(() => {
    if (!leaderboardPrefs?.leaderboardOptIn) return;
    if (selectedDayKey !== todayKey) return;
    recordDailyScore.mutate({ column: 'nutrition', value: Math.round(score.value) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderboardPrefs?.leaderboardOptIn, selectedDayKey, todayKey, score.value]);
```

- [ ] **Step 4: Sommeil — record the `sleep` column, guarded to today only**

`SommeilScreen.tsx` has `selectedDate`/`asOf` (line 224-225) via `useSelectedDay()`. Add `useEffect` to the React import (currently `import React, { useMemo, useState } from 'react';` at line 1 — change to `import React, { useEffect, useMemo, useState } from 'react';`). Add to the `@/lib/data/queries` import list: `useLeaderboardPrefs, useRecordDailyScore`.

After the `score` `useMemo` (line 234-237), add:

```tsx
  const { data: leaderboardPrefs } = useLeaderboardPrefs();
  const recordDailyScore = useRecordDailyScore();
  const todayKey = new Date().toISOString().slice(0, 10);
  const selectedDayKey = asOf.slice(0, 10);
  useEffect(() => {
    if (!leaderboardPrefs?.leaderboardOptIn) return;
    if (selectedDayKey !== todayKey) return;
    recordDailyScore.mutate({ column: 'sleep', value: Math.round(score.value) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderboardPrefs?.leaderboardOptIn, selectedDayKey, todayKey, score.value]);
```

- [ ] **Step 5: Typecheck all four**

Run: `cd apps/mobile && npm run typecheck`
Expected: clean.

- [ ] **Step 6: Lint all four**

Run: `cd apps/mobile && npx eslint src/features/dashboard/DashboardScreen.tsx src/features/sport/SportScreen.tsx src/features/nutrition/NutritionScreen.tsx src/features/sommeil/SommeilScreen.tsx`
Expected: no errors (the `eslint-disable-next-line react-hooks/exhaustive-deps` comments are deliberate — these effects intentionally track only the score value + opt-in + day-match, not every value the memo itself depends on, to avoid re-firing the upsert on every unrelated re-render).

- [ ] **Step 7: Manual smoke check**

Run: `cd apps/mobile && npx expo start` (or however this app is normally launched locally — see the project's `run` skill if unsure), open the Dashboard, Sport, Nutrition, and Sommeil tabs once each with a test account that has `leaderboard_opt_in = true` set directly in the database, and confirm (via Supabase table editor or local demo-mode storage inspection) that `daily_scores` gains a row for today with the expected column populated after each screen is viewed.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/features/dashboard/DashboardScreen.tsx apps/mobile/src/features/sport/SportScreen.tsx apps/mobile/src/features/nutrition/NutritionScreen.tsx apps/mobile/src/features/sommeil/SommeilScreen.tsx
git commit -m "Record today's score into daily_scores from Dashboard/Sport/Nutrition/Sommeil"
```

---

### Task 8: i18n keys

**Files:**
- Modify: `apps/mobile/src/i18n/locales/fr.json`
- Modify: `apps/mobile/src/i18n/locales/en.json`
- Modify: `apps/mobile/src/i18n/locales/es.json`
- Modify: `apps/mobile/src/i18n/locales/pt.json`
- Modify: `apps/mobile/src/i18n/locales/de.json`

**Interfaces:**
- Produces: `community.screen.tabs.challenges`, `community.screen.tabs.leaderboard`, `community.leaderboard.category.{general,sport,nutrition,sleep}`, `community.leaderboard.period.{week,quarter,year}`, `community.leaderboard.emptyState.{title,message}`, `community.leaderboard.optIn.{title,message,button}`, `community.leaderboard.notRanked`, `community.leaderboard.you`, `settings.profileEdit.pseudo.{label,placeholder}`, `settings.profileEdit.leaderboardOptIn.{label,yes,no}` — consumed by Task 9 and Task 10.

- [ ] **Step 1: Add the keys to all 5 locale files**

Run this Python script from the repo root (it edits all 5 files in one pass, matching the pattern already used earlier in this session for i18n additions):

```bash
cd apps/mobile/src/i18n/locales && python3 << 'EOF'
import json, collections

community_additions = {
  "fr": {
    "tabs": {"challenges": "Défis", "leaderboard": "Classement"},
  },
  "en": {
    "tabs": {"challenges": "Challenges", "leaderboard": "Leaderboard"},
  },
  "es": {
    "tabs": {"challenges": "Desafíos", "leaderboard": "Clasificación"},
  },
  "pt": {
    "tabs": {"challenges": "Desafios", "leaderboard": "Classificação"},
  },
  "de": {
    "tabs": {"challenges": "Challenges", "leaderboard": "Rangliste"},
  },
}

leaderboard_ns = {
  "fr": {
    "category": {"general": "Général", "sport": "Sport", "nutrition": "Nutrition", "sleep": "Sommeil"},
    "period": {"week": "7 jours", "quarter": "3 mois", "year": "1 an"},
    "emptyState": {"title": "Personne pour l'instant", "message": "Sois le·la premier·ère à apparaître ici sur cette période."},
    "optIn": {"title": "Rejoins le classement", "message": "Compare tes scores avec les autres utilisateurs opt-in.", "button": "Participer au classement"},
    "notRanked": "Tu n'es pas classé·e sur cette période.",
    "you": "Toi",
  },
  "en": {
    "category": {"general": "General", "sport": "Sport", "nutrition": "Nutrition", "sleep": "Sleep"},
    "period": {"week": "7 days", "quarter": "3 months", "year": "1 year"},
    "emptyState": {"title": "No one yet", "message": "Be the first to show up here for this period."},
    "optIn": {"title": "Join the leaderboard", "message": "Compare your scores with other opted-in users.", "button": "Join the leaderboard"},
    "notRanked": "You're not ranked for this period.",
    "you": "You",
  },
  "es": {
    "category": {"general": "General", "sport": "Deporte", "nutrition": "Nutrición", "sleep": "Sueño"},
    "period": {"week": "7 días", "quarter": "3 meses", "year": "1 año"},
    "emptyState": {"title": "Nadie todavía", "message": "Sé el primero en aparecer aquí en este período."},
    "optIn": {"title": "Únete a la clasificación", "message": "Compara tus puntuaciones con otros usuarios que participan.", "button": "Participar en la clasificación"},
    "notRanked": "No estás clasificado en este período.",
    "you": "Tú",
  },
  "pt": {
    "category": {"general": "Geral", "sport": "Desporto", "nutrition": "Nutrição", "sleep": "Sono"},
    "period": {"week": "7 dias", "quarter": "3 meses", "year": "1 ano"},
    "emptyState": {"title": "Ainda ninguém", "message": "Sê o primeiro a aparecer aqui neste período."},
    "optIn": {"title": "Junta-te à classificação", "message": "Compara as tuas pontuações com outros utilizadores participantes.", "button": "Participar na classificação"},
    "notRanked": "Não estás classificado neste período.",
    "you": "Tu",
  },
  "de": {
    "category": {"general": "Allgemein", "sport": "Sport", "nutrition": "Ernährung", "sleep": "Schlaf"},
    "period": {"week": "7 Tage", "quarter": "3 Monate", "year": "1 Jahr"},
    "emptyState": {"title": "Noch niemand", "message": "Sei die erste Person, die hier für diesen Zeitraum erscheint."},
    "optIn": {"title": "Rangliste beitreten", "message": "Vergleiche deine Werte mit anderen teilnehmenden Nutzern.", "button": "An der Rangliste teilnehmen"},
    "notRanked": "Du bist für diesen Zeitraum nicht platziert.",
    "you": "Du",
  },
}

profile_additions = {
  "fr": {"pseudo": {"label": "Pseudo", "placeholder": "Ex : SportifDuDimanche"}, "leaderboardOptIn": {"label": "Participer au classement", "yes": "Oui", "no": "Non"}},
  "en": {"pseudo": {"label": "Pseudo", "placeholder": "e.g. WeekendAthlete"}, "leaderboardOptIn": {"label": "Join the leaderboard", "yes": "Yes", "no": "No"}},
  "es": {"pseudo": {"label": "Apodo", "placeholder": "Ej.: AtletaDeFinde"}, "leaderboardOptIn": {"label": "Participar en la clasificación", "yes": "Sí", "no": "No"}},
  "pt": {"pseudo": {"label": "Pseudónimo", "placeholder": "Ex.: AtletaDeFimDeSemana"}, "leaderboardOptIn": {"label": "Participar na classificação", "yes": "Sim", "no": "Não"}},
  "de": {"pseudo": {"label": "Pseudonym", "placeholder": "z. B. WochenendAthlet"}, "leaderboardOptIn": {"label": "An der Rangliste teilnehmen", "yes": "Ja", "no": "Nein"}},
}

for locale in ["fr", "en", "es", "pt", "de"]:
    path = f"{locale}.json"
    with open(path, encoding="utf-8") as f:
        data = json.load(f, object_pairs_hook=collections.OrderedDict)
    data["community"]["screen"]["tabs"] = community_additions[locale]["tabs"]
    data["community"]["leaderboard"] = leaderboard_ns[locale]
    data["settings"]["profileEdit"]["pseudo"] = profile_additions[locale]["pseudo"]
    data["settings"]["profileEdit"]["leaderboardOptIn"] = profile_additions[locale]["leaderboardOptIn"]
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(locale, "ok")
EOF
```

If this fails with a `KeyError` because `data["community"]["screen"]` doesn't exist at that exact path, first run `python3 -c "import json; d=json.load(open('fr.json')); print(list(d['community'].keys())); print(list(d['community']['screen'].keys()))"` to confirm the real path and adjust the script's assignment lines accordingly (the namespace exists — `community.screen.title` is used by `CommunityScreen.tsx` today — only the exact nesting needs confirming before running the write).

- [ ] **Step 2: Verify the diff is minimal**

Run: `git diff --stat apps/mobile/src/i18n/locales/`
Expected: only the 5 locale files changed, a small number of insertions each (no reformatting of unrelated content — if the diff is large, the script used a different key order/indent than the file's existing style; re-run investigating why, following the pattern established earlier this session for i18n additions).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/i18n/locales/*.json
git commit -m "Add i18n keys for the leaderboard tab and profile pseudo/opt-in"
```

---

### Task 9: Leaderboard UI in `CommunityScreen.tsx`

**Files:**
- Create: `apps/mobile/src/features/community/LeaderboardTab.tsx`
- Modify: `apps/mobile/src/features/community/CommunityScreen.tsx`

**Interfaces:**
- Consumes: `useLeaderboard`, `useLeaderboardPrefs`, `useUpdateLeaderboardPrefs` from Task 6; `LeaderboardCategory`, `LeaderboardPeriod` from Task 3; `useAuth` from `@/features/auth/AuthProvider` (already used elsewhere in the app, e.g. `apps/mobile/src/lib/data/queries.ts`) to know the current user's id for highlighting "you" in the list.
- Produces: `LeaderboardTab` component — a leaf, nothing else depends on it.

- [ ] **Step 1: Create `LeaderboardTab.tsx`**

```tsx
import React, { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Card, EmptyState, Icon, SegmentedControl, Text, useTheme } from '@supotsu/ui';
import { spacing, radii } from '@supotsu/design-system';
import { useAuth } from '@/features/auth/AuthProvider';
import { useLeaderboard, useLeaderboardPrefs, useUpdateLeaderboardPrefs } from '@/lib/data/queries';
import type { LeaderboardCategory, LeaderboardPeriod } from './leaderboardHelpers';

export function LeaderboardTab(): React.JSX.Element {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { data: prefs } = useLeaderboardPrefs();
  const updatePrefs = useUpdateLeaderboardPrefs();
  const [category, setCategory] = useState<LeaderboardCategory>('general');
  const [period, setPeriod] = useState<LeaderboardPeriod>('week');
  const { data: entries = [], isLoading } = useLeaderboard(category, period);

  const CATEGORY_OPTIONS: { value: LeaderboardCategory; label: string }[] = [
    { value: 'general', label: t('community.leaderboard.category.general') },
    { value: 'sport', label: t('community.leaderboard.category.sport') },
    { value: 'nutrition', label: t('community.leaderboard.category.nutrition') },
    { value: 'sleep', label: t('community.leaderboard.category.sleep') },
  ];
  const PERIOD_OPTIONS: { value: LeaderboardPeriod; label: string }[] = [
    { value: 'week', label: t('community.leaderboard.period.week') },
    { value: 'quarter', label: t('community.leaderboard.period.quarter') },
    { value: 'year', label: t('community.leaderboard.period.year') },
  ];

  const optedIn = prefs?.leaderboardOptIn ?? false;
  const meRanked = entries.some((e) => e.userId === user?.id);

  return (
    <View style={{ gap: spacing[3] }}>
      {!optedIn ? (
        <Card>
          <Text variant="heading">{t('community.leaderboard.optIn.title')}</Text>
          <Text variant="body" color="textMuted" style={{ marginTop: spacing[1] }}>
            {t('community.leaderboard.optIn.message')}
          </Text>
          <View style={{ marginTop: spacing[2] }}>
            <SegmentedControl
              options={[
                { value: 'no' as const, label: t('settings.profileEdit.leaderboardOptIn.no') },
                { value: 'yes' as const, label: t('settings.profileEdit.leaderboardOptIn.yes') },
              ]}
              value="no"
              onChange={(v) => updatePrefs.mutate({ leaderboardOptIn: v === 'yes' })}
            />
          </View>
        </Card>
      ) : null}

      <SegmentedControl options={CATEGORY_OPTIONS} value={category} onChange={setCategory} />
      <SegmentedControl options={PERIOD_OPTIONS} value={period} onChange={setPeriod} />

      {isLoading ? (
        <Text variant="body" color="textMuted">
          {t('common.loading')}
        </Text>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<Icon name="fire" size={44} color={colors.textSubtle} />}
          title={t('community.leaderboard.emptyState.title')}
          message={t('community.leaderboard.emptyState.message')}
        />
      ) : (
        <View style={{ gap: spacing[2] }}>
          {entries.map((e) => {
            const isMe = e.userId === user?.id;
            return (
              <View
                key={e.userId}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing[3],
                  padding: spacing[3],
                  borderRadius: radii.lg,
                  backgroundColor: isMe ? colors.surfaceElevated : colors.surface,
                  borderWidth: isMe ? 1.5 : 1,
                  borderColor: isMe ? colors.primary : colors.border,
                }}
              >
                <Text variant="subtitle" style={{ width: 28 }}>
                  {e.rank}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text variant="body" style={{ fontWeight: '700' }}>
                    {isMe ? t('community.leaderboard.you') : e.displayName}
                  </Text>
                </View>
                <Text variant="subtitle">{e.avgScore}</Text>
              </View>
            );
          })}
        </View>
      )}

      {optedIn && !isLoading && !meRanked ? (
        <Text variant="caption" color="textSubtle">
          {t('community.leaderboard.notRanked')}
        </Text>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 2: Wire the tab into `CommunityScreen.tsx`**

Modify `apps/mobile/src/features/community/CommunityScreen.tsx`. Add to the imports (line 5, add `SegmentedControl`):

```ts
import { Badge, Button, Card, EmptyState, Icon, Screen, SegmentedControl, Text, useTheme } from '@supotsu/ui';
```

Add a new import line:

```ts
import { LeaderboardTab } from './LeaderboardTab';
```

Inside the `CommunityScreen` function, add state and replace the body. The current structure (lines 92-137) is:

```tsx
export function CommunityScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { data: challenges = [], isLoading } = useChallenges();
  const { data: myIds = [] } = useMyChallengeIds();
  const { data: activities = [] } = useActivities();
  const joinedSet = new Set(myIds);

  return (
    <Screen scroll>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="title">{t('community.screen.title')}</Text>
        <Button label={t('community.screen.newChallenge')} onPress={() => router.push('/profile/challenge/new')} />
      </View>
      <Text variant="caption" style={{ color: colors.textMuted }}>
        {t('community.screen.subtitle')}
      </Text>

      {isLoading ? (
        ...
      ) : challenges.length === 0 ? (
        ...
      ) : (
        <View style={{ gap: spacing[3] }}>
          {challenges.map((c) => (
            <ChallengeCard key={c.id} challenge={c} joined={joinedSet.has(c.id)} activities={activities} />
          ))}
        </View>
      )}
    </Screen>
  );
}
```

Replace it with:

```tsx
export function CommunityScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { data: challenges = [], isLoading } = useChallenges();
  const { data: myIds = [] } = useMyChallengeIds();
  const { data: activities = [] } = useActivities();
  const joinedSet = new Set(myIds);
  const [tab, setTab] = useState<'challenges' | 'leaderboard'>('challenges');

  return (
    <Screen scroll>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="title">{t('community.screen.title')}</Text>
        {tab === 'challenges' ? (
          <Button label={t('community.screen.newChallenge')} onPress={() => router.push('/profile/challenge/new')} />
        ) : null}
      </View>
      <Text variant="caption" style={{ color: colors.textMuted }}>
        {t('community.screen.subtitle')}
      </Text>

      <SegmentedControl
        options={[
          { value: 'challenges' as const, label: t('community.screen.tabs.challenges') },
          { value: 'leaderboard' as const, label: t('community.screen.tabs.leaderboard') },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'leaderboard' ? (
        <LeaderboardTab />
      ) : isLoading ? (
        <Text variant="body" color="textMuted">
          {t('common.loading')}
        </Text>
      ) : challenges.length === 0 ? (
        <EmptyState
          icon={<Icon name="fire" size={44} color={colors.textSubtle} />}
          title={t('community.screen.emptyState.title')}
          message={t('community.screen.emptyState.message')}
          actionLabel={t('community.screen.emptyState.action')}
          onAction={() => router.push('/profile/challenge/new')}
        />
      ) : (
        <View style={{ gap: spacing[3] }}>
          {challenges.map((c) => (
            <ChallengeCard
              key={c.id}
              challenge={c}
              joined={joinedSet.has(c.id)}
              activities={activities}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}
```

Add `useState` to the React import at the top of the file (currently `import React, { useMemo } from 'react';` — change to `import React, { useMemo, useState } from 'react';`).

- [ ] **Step 3: Typecheck**

Run: `cd apps/mobile && npm run typecheck`
Expected: clean.

- [ ] **Step 4: Lint**

Run: `cd apps/mobile && npx eslint src/features/community/LeaderboardTab.tsx src/features/community/CommunityScreen.tsx`
Expected: no errors.

- [ ] **Step 5: Manual smoke check**

Launch the app, navigate to Profil → Communauté, confirm the Défis/Classement segmented control renders and switches views, confirm the opt-in card appears when not opted in, and that toggling it to "Oui" makes the category/period selectors and list appear (empty state expected with no seeded `daily_scores` rows yet).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/features/community/LeaderboardTab.tsx apps/mobile/src/features/community/CommunityScreen.tsx
git commit -m "Add Classement tab to the Communauté screen"
```

---

### Task 10: Pseudo + opt-in in `ProfileEditScreen.tsx`

**Files:**
- Modify: `apps/mobile/src/features/settings/ProfileEditScreen.tsx`

**Interfaces:**
- Consumes: `useLeaderboardPrefs`, `useUpdateLeaderboardPrefs` from Task 6; `defaultDisplayName` from Task 3.
- Produces: nothing new consumed elsewhere — leaf task.

- [ ] **Step 1: Add imports**

Add to the `@/lib/data/queries` import (line 8, currently `import { useAthleteProfile, useSaveAthleteProfile } from '@/lib/data/queries';`):

```ts
import { useAthleteProfile, useLeaderboardPrefs, useSaveAthleteProfile, useUpdateLeaderboardPrefs } from '@/lib/data/queries';
```

Add:

```ts
import { useAuth } from '@/features/auth/AuthProvider';
import { defaultDisplayName } from '@/features/community/leaderboardHelpers';
```

- [ ] **Step 2: Add state + prefill effect**

After the existing `useEffect` that prefills `sex`/`level`/`height`/`weight`/`availability` (lines 43-50), add:

```tsx
  const { user } = useAuth();
  const { data: leaderboardPrefs } = useLeaderboardPrefs();
  const updateLeaderboardPrefs = useUpdateLeaderboardPrefs();
  const [pseudo, setPseudo] = useState('');
  const [optedIn, setOptedIn] = useState(false);

  useEffect(() => {
    if (!leaderboardPrefs) return;
    setPseudo(leaderboardPrefs.displayName ?? '');
    setOptedIn(leaderboardPrefs.leaderboardOptIn);
  }, [leaderboardPrefs]);

  const onToggleOptIn = (value: 'yes' | 'no'): void => {
    const nextOptedIn = value === 'yes';
    setOptedIn(nextOptedIn);
    const nextPseudo = nextOptedIn && !pseudo.trim() && user ? defaultDisplayName(user.id) : pseudo;
    if (nextOptedIn && !pseudo.trim()) setPseudo(nextPseudo);
    updateLeaderboardPrefs.mutate({ leaderboardOptIn: nextOptedIn, displayName: nextPseudo || undefined });
  };

  const onSavePseudo = (): void => {
    updateLeaderboardPrefs.mutate({ displayName: pseudo.trim() || undefined });
  };
```

- [ ] **Step 3: Add the UI fields**

Inside the existing `Card` (after the `availability` `Input`, before the Save `Button` row — currently lines 100-106), add:

```tsx
            <Input
              label={t('settings.profileEdit.pseudo.label')}
              placeholder={t('settings.profileEdit.pseudo.placeholder')}
              value={pseudo}
              onChangeText={setPseudo}
              onBlur={onSavePseudo}
            />
            <View style={{ gap: spacing[1] }}>
              <Text variant="label" color="textMuted">
                {t('settings.profileEdit.leaderboardOptIn.label')}
              </Text>
              <SegmentedControl
                options={[
                  { value: 'no' as const, label: t('settings.profileEdit.leaderboardOptIn.no') },
                  { value: 'yes' as const, label: t('settings.profileEdit.leaderboardOptIn.yes') },
                ]}
                value={optedIn ? 'yes' : 'no'}
                onChange={onToggleOptIn}
              />
            </View>
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/mobile && npm run typecheck`
Expected: clean.

- [ ] **Step 5: Lint**

Run: `cd apps/mobile && npx eslint src/features/settings/ProfileEditScreen.tsx`
Expected: no errors.

- [ ] **Step 6: Manual smoke check**

Open Profil → Modifier le profil, confirm the Pseudo input and the Participer au classement segmented control appear, typing a pseudo and blurring the field saves it (confirm via reopening the screen that it persisted), toggling opt-in to "Oui" with an empty pseudo auto-fills a generated one.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/features/settings/ProfileEditScreen.tsx
git commit -m "Add pseudo + leaderboard opt-in fields to ProfileEditScreen"
```

---

### Task 11: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Typecheck every touched package**

```bash
cd /Users/YK/Documents/Kaizen
(cd packages/core && npm run typecheck)
(cd packages/database && npm run typecheck)
(cd apps/mobile && npm run typecheck)
```

Expected: all three clean.

- [ ] **Step 2: Lint every touched package**

```bash
(cd apps/mobile && npm run lint)
(cd packages/database && npx eslint "src/**/*.ts")
```

Expected: no new errors (pre-existing unrelated warnings elsewhere in the repo are out of scope, matching this session's established convention).

- [ ] **Step 3: Run the full test suite**

```bash
npm test
```

Expected: all existing tests still pass, plus the new `leaderboardHelpers.test.ts` (7 tests) from Task 3.

- [ ] **Step 4: Push**

```bash
git push
```

Expected: all 10 prior commits from this plan land on the remote branch.
