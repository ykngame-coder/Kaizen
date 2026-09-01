# Superset Support — Design

**Goal:** Let two or more exercises be grouped as a superset — created manually in
the session builder or detected from a Hevy screenshot import — persisted as a
real concept through the saved workout, and executed live as an alternating
A1→B1→A2→B2 sequence with a rest only after each full round. Alongside this,
fix the screenshot-OCR importer's noise handling and two parsing bugs found
while reviewing real Garmin/Hevy screenshots, since both land in the same
review together.

**Context:** `packages/connectors/src/workoutOcr.ts` turns OCR text into a
draft workout; `apps/mobile/src/features/sport/OcrImportScreen.tsx` is the
review screen. Session creation/editing goes through
`apps/mobile/src/features/training/sessionBuilder.ts` (the `useSessionBlocks`
hook) and `SessionBlocksEditor.tsx`, shared by `NewWorkoutScreen.tsx`,
`EditWorkoutScreen.tsx` and the marketplace's `SessionBuilderScreen.tsx`. Live
execution of a multi-block session is `CircuitRunnerScreen.tsx`, built on
`blockRunnerEngine.ts`. The `WorkoutBlock`/circuit-format work
(`docs/superpowers/specs/2026-08-22-circuit-workout-formats-design.md`) is the
closest precedent: blocks/`workout_sets` already carry `block_id`,
`format`, `target_rounds`; this spec adds one more block-scoped tag.

## 1. OCR noise + parsing fixes

Reviewed 4 Garmin Connect screenshots and 3 Hevy screenshots. Every non-empty
OCR line currently becomes either a matched exercise or a `to_confirm` junk
row — there is no noise filtering at all today.

### 1.1 Noise to drop

Add a preprocessing pass in `parseWorkoutText`, before the existing
name/exercise loop, that drops:

- **Exact-match stoplist** (trimmed, case-sensitive): `Les exercices
  physiques`, `Échauffement`, `Étapes`, `Repos`, `Appui sur touche Lap`,
  `SÉRIE`, `POIDS ET RÉPÉTITIONS`, `Détails de l'Entraînement`, `Modifier
  l'Entraînement`, `Voir plus`, `Entraînement`, `Accueil`, `Profil`, `HEVY`,
  `Poids`, `1RM`.
- **Group-count headers** — regex `^\d+\s+(sessions?|séries?)$` (Garmin's "3
  sessions", "1 série").
- **Bare clock/duration tokens** — regex `^\d{1,2}:\d{2}$`. Covers the
  status-bar clock, Garmin rest durations ("1:00", "2:00"), and cardio-block
  durations ("2:30"). This also fixes a real bug: `"2:30"` currently
  false-matches `PATTERN_AMBIGUOUS` (name captures `"2:"`, number captures
  `30`) and produces a bogus exercise named "2:" with 30 reps.
- **Long, digit-free lines** (> 80 chars, no digit) — safety net for the
  Garmin footer disclaimer ("Garmin stocke votre entraînement…"), which may
  or may not arrive as one OCR line depending on how ML Kit blocks the
  paragraph.
- **Consecutive duplicate lines** (trimmed, case-insensitive) — collapses the
  scroll-ghosting artifact seen in the Hevy screenshots (faded text behind
  the nav bar re-appearing as a second, solid copy of the same line).

### 1.2 New pattern: Garmin "reps • weight"

Garmin renders a set as `"8 répét. • 45,0 kg"` (reps, then a middle dot, then
weight) — no `×`/`x` at all, so none of the three existing `matchLine`
patterns recognize it. Add a fourth pattern tried in `matchLine`, ahead of
`PATTERN_AMBIGUOUS`:

```
PATTERN_GARMIN_REPS_WEIGHT = /^(\d+)\s*répét\.?\s*[•·]\s*(\d+(?:[.,]\d+)?)\s*(kg|kgs|lb|lbs|livres)?\s*$/i
```

Always a continuation line (no name capture — Garmin's exercise name is
always its own preceding line), reps from group 1, weight from group 2/3,
`confidence: 'high'`.

### 1.3 Bug: bare set-index line eaten as a phantom set

Hevy renders a set as two separate text elements — a bare index/marker
("1", "2", "W" for warm-up) then, as the next line, the fully self-contained
value ("50 kg x 8"). Today the bare marker line matches
`PATTERN_AMBIGUOUS` on its own (empty name, no unit → read as reps) and gets
merged as a spurious extra set *before* the real one.

Fix: in the noise-preprocessing pass, drop a line if it matches
`^[A-Za-z]{1,2}$` or `^\d{1,3}$` **and** the next surviving line already
fully matches `PATTERN_WEIGHT_FIRST` or `PATTERN_SETS_FIRST` with a weight
present (i.e. that next line is already fully self-contained — reps *and*
weight — so the marker contributes nothing). A bare number that is *not*
followed by a self-contained line (e.g. bodyweight reps logged as a lone
number in some other app's format) is left untouched — the existing
continuation behavior for that case is correct and must not regress.

## 2. Superset data model

- **Migration** `supabase/migrations/0025_workout_set_supersets.sql`:
  ```sql
  alter table public.workout_sets add column superset_group smallint;
  ```
  Nullable, block-scoped (meaningful only in combination with `block_id`; no
  FK needed — it's a plain grouping tag, same spirit as `target_rounds` on
  `workout_blocks`). `null` = not in a superset, current behavior unchanged.
- `packages/database/src/generated/database.types.ts`: hand-add
  `superset_group: number | null` to `workout_sets`' Row/Insert/Update, next
  to the existing columns — same manual-update step the circuit-format work
  already established for this generated file.
- `packages/core/src/training.ts`: add `supersetGroup?: number` to
  `SetEntry`.
- `packages/database/src/repositories/workouts.ts`: no signature changes —
  `insertWorkoutWithBlocks`'s `sets` already forwards whatever
  `WorkoutSetInsertRow` fields the caller supplies; `superset_group` rides
  along for free once callers set it.

## 3. Session builder (creation/edit)

- `sessionBuilder.ts` — `BlockDraft` gains `supersetGroups: Record<string,
  number>` (exerciseId → group number), alongside the existing `order`
  (unchanged shape/type) and `selected`. A group's members are inferred by
  being tagged with the same number **and** adjacent in `order` — exercises
  must sit back-to-back in the block's list to be treated as an active pair,
  matching how both Garmin/Hevy and manual use always show them consecutively.
  `emptyBlock()` starts with `supersetGroups: {}`.
- New builder actions: `groupAsSuperset(exerciseIds: string[])` — allocates
  the next group number (`max(existing group numbers) + 1`, or `1` if none)
  and assigns it to every id in the list; `ungroup(exerciseId)` — deletes
  that id's entry from `supersetGroups`.
- `SessionBlocksEditor.tsx` — in the active block's exercise list, a
  lightweight multi-select: tapping a "Grouper" affordance lets the user tap
  2+ exercises, then confirms with "Grouper en superset" (mirrors the
  existing tap-to-toggle patterns already in this screen, e.g. muscle/
  equipment filter chips). Grouped exercises render inside a single bracketed
  card with a "Superset" badge instead of separate rows; a "Dissocier" action
  ungroups. The group's rest-after-round is just the existing per-set `rest`
  field on the *last* exercise in the group's `SetDraft` — no new input.
- Save path (`NewWorkoutScreen.tsx` submit, `EditWorkoutScreen.tsx` submit):
  when building each block's `sets` array, look up
  `block.supersetGroups[exerciseId]` and include it as `supersetGroup` on
  every set generated for that exercise (same loop that already maps
  `order`/`selected` → `WorkoutSetInsertRow`-shaped objects).
- `isSingleStrength` (in `sessionBuilder.ts`, already patched once this
  session for repeat-rounds) also needs to exclude a single block that has
  any `supersetGroups` entries — same reasoning as the rounds fix: the flat
  single-strength save path has no block/set-tag concept, so a superset must
  take the real block path even when it's the workout's only block.

## 4. Live execution — `CircuitRunnerScreen.tsx`

**Correction from the first pass of this design:** a manually-built block's
`workout_sets` rows are one row *per exercise*, not one row per physical set
— `BlockDraft.selected` in the session builder holds a single target
reps/weight/rest per exercise, and "do 3 rounds" already comes entirely from
the block-level `targetRounds` (the "Répéter ce bloc" feature shipped
earlier this session), not from multiple stored rows. So a superset's round
count is not a new, separate thing to compute — it's the same
`targetRounds`/`roundsCompleted` state the repeat-rounds feature already
maintains. Superset changes *how a round is displayed and stepped through*,
not how many rounds there are.

A `'strength'`-format block's sets (from `useBlockSets`) are grouped: entries
sharing a `supersetGroup` value form a group; everything else is a standalone
item. Items keep the block's `order` sequence.

- If the block has **no** superset-tagged sets: unchanged — both the
  existing plain (`!isRepeatingStrength`) and repeated
  (`isRepeatingStrength`) branches behave exactly as they do today.
- If the block **has** at least one superset-tagged set (`hasSuperset =
  sets.some((s) => s.supersetGroup != null)`), the per-round display changes
  from "show every exercise at once, one 'Round terminé' button" to
  **stepping through items one at a time**: a `stepIndex` walks the ordered
  item list (standalone exercises and superset-group members, each group's
  members listed individually in order); each item shows its card with a
  "Terminé" button advancing `stepIndex`. No pause between two members of
  the same group. When `stepIndex` reaches the end of the item list, that's
  a completed round — same effect as today's "Round terminé" tap
  (`roundsCompleted += 1`, `stepIndex` resets to 0) — except: if more rounds
  remain, first show a rest countdown seeded from the *last item's*
  `restSec` (default 90 s if unset) with a "Passer" button, then advance.
  This works whether or not `targetRounds` was actually set above 1 — a
  block with an untouched (empty/1) round count and a superset just steps
  through the group once, A then B, no rest screen (`roundsCompleted >=
  repeatRounds` immediately) — a harmless degenerate case, not blocked.
- `completeBlock`'s `completedRounds` is unchanged — same `roundsCompleted`
  value already used for the plain repeated-strength case.

## 5. OCR → superset detection

- `workoutOcr.ts`: `ParsedExercise` gains `supersetGroup?: number`. In
  `parseWorkoutText`, the literal line `"Superset"` (post noise-filtering
  it's the one stoplist-like line kept, not dropped) does not produce a row;
  it sets a `pendingSuperset` flag. When the next exercise entry is created:
  - if the immediately preceding exercise already has a `supersetGroup`,
    reuse it (chains 3+ grouped exercises into one group instead of
    fragmenting pairs);
  - otherwise allocate a fresh group number and tag both the preceding and
    the new exercise with it.
- `OcrImportScreen.tsx`: this screen keeps its own lightweight `ExerciseDraft`
  state (it does not build on `useSessionBlocks`/`BlockDraft` today, and
  this spec doesn't merge the two screens) — grouped exercises get their own
  `supersetGroup?: number` field, set the same way §3's "Grouper en
  superset" affordance works, and render inside one bracketed card with a
  "Superset" badge. On save: if no exercise carries a `supersetGroup`, the
  existing flat `useAddWorkout` path is unchanged; if at least one does, the
  screen switches to `useAddCircuitWorkout` with a single `'strength'`
  block containing every exercise's sets (tagged with `supersetGroup` where
  set), instead of the flat path — same branching idea as
  `isSingleStrength` in §3, applied locally since this screen doesn't share
  that hook.

## 6. Display

- `WorkoutDetailScreen.tsx`'s `BlockSummaryCard` (also reused by
  `ActivityDetailScreen` for a matched Garmin/circuit workout): exercises
  sharing a `supersetGroup` render inside one bracketed sub-card with the
  same "Superset" badge, instead of as separate rows — consistent with the
  live-runner and OCR-review treatment.

## 7. Testing

- `workoutOcr.test.ts`: new cases for each noise rule (§1.1), the Garmin
  reps•weight pattern (§1.2), the bare-index-line fix (§1.3) — including a
  regression case proving a genuinely bare bodyweight-reps line (not
  followed by a self-contained match) still works as a continuation — and
  `"Superset"` grouping (pair and 3-chain).
- `blockRunnerEngine.test.ts` or a new test file for the superset round/rest
  state machine (§4) — pure functions only, no React, matching this file's
  existing style.
- Existing `sessionBuilder`/session-builder-adjacent tests: none currently
  exist as unit tests (the hook is exercised through the screens); no
  regression suite to extend there beyond manual verification via the
  in-app flow.

## Out of scope

- Superset pairing across different blocks (a group is always within one
  block).
- Editing a group's rest value from the live runner itself (it's set at
  creation time, same as every other per-set field).
- Retroactively detecting/backfilling supersets in already-imported or
  already-saved workouts.
