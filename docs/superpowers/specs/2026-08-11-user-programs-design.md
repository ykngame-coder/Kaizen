# User-created séances & programmes — Design

Date: 2026-08-11
Status: Approved by user, ready for implementation.

## Problem

Today, `programs` (`supabase/migrations/0004_community_marketplace.sql`) is a
coach-authored, world-readable catalogue: users enroll (`program_enrollments`)
but never create or edit a program themselves. The user wants regular users to
build their own reusable training sessions and multi-week programs, optionally
share them, and have other users copy them — while keeping storage bounded
since this is a solo-dev project paying for its own Supabase instance.

## Decisions (from brainstorming)

- **Séances are independent of programmes.** A user builds a personal library
  of up to 50 reusable sessions, and can reference the same session from
  either (or both) of their up to 2 programs, or start it standalone.
- **Quota: 50 séances / 2 programmes per user**, enforced in the database
  (trigger), not just client-side — a modified client or direct API call must
  not be able to bypass it. Raised from an initial 10 to cover CrossFit/Hyrox-
  style programs where sessions vary almost daily rather than repeating a
  handful of templates across weeks — 50 covers roughly a month of distinct
  daily sessions shared across both programs, while staying bounded (these
  are small structured rows, so the storage cost stays negligible either way;
  the cap is really about abuse, not disk space).
- **Private by default.** A session/program is only visible to its owner
  until the owner explicitly shares it.
- **Sharing = copy, not live reference.** When another user finds a public
  session/program, "Copier dans ma bibliothèque" clones it into *their own*
  library, counted against *their own* quota. The copy is independent — the
  original owner editing their version does not affect the copy. This keeps
  RLS simple (no cross-user live joins to reason about) and matches how the
  existing coach `programs` catalogue is consumed (enroll = personal copy of
  progress, not shared mutable state).
- **Starting a session reuses the existing workout-logging flow.** A "séance"
  in this feature is a reusable *template*; pressing "Lancer" creates a normal
  `workouts` + `workout_sets` row pre-filled from the template, then the user
  logs it exactly like any other workout today. No new logging UI.

## Data model

Four new tables, migration `0013_user_programs.sql`. Modeled directly on the
existing `challenges` table (`public/private` + owner-write RLS) rather than
the read-only `programs` catalogue, since these rows are user-writable.

```sql
create table public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  notes text,
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_session_exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.user_sessions (id) on delete cascade,
  exercise_id text not null references public.exercises (id),
  "order" smallint not null default 0,
  reps smallint,
  weight_kg numeric(6, 2),
  duration_sec integer,
  rest_sec integer
);

create table public.user_programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  focus text not null check (focus in ('strength', 'endurance', 'hyrox', 'weight_loss', 'mobility', 'general')),
  level text not null check (level in ('beginner', 'intermediate', 'confirmed', 'advanced')),
  weeks integer not null check (weeks > 0 and weeks <= 26),
  description text,
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_program_sessions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.user_programs (id) on delete cascade,
  session_id uuid not null references public.user_sessions (id) on delete cascade,
  week_number smallint not null check (week_number > 0),
  day_index smallint not null check (day_index between 0 and 6),
  "order" smallint not null default 0
);
```

### Quota triggers

```sql
create or replace function public.enforce_user_sessions_quota()
returns trigger language plpgsql as $$
begin
  if (select count(*) from public.user_sessions where user_id = new.user_id) >= 50 then
    raise exception 'Limite de 50 séances atteinte.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger user_sessions_quota
  before insert on public.user_sessions
  for each row execute function public.enforce_user_sessions_quota();

-- Same shape for user_programs with a limit of 2.
```

The client still pre-checks the count before showing the create form (so the
UI can disable the button and explain *why*, instead of the user hitting a
raw Postgres error), but the trigger is the actual guarantee.

### RLS

Mirrors `challenges`: readable when `visibility = 'public'` or owned;
writable only by the owner. `user_session_exercises` and
`user_program_sessions` don't have their own `visibility` — a policy checks
the parent row's visibility/ownership via a subquery (same shape as how
`workout_sets` would be scoped through `workouts` if it had RLS of its own).

Edge case: a public program can reference a session the owner later makes
private (or that was never shared). The join row still exists, but
`user_sessions` RLS hides that session's content from other users — the UI
shows a "séance privée" placeholder for that slot rather than erroring. No
extra enforcement needed; this falls out of composing the two policies.

## Copy mutation

Client-side (no new Edge Function — plain authenticated inserts, same as
today's `addActivity`/`addWorkout` style mutations):

1. Read the source session (+ its exercises) or program (+ its
   `user_program_sessions` + the underlying sessions).
2. Pre-check the *recipient's* quota: for a lone session, they must have room
   for 1 more; for a program, count how many of its constituent sessions
   aren't already in the recipient's library (by cloning, so always "all of
   them" since it's a fresh copy) and verify both the program slot (1 of 2)
   and the session slots (N of 50) are free. If not, block with a clear
   message ("Il te reste 3 séances de libre, ce programme en a besoin de 5.")
   before writing anything.
3. Insert fresh rows owned by the current user with new ids — fully
   independent from the source from that point on.

## UI

Extends the existing Marketplace screen (`/profile/marketplace`) with tabs:

- **Catalogue** — today's coach-authored programs, unchanged.
- **Communauté** — public `user_programs`/`user_sessions` from other users,
  each with "Copier dans ma bibliothèque".
- **Mes créations** — manage your own library: list of sessions (create,
  edit exercises, delete, toggle share) with a "12/50" counter, same for
  programs (create, assign sessions to week/day slots, delete, toggle share)
  with a "1/2" counter. "Lancer" on a session creates the pre-filled workout.

New screens: a session builder (name + exercise list, reusing the exercise
picker already built for `NewWorkoutScreen`) and a program builder (title/
focus/level/weeks + a week×day grid to place sessions from the library into
slots).

## Out of scope for this pass

- No likes/ratings/comments on shared content.
- No notification when someone copies your program.
- No server-side enforcement beyond the quota trigger (e.g. no content
  moderation) — acceptable for a small user base; revisit if abuse shows up.
