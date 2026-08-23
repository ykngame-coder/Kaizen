# Séances chronométrées (AMRAP / EMOM / Pour le temps) — Design

Date: 2026-08-22
Status: Approved by user, ready for implementation.

## Problem

TestFlight feedback: séances only support the strength model (reps × charge
per set, logged after the fact). The tester wants to create and be **guided
live** through AMRAP, EMOM, CrossFit-style, and kettlebell-complex sessions —
not just log that one happened. The app already has two disconnected pieces
that are almost what's needed: `workout_sets` already carries `duration_sec`/
`rest_sec` alongside `reps`/`weight_kg` (unused by anything today), and
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
- **The round is stored once, not once per repetition.** All three modes
  repeat the *same* exercise list; only the timing differs. Avoids
  duplicating rows for what could be 20+ AMRAP rounds.
- **Live-guided execution, not just after-the-fact logging** — this is the
  core ask. A new screen drives the timer *and* shows the current round's
  exercises, distinct from both the static creation form and the
  exercise-agnostic Minuteurs screen.
- **Strength workouts are untouched.** `format` defaults to `'strength'` and
  every existing screen/flow for it is unchanged. This is additive.

## Data model

Migration `0023_circuit_workout_formats.sql`. Extends `workouts` — no new
tables, since a round is just today's `workout_sets` rows (already has
`duration_sec`/`rest_sec`/`order`, already FKs to `exercises`, already scoped
by the existing `workout_sets follow workout ownership` RLS policy).

```sql
alter table public.workouts
  add column format text not null default 'strength'
    check (format in ('strength', 'amrap', 'emom', 'for_time')),
  add column time_cap_sec integer,   -- AMRAP cap, or EMOM interval length
  add column target_rounds smallint, -- EMOM interval count, or for_time round count
  add column completed_rounds smallint,
  add column result_time_sec integer; -- for_time finish time
```

No RLS changes (same `workouts are self-owned` policy already covers new
columns). No changes to `workout_sets` — existing columns are sufficient.

### Known simplification (not solved this pass)

Volume-dependent computations that read `workout_sets` (muscle recovery,
progression suggestions) will see one round's reps, not
`reps × completed_rounds`. For a strength workout this is exact; for an
8-round AMRAP it undercounts total volume. Accepted for v1 — these engines
already treat everything generically by `exercise_id`, so nothing breaks,
it's just a precision gap to revisit if it matters in practice.

## UI

### Creation (`NewWorkoutScreen`)

A format picker (`SegmentedControl`: Musculation / AMRAP / EMOM / Pour le
temps) at the top, defaulting to Musculation (today's unchanged form).
Picking a circuit format swaps the form:

- Same exercise search/add UI as today, but each added exercise only asks
  for reps *or* duration (no weight/rest-per-set — round-level timing
  replaces per-set rest).
- Mode-specific fields: AMRAP → time cap (min); EMOM → interval length (sec)
  + number of intervals; Pour le temps → number of rounds.

Saves as a `workouts` row (`status: 'planned'`) with `format` +
the mode fields set, and one `workout_sets` row per exercise in the round
(`order` = position, `reps` or `duration_sec` set, `rest_sec`/`weight_kg`
null).

### Live execution — new screen (`CircuitRunnerScreen`)

Reached via "Lancer" on a circuit-format workout (from Planification or
right after creation) — strength workouts keep today's flow untouched.
Builds on `IntervalTimerScreen`'s timer engine (countdown, haptics/sound at
phase change) but adds a persistent exercise list for the current round:

- **AMRAP**: countdown from `time_cap_sec`. Shows the round's exercises;
  "Round terminé" button increments a round counter and restarts the round
  display (doesn't reset the master countdown). Ends automatically at 0:00.
- **EMOM**: reuses the existing interval engine (`time_cap_sec` = interval,
  `target_rounds` = count) — same beep/haptic behavior as Minuteurs today —
  with the round's exercises shown for the current interval instead of a
  bare countdown.
- **Pour le temps**: stopwatch counts up from 0; shows the current round with
  the same "Round terminé" button as AMRAP (manual advance, self-paced — no
  master countdown to race against); reaching `target_rounds` stops the
  clock and finishes the session.

On finish: writes `completed_rounds` (AMRAP/EMOM: rounds actually done;
for_time: `target_rounds`), `result_time_sec` (for_time: elapsed; AMRAP:
`time_cap_sec`; EMOM: `time_cap_sec × completed_rounds`), sets
`status: 'completed'`, `completed_at: now()`.

### History display

`ActivityDetailScreen` / workout detail / "3 dernières activités": circuit
formats show a one-line result summary instead of the strength set list —
e.g. "AMRAP 12 min — 7 rounds", "EMOM 10×1 min", "Pour le temps — 8 min 42".
The round's exercise list still shows below (read-only), same as strength
sets today, just without weight/rest columns.

## Out of scope for this pass

- No per-round result variance (e.g. logging different reps achieved each
  AMRAP round) — one round definition, a single completed-rounds count.
- No adjusting muscle-recovery/progression math for round multipliers (see
  Known simplification above).
- No Garmin-import mapping to these formats — imported Garmin sets still
  land as `strength` (unrelated to this feature; Garmin's own FIT categories
  don't distinguish AMRAP/EMOM from regular strength sets).
- No sharing/templating circuit workouts via the existing user-programs
  feature — can reuse that plumbing later, not blocking this.
