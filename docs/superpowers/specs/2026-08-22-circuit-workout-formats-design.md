# Séances chronométrées (AMRAP / EMOM / Pour le temps) — Design

Date: 2026-08-22
Status: Approved by user, ready for implementation. (Revised after mockup
review to support mixed-format sessions — see "Revision" below.)

## Problem

TestFlight feedback: séances only support the strength model (reps × charge
per set, logged after the fact). The tester wants to create and be **guided
live** through AMRAP, EMOM, CrossFit-style, and kettlebell-complex sessions —
not just log that one happened — and to be able to **combine formats within
one session** (e.g. EMOM warm-up then AMRAP, or AMRAP then straight
musculation). The app already has two disconnected pieces that are almost
what's needed: `workout_sets` already carries `duration_sec`/`rest_sec`
alongside `reps`/`weight_kg` (unused by anything today), and
`IntervalTimerScreen` (Minuteurs) already runs a work/rest/rounds engine with
an EMOM preset — but it's a pure countdown, "nothing is logged" by design,
with no exercises attached.

## Decisions (from brainstorming)

- **One generic engine, not four bespoke formats.** AMRAP, EMOM, "for time",
  and kettlebell complex all reduce to the same shape: an ordered list of
  exercises (a "round"), executed under one of three timing modes:
  - `amrap` — fixed time cap; repeat the round until time's up; user taps to
    mark each round complete.
  - `emom` — fixed interval repeated N times (reuses the existing Minuteurs
    engine/beep); one round per interval.
  - `for_time` — fixed number of rounds, no cap; stopwatch counts up until
    the user marks the session done. Covers both a classic CrossFit "for
    time" WOD and a kettlebell complex (a fixed unbroken sequence repeated X
    times) — same primitive, no separate "complex" mode needed.
  - `strength` — today's existing reps × weight × rest-per-set model,
    unchanged.
- **A session is a sequence of blocks, not one format.** (Revision — see
  below.) Each block picks one of the four formats above and has its own
  exercises and timing; a session can mix them (EMOM block → AMRAP block, or
  AMRAP block → strength block).
- **A block's round is stored once, not once per repetition.** All three
  timed modes repeat the *same* exercise list within their block; only the
  timing differs. Avoids duplicating rows for what could be 20+ AMRAP rounds.
- **Live-guided execution, not just after-the-fact logging** — this is the
  core ask. A new screen drives the timer *and* shows the current block's
  exercises, advancing block-to-block, distinct from both the static
  creation form and the exercise-agnostic Minuteurs screen.
- **Plain strength-only workouts are untouched.** Today's flow (no blocks at
  all) keeps working exactly as it does now — this is purely additive.

## Revision: blocks, not a single session format

First pass put `format`/timing directly on `workouts` (one format per
session). The user then asked for mixed sessions (EMOM + AMRAP, AMRAP +
musculation) — which a single format column can't express. Revised to an
intermediate **block** level: a session (`workouts`) contains an ordered list
of blocks (`workout_blocks`), each with its own format, timing, and
exercises (`workout_sets` scoped to that block).

Plain strength workouts (today's entire existing flow: manual logging,
Garmin import) are **not required to have any blocks** — their sets keep
hanging directly off `workout_id` exactly as today, `block_id` stays null.
Blocks only come into play for a circuit-style or mixed session, including a
session with a single circuit block (e.g. "just AMRAP" — the common case
from the original request is simply a one-block session).

## Data model

Migration `0023_circuit_workout_formats.sql`.

```sql
create table public.workout_blocks (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts (id) on delete cascade,
  "order" smallint not null default 0,
  format text not null check (format in ('strength', 'amrap', 'emom', 'for_time')),
  time_cap_sec integer,    -- AMRAP cap, or EMOM interval length
  target_rounds smallint,  -- EMOM interval count, or for_time round count
  completed_rounds smallint,
  result_time_sec integer  -- for_time finish time
);

create index workout_blocks_workout_idx on public.workout_blocks (workout_id);

alter table public.workout_sets
  add column block_id uuid references public.workout_blocks (id) on delete cascade;

create index workout_sets_block_idx on public.workout_sets (block_id) where block_id is not null;
```

`workout_sets.workout_id` is untouched (still required, still the direct FK
used everywhere today) — `block_id` is an additional, optional grouping.
A set with `block_id is null` is a plain top-level strength set (today's
model, unchanged). A set with `block_id` set belongs to that block's round;
its `reps`/`duration_sec`/`weight_kg` mean the same thing they do today
(weight/rest stay meaningful for a `strength`-format block, are unused for
the three timed formats).

### RLS

New policy on `workout_blocks`, same shape as the existing `workout_sets
follow workout ownership` policy — ownership derived from the parent
`workouts` row:

```sql
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

`workout_sets`' existing RLS policy is unaffected (still keyed off
`workout_id`, which every set still carries regardless of `block_id`).

### Known simplification (not solved this pass)

Volume-dependent computations that read `workout_sets` (muscle recovery,
progression suggestions) will see one round's reps per timed block, not
`reps × completed_rounds`. For a strength set (block or top-level) this is
exact; for an 8-round AMRAP block it undercounts total volume. Accepted for
v1 — these engines already treat everything generically by `exercise_id`, so
nothing breaks, it's just a precision gap to revisit if it matters in
practice.

## UI

### Creation (`NewWorkoutScreen`)

The session becomes a list of blocks instead of one flat exercise list:

- **"+ Ajouter un bloc"** adds a block. Each block has its own format picker
  (Musculation / AMRAP / EMOM / Pour le temps), its own exercise
  search/add list, and its own mode-specific fields (AMRAP → time cap; EMOM
  → interval length + count; Pour le temps → number of rounds). A
  `strength`-format block keeps today's per-set reps/weight/rest inputs; the
  three timed formats only ask reps *or* duration per exercise (round-level
  timing replaces per-set rest).
- Blocks are ordered (reorder/remove); a session with exactly one
  `strength` block and nothing else behaves exactly like — and can render as
  — today's simple form, so the common case doesn't feel more complex than
  it used to.

Saves as a `workouts` row (`status: 'planned'`) plus one `workout_blocks` row
per block (in order) plus that block's `workout_sets` rows (`block_id` set,
`order` = position within the block).

### Live execution — new screen (`CircuitRunnerScreen`)

Reached via "Lancer" on a workout that has at least one block — a
single-block session behaves as previously designed; a multi-block session
runs each block in sequence, advancing automatically when one finishes:

- **AMRAP block**: countdown from `time_cap_sec`. Shows the block's
  exercises; "Round terminé" increments a round counter and restarts the
  round display (doesn't reset the countdown). Reaching 0:00 finishes the
  block and advances.
- **EMOM block**: reuses the existing interval engine (`time_cap_sec` =
  interval, `target_rounds` = count) — same beep/haptic behavior as
  Minuteurs today — showing the block's exercises for the current interval.
  Finishing the last interval advances.
- **Pour le temps block**: stopwatch counts up from 0; same "Round terminé"
  button as AMRAP (manual advance, self-paced, no countdown to race);
  reaching `target_rounds` stops the clock and advances.
- **Strength block** (inside a mixed session): no timer — shows the normal
  set-logging checklist (mark each set done, adjust reps/weight inline, same
  interaction as today's workout completion flow), with a "Bloc suivant"
  button once every set is checked off.
- A slim progress indicator ("Bloc 2 / 3") sits above whichever block UI is
  active. Finishing the last block finishes the session: writes each
  timed block's `completed_rounds`/`result_time_sec`, sets the workout's
  `status: 'completed'`, `completed_at: now()`.

### History display

`ActivityDetailScreen` / workout detail / "3 dernières activités": a
session's summary line lists its blocks in order — e.g. "EMOM 10×1 min →
AMRAP 12 min", or just "AMRAP 12 min — 7 rounds" for a single-block session.
Each block's exercise list shows below (read-only), same as strength sets
today; a `strength` block shows weight/rest columns, the three timed formats
don't.

## Out of scope for this pass

- No per-round result variance within a block (e.g. logging different reps
  achieved each AMRAP round) — one round definition per block, a single
  completed-rounds count.
- No adjusting muscle-recovery/progression math for round multipliers (see
  Known simplification above).
- No Garmin-import mapping to these formats — imported Garmin sets still
  land as top-level `strength` sets, `block_id` null (unrelated to this
  feature; Garmin's own FIT categories don't distinguish AMRAP/EMOM from
  regular strength sets).
- No sharing/templating multi-block circuit workouts via the existing
  user-programs feature — can reuse that plumbing later, not blocking this.
- No reordering blocks *during* live execution (order is fixed once the
  session starts) — only at creation/edit time.
