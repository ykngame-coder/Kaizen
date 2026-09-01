# Superset Support + OCR Import Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the screenshot-OCR workout importer's noise handling and two
parsing bugs (found by reviewing real Garmin/Hevy screenshots), and add
superset support — created manually or detected from a Hevy import —
persisted through the data model and executed live as an alternating
A1→B1→A2→B2 sequence with a rest only after each full round.

**Architecture:** One new nullable column (`superset_group` on
`workout_sets`), threaded through the existing block/set repository layer
(no new tables). The session builder's `BlockDraft` gets a parallel
`supersetGroups` tag map; grouping is inferred by *adjacency* in the
existing `order` array, not a restructured data shape. The live runner
reuses the already-shipped block-repeat (`targetRounds`/`roundsCompleted`)
state exactly — a superset only changes how one round is displayed
(stepped through one exercise at a time instead of shown all together).

**Tech Stack:** React Native / Expo, TypeScript, Supabase (Postgres), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-01-superset-support-design.md`

## Global Constraints

- `superset_group` is a nullable `smallint`, meaningful only in combination
  with a set's own `block_id` — no FK, same pattern as `workout_blocks
  .target_rounds`.
- A superset group's members must be **adjacent** in a block's exercise
  order — grouping is inferred from adjacency, never stored as an explicit
  membership list.
- No rest between two members of the same group; rest only after a full
  round, seeded from the round's last item's existing `restSec` field (no
  new "group rest" field).
- `OcrImportScreen.tsx` keeps its own `ExerciseDraft` state — it is **not**
  merged with `useSessionBlocks`/`BlockDraft` in this plan.
- Every OCR noise/parsing fix must not regress the existing 23 tests in
  `packages/connectors/src/workoutOcr.test.ts`.

---

### Task 1: Data model — migration, generated types, core type

**Files:**
- Create: `supabase/migrations/0025_workout_set_supersets.sql`
- Modify: `packages/database/src/generated/database.types.ts:170-196`
- Modify: `packages/core/src/training.ts:75-86`

**Interfaces:**
- Produces: `SetEntry.supersetGroup?: number` (consumed by every later task
  that reads/writes a set).

- [ ] **Step 1: Write the migration**

```sql
-- Superset support: sets sharing this number, within the same block, form
-- one superset — alternated A1/B1/A2/B2 live, rest only after each round.
-- See docs/superpowers/specs/2026-09-01-superset-support-design.md.

alter table public.workout_sets add column superset_group smallint;
```

- [ ] **Step 2: Hand-add the column to the generated types file**

In `packages/database/src/generated/database.types.ts`, in the
`workout_sets` table block (around line 170), add `superset_group: number |
null;` to `Row` (after `block_id: string | null;`) and `superset_group?:
number | null;` to `Insert` (after `block_id?: string | null;`):

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
          superset_group: number | null;
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
          superset_group?: number | null;
        };
        Update: Partial<Database['public']['Tables']['workout_sets']['Insert']>;
        Relationships: [];
      };
```

- [ ] **Step 3: Add the field to the core `SetEntry` type**

In `packages/core/src/training.ts`, in the `SetEntry` interface (around line
76), add after `restSec?: number;`:

```ts
  /** Set-level RPE. */
  rpe?: number;
  /** Sets sharing this number, within the same block and adjacent in order, form one superset — alternated live, no rest between members. */
  supersetGroup?: number;
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit -p .` and `cd packages/database &&
npx tsc --noEmit -p .` (or the repo-root equivalent your tooling uses).
Expected: no new errors — this task only adds an optional field, nothing
consumes it yet.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0025_workout_set_supersets.sql packages/database/src/generated/database.types.ts packages/core/src/training.ts
git commit -m "Add superset_group column for grouping sets into a superset"
```

---

### Task 2: OCR noise filtering + Garmin/Hevy parsing fixes

**Files:**
- Modify: `packages/connectors/src/workoutOcr.ts`
- Test: `packages/connectors/src/workoutOcr.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `preprocessLines(raw: string[]): string[]` and the extended
  `matchLine` (both internal, exercised only through `parseWorkoutText`,
  whose public signature is unchanged in this task).

- [ ] **Step 1: Write the failing tests**

Add to `packages/connectors/src/workoutOcr.test.ts` (inside the existing
`describe('parseWorkoutText', ...)` block, or a new one if it's structured
differently — check the file first):

```ts
describe('parseWorkoutText — noise filtering (Garmin/Hevy screenshots)', () => {
  it('drops Garmin chrome and group-count headers', () => {
    const text = [
      '17:11',
      'Les exercices physiques',
      'Squat arrière avec poids',
      '8 répét. • 45,0 kg',
      'Repos',
      '1:00',
      '3 sessions',
      'Échauffement',
      'Course tapis',
      '2:00',
      'Étapes',
      'Appui sur touche Lap',
    ].join('\n');
    const result = parseWorkoutText(text);
    const names = result.exercises.map((e) => e.rawName);
    expect(names).toEqual(['Squat arrière avec poids', 'Course tapis']);
  });

  it('drops Hevy chrome (column headers, nav labels, badges)', () => {
    const text = [
      '17:12',
      'HEVY',
      "Détails de l'Entraînement",
      'Développé Militaire (Barre)',
      'SÉRIE',
      'POIDS ET RÉPÉTITIONS',
      '1',
      '50 kg x 8',
      '60 kg x 4',
      'Poids',
      '1RM',
      'Voir plus',
      'Accueil',
    ].join('\n');
    const result = parseWorkoutText(text);
    expect(result.exercises).toHaveLength(1);
    expect(result.exercises[0]!.rawName).toBe('Développé Militaire (Barre)');
    expect(result.exercises[0]!.sets).toEqual([
      { reps: 8, weightKg: 50 },
      { reps: 4, weightKg: 60 },
    ]);
  });

  it('drops a bare clock/duration line without treating it as a rep count', () => {
    // Regression: "2:30" used to false-match as name="2:", reps=30.
    const result = parseWorkoutText(['Rameur', '2:30'].join('\n'));
    expect(result.exercises).toHaveLength(1);
    expect(result.exercises[0]!.rawName).toBe('Rameur');
    expect(result.exercises[0]!.sets).toEqual([]);
    expect(result.exercises[0]!.confidence).toBe('to_confirm');
  });

  it('collapses a consecutive duplicate line (scroll-ghosting artifact)', () => {
    const result = parseWorkoutText(['Rowing Penché (Barre)', 'Rowing Penché (Barre)', '50 kg x 8'].join('\n'));
    expect(result.exercises).toHaveLength(1);
    expect(result.exercises[0]!.sets).toEqual([{ reps: 8, weightKg: 50 }]);
  });

  it('parses the Garmin reps-then-weight format', () => {
    const result = parseWorkoutText(['Squat arrière avec poids', '8 répét. • 45,0 kg', '6 répét. • 65,0 kg'].join('\n'));
    expect(result.exercises).toHaveLength(1);
    expect(result.exercises[0]!.sets).toEqual([
      { reps: 8, weightKg: 45 },
      { reps: 6, weightKg: 65 },
    ]);
    expect(result.exercises[0]!.confidence).toBe('high');
  });

  it('drops a Hevy set-index line that is immediately followed by a self-contained value', () => {
    const result = parseWorkoutText(['Développé Couché (Barre)', '1', '75 kg x 8', '2', '75 kg x 8', 'W', '40 kg x 8'].join('\n'));
    expect(result.exercises).toHaveLength(1);
    expect(result.exercises[0]!.sets).toEqual([
      { reps: 8, weightKg: 75 },
      { reps: 8, weightKg: 75 },
      { reps: 8, weightKg: 40 },
    ]);
  });

  it('still treats a bare number as a continuation rep count when nothing self-contained follows it', () => {
    // Not a Hevy index line: no self-contained value on the next line, so the
    // existing "bare number = reps" continuation behavior must be preserved.
    const result = parseWorkoutText(['Pompes', '12'].join('\n'));
    expect(result.exercises).toHaveLength(1);
    expect(result.exercises[0]!.sets).toEqual([{ reps: 12, weightKg: undefined }]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/connectors/src/workoutOcr.test.ts`
Expected: FAIL — the noise lines currently produce extra `to_confirm`
exercises, `"2:30"` produces a bogus "2:" exercise, and the Garmin/Hevy
patterns aren't recognized yet.

- [ ] **Step 3: Implement the noise-filtering pass and new patterns**

In `packages/connectors/src/workoutOcr.ts`, add below the existing
`stripPrefix` function (around line 42) and before `interface LineMatch`:

```ts
/** Exact-match chrome from Garmin Connect and Hevy screenshots — never exercise data. */
const NOISE_LINES = new Set([
  'Les exercices physiques',
  'Échauffement',
  'Étapes',
  'Repos',
  'Appui sur touche Lap',
  'SÉRIE',
  'POIDS ET RÉPÉTITIONS',
  "Détails de l'Entraînement",
  "Modifier l'Entraînement",
  'Voir plus',
  'Entraînement',
  'Accueil',
  'Profil',
  'HEVY',
  'Poids',
  '1RM',
]);
// Garmin's "3 sessions" / "1 série" repeat-count headers.
const GROUP_COUNT_LINE = /^\d+\s+(sessions?|séries?)$/i;
// A bare clock/duration value: status-bar clock, Garmin rest, or a cardio
// block's duration. Also fixes a real bug: "2:30" used to false-match the
// ambiguous pattern as name="2:", reps=30.
const BARE_CLOCK_LINE = /^\d{1,2}:\d{2}$/;
// Hevy's set-index/marker column ("1", "2", "W" for warm-up).
const BARE_MARKER_LINE = /^(?:[A-Za-z]{1,2}|\d{1,3})$/;

function isNoiseLine(line: string): boolean {
  if (NOISE_LINES.has(line)) return true;
  if (GROUP_COUNT_LINE.test(line)) return true;
  if (BARE_CLOCK_LINE.test(line)) return true;
  // Long, digit-free paragraph — safety net for footer disclaimers.
  if (line.length > 80 && !/\d/.test(line)) return true;
  return false;
}

/** True if `line` already carries both reps and weight on its own (no name needed). */
function isFullySelfContained(line: string): boolean {
  if (PATTERN_WEIGHT_FIRST.test(line)) return true;
  const m = PATTERN_SETS_FIRST.exec(line);
  return m != null && m[4] != null;
}

/**
 * Strips prefixes, drops chrome noise, collapses consecutive duplicate
 * lines (Hevy's scroll-ghosting artifact), and drops a bare set-index/marker
 * line when the very next line already fully explains itself (Hevy's
 * two-column set table) — without touching a bare number that legitimately
 * stands alone as a rep count.
 */
function preprocessLines(raw: string[]): string[] {
  const stripped = raw.map((l) => stripPrefix(l)).filter((l) => l.length > 0 && !isNoiseLine(l));
  const deduped: string[] = [];
  for (const l of stripped) {
    if (deduped.length > 0 && deduped[deduped.length - 1]!.toLowerCase() === l.toLowerCase()) continue;
    deduped.push(l);
  }
  const out: string[] = [];
  for (let i = 0; i < deduped.length; i += 1) {
    const line = deduped[i]!;
    const next = deduped[i + 1];
    if (BARE_MARKER_LINE.test(line) && next && isFullySelfContained(next)) continue;
    out.push(line);
  }
  return out;
}
```

Note `PATTERN_WEIGHT_FIRST`/`PATTERN_SETS_FIRST` must already be declared
above this point in the file (they are, just above `matchLine`) — if the
file's current layout has them declared *after* this insertion point,
either move this block below their declarations or hoist the two `const`
regex declarations above it; `function` declarations are hoisted but
`const` is not.

Add the Garmin reps-then-weight pattern next to the other three, just below
`PATTERN_AMBIGUOUS`'s declaration:

```ts
// Garmin: "8 répét. • 45,0 kg" — reps first, then weight, joined by a middle dot. Always a continuation (Garmin's exercise name is its own preceding line).
const PATTERN_GARMIN_REPS_WEIGHT = new RegExp(`^(\\d+)\\s*répét\\.?\\s*[•·]\\s*(\\d+(?:[.,]\\d+)?)\\s*(${UNIT})?\\s*$`, 'i');
```

In `matchLine`, insert a check for it right after the `PATTERN_SETS_FIRST`
block and before the `PATTERN_AMBIGUOUS` block (ordering matters — the
ambiguous pattern would otherwise mis-swallow this line):

```ts
  m = PATTERN_GARMIN_REPS_WEIGHT.exec(line);
  if (m) {
    const [, repsStr, weightStr, unit] = m;
    return { name: '', sets: 1, reps: parseNum(repsStr!), weightKg: toKg(parseNum(weightStr!), unit), confidence: 'high' };
  }
```

Finally, in `parseWorkoutText`, replace the current line-splitting:

```ts
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => stripPrefix(l))
    .filter((l) => l.length > 0);
```

with:

```ts
  const lines = preprocessLines(rawText.split(/\r?\n/));
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/connectors/src/workoutOcr.test.ts`
Expected: PASS — all new cases, and all 23 pre-existing ones (no
regressions).

- [ ] **Step 5: Commit**

```bash
git add packages/connectors/src/workoutOcr.ts packages/connectors/src/workoutOcr.test.ts
git commit -m "Fix OCR import noise and two parsing bugs found on real Garmin/Hevy screenshots"
```

---

### Task 3: OCR superset detection

**Files:**
- Modify: `packages/connectors/src/workoutOcr.ts`
- Test: `packages/connectors/src/workoutOcr.test.ts`

**Interfaces:**
- Consumes: `parseWorkoutText` from Task 2 (same function, extended).
- Produces: `ParsedExercise.supersetGroup?: number`.

- [ ] **Step 1: Write the failing tests**

```ts
describe('parseWorkoutText — superset grouping', () => {
  it('groups two exercises tagged by a "Superset" marker into the same group', () => {
    const text = ['Rowing Penché (Barre)', '50 kg x 8', 'Superset', 'Développé Militaire (Barre)', '25 kg x 6'].join('\n');
    const result = parseWorkoutText(text);
    expect(result.exercises).toHaveLength(2);
    const [a, b] = result.exercises;
    expect(a!.supersetGroup).toBeDefined();
    expect(a!.supersetGroup).toBe(b!.supersetGroup);
  });

  it('chains a third exercise into the same group instead of starting a new one', () => {
    const text = [
      'Rowing Penché (Barre)', '50 kg x 8',
      'Superset', 'Développé Militaire (Barre)', '25 kg x 6',
      'Superset', 'Traction', '0 kg x 6',
    ].join('\n');
    const result = parseWorkoutText(text);
    const groups = new Set(result.exercises.map((e) => e.supersetGroup));
    expect(groups.size).toBe(1);
    expect([...groups][0]).toBeDefined();
  });

  it('leaves ungrouped exercises without a supersetGroup', () => {
    const result = parseWorkoutText(['Squat arrière avec poids', '8 répét. • 45,0 kg'].join('\n'));
    expect(result.exercises[0]!.supersetGroup).toBeUndefined();
  });

  it('assigns a fresh group number to a second, unrelated superset pair', () => {
    const text = [
      'A', '10 kg x 5', 'Superset', 'B', '10 kg x 5',
      'C', '10 kg x 5', 'Superset', 'D', '10 kg x 5',
    ].join('\n');
    const result = parseWorkoutText(text);
    const byName = new Map(result.exercises.map((e) => [e.rawName, e.supersetGroup]));
    expect(byName.get('A')).toBe(byName.get('B'));
    expect(byName.get('C')).toBe(byName.get('D'));
    expect(byName.get('A')).not.toBe(byName.get('C'));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/connectors/src/workoutOcr.test.ts`
Expected: FAIL — `supersetGroup` doesn't exist yet, and the literal
`"Superset"` line currently becomes its own bogus `to_confirm` exercise.

- [ ] **Step 3: Implement**

In `packages/connectors/src/workoutOcr.ts`, add `supersetGroup?: number;` to
the `ParsedExercise` interface:

```ts
export interface ParsedExercise {
  rawName: string;
  sets: ParsedSet[];
  confidence: 'high' | 'medium' | 'to_confirm';
  supersetGroup?: number;
}
```

In `parseWorkoutText`, inside the `for (const line of rest)` loop, add a
`pendingSuperset`/`nextGroupId` pair of locals right before the loop starts,
and handle the marker line and both places a new `ParsedExercise` gets
pushed:

```ts
  const exercises: ParsedExercise[] = [];
  let pendingSuperset = false;
  let nextGroupId = 1;
  const tagSuperset = (newEx: ParsedExercise): void => {
    const prev = exercises.at(-1);
    const group = prev?.supersetGroup ?? nextGroupId++;
    if (prev && prev.supersetGroup == null) prev.supersetGroup = group;
    newEx.supersetGroup = group;
  };
  for (const line of rest) {
    if (line === 'Superset') {
      pendingSuperset = true;
      continue;
    }
    const match = matchLine(line);
    if (!match) {
      const newEx: ParsedExercise = { rawName: line, sets: [], confidence: 'to_confirm' };
      if (pendingSuperset) tagSuperset(newEx);
      pendingSuperset = false;
      exercises.push(newEx);
      continue;
    }
    const newSets: ParsedSet[] = Array.from({ length: match.sets }, () => ({ reps: match.reps, weightKg: match.weightKg }));
    if (match.name) {
      const newEx: ParsedExercise = { rawName: match.name, sets: newSets, confidence: match.confidence };
      if (pendingSuperset) tagSuperset(newEx);
      pendingSuperset = false;
      exercises.push(newEx);
    } else {
      // (unchanged continuation-line branch below)
```

Everything from `const last = exercises.at(-1);` in the existing
continuation branch onward stays exactly as it is today — only the two
`exercises.push({...})` call sites above change shape (they become a local
`newEx` variable first so `tagSuperset` can tag it before pushing).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/connectors/src/workoutOcr.test.ts`
Expected: PASS — all cases including the full pre-existing suite.

- [ ] **Step 5: Commit**

```bash
git add packages/connectors/src/workoutOcr.ts packages/connectors/src/workoutOcr.test.ts
git commit -m "Detect Hevy's Superset marker and tag grouped exercises in the OCR draft"
```

---

### Task 4: Thread `supersetGroup` through the repository layer

**Files:**
- Modify: `apps/mobile/src/lib/data/repository.ts`

**Interfaces:**
- Consumes: `SetEntry.supersetGroup` (Task 1).
- Produces: every set read from `getWorkoutSets`/`getBlockSets` now carries
  `supersetGroup`, and every set written through `addCircuitWorkout`/
  `editCircuitWorkout` persists whatever `supersetGroup` the caller supplies
  — no caller sets it yet (that starts in Task 6).

- [ ] **Step 1: Demo store — add the field to `LoggedSetRow` and every mapping site**

In `apps/mobile/src/lib/data/repository.ts`, add to `interface
LoggedSetRow` (around line 751):

```ts
interface LoggedSetRow {
  workoutId: string;
  blockId?: string;
  exerciseId: string;
  order: number;
  reps: number | null;
  weightKg: number | null;
  restSec?: number | null;
  supersetGroup?: number | null;
}
```

In the demo `getWorkoutSets` mapping (the object literal inside its
`.map((r) => ({...}))`, around line 1036), add `supersetGroup: r
.supersetGroup ?? undefined,` after `restSec: r.restSec ?? undefined,`.

In the demo `addCircuitWorkout`'s `b.sets.forEach((s) => { newSets.push({...}) })`
(around line 1076), add `supersetGroup: s.supersetGroup ?? null,` after
`restSec: s.restSec ?? null,`.

In the demo `getBlockSets` mapping (around line 1101), add the same
`supersetGroup: r.supersetGroup ?? undefined,` line as in `getWorkoutSets`.

In the demo `editCircuitWorkout`'s `b.sets.forEach((s) => { newSets.push({...}) })`
(around line 1154), add `supersetGroup: s.supersetGroup ?? null,` the same
way as `addCircuitWorkout`.

- [ ] **Step 2: Supabase store — the same four mapping sites**

In the Supabase `getWorkoutSets` mapping (around line 2426), add
`supersetGroup: r.superset_group ?? undefined,` after `weightKg: r
.weight_kg ?? undefined,` (keep it near the other optional fields, exact
position doesn't matter).

In the Supabase `addCircuitWorkout`'s `b.sets.map((s) => ({...}))` (around
line 2447), add `superset_group: s.supersetGroup ?? null,` after
`rest_sec: s.restSec ?? null,`.

In the Supabase `getBlockSets` mapping (around line 2461), add the same
`supersetGroup: r.superset_group ?? undefined,` line.

In the Supabase `editCircuitWorkout`'s `b.sets.map((s) => ({...}))` (around
line 2497), add `superset_group: s.supersetGroup ?? null,` the same way as
`addCircuitWorkout`.

- [ ] **Step 2: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/lib/data/repository.ts
git commit -m "Thread supersetGroup through the demo and Supabase set repositories"
```

---

### Task 5: Session builder — `supersetGroups` on `BlockDraft`

**Files:**
- Modify: `apps/mobile/src/features/training/sessionBuilder.ts`

**Interfaces:**
- Consumes: nothing new from earlier tasks (pure client-side draft state).
- Produces: `BlockDraft.supersetGroups: Record<string, number>`;
  `builder.groupAsSuperset(exerciseIds: string[]): void`;
  `builder.ungroup(exerciseId: string): void`. Consumed by Task 6
  (`SessionBlocksEditor`) and Task 7 (save path).

- [ ] **Step 1: Extend `BlockDraft` and `emptyBlock`**

```ts
export interface BlockDraft {
  format: BlockFormat;
  timeCapSec: string;
  targetRounds: string;
  order: string[];
  selected: Record<string, SetDraft>;
  /** exerciseId -> group number. Members are only an active superset when also adjacent in `order`. */
  supersetGroups: Record<string, number>;
}

export const emptySet = (): SetDraft => ({ reps: '', weight: '', rest: '' });
export const emptyBlock = (): BlockDraft => ({ format: 'strength', timeCapSec: '12', targetRounds: '', order: [], selected: {}, supersetGroups: {} });
```

- [ ] **Step 2: Add `groupAsSuperset`/`ungroup` to `useSessionBlocks`**

Add right after `duplicateBlock` (added earlier this session, just above
the hook's `return`):

```ts
  const groupAsSuperset = (exerciseIds: string[]): void => {
    if (exerciseIds.length < 2) return;
    const current = blocks[activeBlock]?.supersetGroups ?? {};
    const nextId = 1 + Math.max(0, ...Object.values(current));
    const patch: Record<string, number> = {};
    for (const id of exerciseIds) patch[id] = nextId;
    updateActiveBlock({ supersetGroups: { ...current, ...patch } });
  };
  const ungroup = (exerciseId: string): void => {
    const current = { ...(blocks[activeBlock]?.supersetGroups ?? {}) };
    delete current[exerciseId];
    updateActiveBlock({ supersetGroups: current });
  };
```

Add both to the hook's returned object, next to `duplicateBlock`:

```ts
    blocks, setBlocks, activeBlock, setActiveBlock, updateActiveBlock, addBlock, removeBlock, duplicateBlock, groupAsSuperset, ungroup,
```

- [ ] **Step 3: Every other block-mutating draft update must preserve `supersetGroups`**

`updateActiveBlock`, `addExercise`, `removeExercise`, `reorderExercise`
already spread `...b`/`patch` onto the existing draft object, so
`supersetGroups` survives untouched automatically — no changes needed
there. Confirm this by reading `removeExercise`: it does not delete the
removed exercise's entry from `supersetGroups`, which is fine (a stale tag
on an id no longer in `order` is simply inert — nothing reads
`supersetGroups` except by looking up an id that IS in `order`).

- [ ] **Step 4: `isSingleStrength` must also exclude a grouped single block**

Locate the field (patched earlier this session for `targetRounds`):

```ts
  const isSingleStrength = blocks.length === 1 && blocks[0]!.format === 'strength' && !blocks[0]!.targetRounds;
```

Change to also require no superset grouping:

```ts
  const isSingleStrength = blocks.length === 1 && blocks[0]!.format === 'strength' && !blocks[0]!.targetRounds && Object.keys(blocks[0]!.supersetGroups).length === 0;
```

- [ ] **Step 5: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit -p .`
Expected: errors at every other call site that builds a `BlockDraft`
literal without `supersetGroups` — this is expected and gets fixed in
Task 6's callers (`EditWorkoutScreen.tsx`, `NewWorkoutScreen.tsx`). Note
which files/lines error so Task 6 addresses all of them; do not fix them in
this task.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/features/training/sessionBuilder.ts
git commit -m "Add supersetGroups to BlockDraft plus groupAsSuperset/ungroup actions"
```

---

### Task 6: Session builder screens — fix `BlockDraft` literals, wire grouping UI

**Files:**
- Modify: `apps/mobile/src/features/training/EditWorkoutScreen.tsx`
- Modify: `apps/mobile/src/features/training/NewWorkoutScreen.tsx`
- Modify: `apps/mobile/src/features/training/SessionBlocksEditor.tsx`
- Modify: `apps/mobile/src/i18n/locales/{fr,en,es,pt,de}.json`

**Interfaces:**
- Consumes: `BlockDraft.supersetGroups`, `builder.groupAsSuperset`,
  `builder.ungroup` (Task 5).
- Produces: a manually-grouped superset in the UI, ready for Task 7 to save.

- [ ] **Step 1: Fix every `BlockDraft` literal missed by Task 5's typecheck**

In `EditWorkoutScreen.tsx`, the block built while loading an existing
workout (around line 73) and the one-block fallback (around line 96, `{
...emptyBlock(), order: nextOrder, selected: nextSelected }` — this one
already spreads `emptyBlock()` so it's fine as-is) — add `supersetGroups:
{}` to the explicit literal:

```ts
          const block: BlockDraft = {
            format: b.format,
            timeCapSec: b.timeCapSec != null ? String(b.format === 'amrap' ? Math.round(b.timeCapSec / 60) : b.timeCapSec) : '12',
            targetRounds: b.targetRounds != null ? String(b.targetRounds) : '',
            order: nextOrder,
            selected: nextSelected,
            supersetGroups: {},
          };
```

In `NewWorkoutScreen.tsx`, the "import from past workout" prefill (around
line 88):

```ts
    builder.setBlocks([{ format: 'strength', timeCapSec: '12', targetRounds: '', order: nextOrder, selected: nextSelected, supersetGroups: {} }]);
```

Note: loading an *existing* block's real `superset_group` values from the
DB back into `supersetGroups` on open (so editing a previously-saved
superset shows it grouped) is out of scope for this task/plan — both spots
above start from an empty `{}`. Flag this as a known limitation rather than
silently declaring it done; it does not block saving new supersets.

- [ ] **Step 2: Run typecheck to confirm all `BlockDraft` literal errors are gone**

Run: `cd apps/mobile && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 3: Add the grouping UI to `SessionBlocksEditor.tsx`**

Add local state near the file's other local `useState`s (`selectedOpen`,
`blocksOpen`, `addOpen` — find them near the top of the component body):

```ts
  const [selectingSuperset, setSelectingSuperset] = useState(false);
  const [pendingSuperset, setPendingSuperset] = useState<string[]>([]);
```

Reset `pendingSuperset`/`selectingSuperset` whenever the active block
changes, so a partial selection doesn't leak across blocks — add near
wherever `activeBlock` is read from `builder` (there's no existing effect
for this; add one):

```ts
  useEffect(() => {
    setSelectingSuperset(false);
    setPendingSuperset([]);
  }, [builder.activeBlock]);
```

(Add `useEffect` to the existing `import React, { useState } from 'react';`
line → `import React, { useEffect, useState } from 'react';`.)

Add a toggle button and confirm button just above the `DraggableFlatList`
(right after the `{!selectedOpen ? null : ...}` block, before `const
renderSelectedRow = ...`):

```tsx
      {selectedOpen && builder.activeOrder.length >= 2 ? (
        <View style={{ flexDirection: 'row', gap: spacing[2], alignItems: 'center' }}>
          <Pressable onPress={() => { setSelectingSuperset((v) => !v); setPendingSuperset([]); }}>
            <Text variant="caption" color="primary">
              {selectingSuperset ? t('sport.sessionBuilder.superset.cancelSelect') : t('sport.sessionBuilder.superset.startSelect')}
            </Text>
          </Pressable>
          {selectingSuperset && pendingSuperset.length >= 2 ? (
            <Pressable
              onPress={() => {
                builder.groupAsSuperset(pendingSuperset);
                setSelectingSuperset(false);
                setPendingSuperset([]);
              }}
            >
              <Text variant="caption" style={{ color: colors.accentData, fontWeight: '700' }}>
                {t('sport.sessionBuilder.superset.confirm', { count: pendingSuperset.length })}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
```

In `renderSelectedRow`, read the active block's group tag and give the row
a selection/grouped treatment. Right after `const isStrength = activeFormat
=== 'strength';`, add:

```ts
    const activeBlockDraft = builder.blocks[builder.activeBlock];
    const groupId = activeBlockDraft?.supersetGroups[exerciseId];
    const isPendingSelected = pendingSuperset.includes(exerciseId);
```

Change the row's outer `Card` to reflect a group/selection border, and add
a small badge + toggle. Replace the row's header `View` (the one containing
the drag handle, `Thumb`, name/subtitle, and the "×" remove button) so the
"×" is replaced by a selection checkbox while `selectingSuperset` is true,
and a "Superset" badge + "Dissocier" link show when `groupId != null` and
not currently selecting:

```tsx
        <Card style={{ marginBottom: spacing[2], borderColor: groupId != null ? colors.accentData : undefined, borderWidth: groupId != null ? 1.5 : undefined }} elevated>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
            <Pressable onLongPress={drag} disabled={isActive || selectingSuperset} hitSlop={10} style={{ padding: 2 }}>
              <Text style={{ fontSize: 16 }} color="textSubtle">☰</Text>
            </Pressable>
            <Thumb exercise={ex} />
            <View style={{ flex: 1 }}>
              <Text variant="subtitle">{ex.name}</Text>
              <Text variant="caption" color="textMuted">{exerciseSubtitle(ex)}</Text>
              {groupId != null && !selectingSuperset ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: 2 }}>
                  <Badge label={t('sport.sessionBuilder.superset.badge')} tone="info" />
                  <Pressable onPress={() => builder.ungroup(exerciseId)}>
                    <Text variant="caption" color="primary">{t('sport.sessionBuilder.superset.ungroup')}</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
            {selectingSuperset ? (
              <Pressable
                onPress={() => setPendingSuperset((prev) => (isPendingSelected ? prev.filter((id) => id !== exerciseId) : [...prev, exerciseId]))}
                hitSlop={8}
                style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: isPendingSelected ? colors.accentData : colors.border, backgroundColor: isPendingSelected ? colors.accentData : 'transparent', alignItems: 'center', justifyContent: 'center' }}
              >
                {isPendingSelected ? <Text style={{ color: '#04140b', fontWeight: '800', fontSize: 13 }}>✓</Text> : null}
              </Pressable>
            ) : (
              <Pressable onPress={() => builder.removeExercise(exerciseId)} hitSlop={8}>
                <Text variant="heading" style={{ color: colors.error }}>×</Text>
              </Pressable>
            )}
          </View>
```

The rest of the card (last-time hint, reps/weight/rest steppers) is
unchanged below this.

- [ ] **Step 4: Add the i18n keys**

Add to `apps/mobile/src/i18n/locales/fr.json` under
`sport.sessionBuilder`, a new `superset` object next to the existing
`block` object:

```json
"superset": {
  "startSelect": "Grouper des exercices",
  "cancelSelect": "Annuler",
  "confirm_one": "Grouper {{count}} exercice",
  "confirm_other": "Grouper {{count}} exercices",
  "badge": "Superset",
  "ungroup": "Dissocier"
}
```

Add the matching keys to `en.json`, `es.json`, `pt.json`, `de.json`:

- en: `"startSelect": "Group exercises", "cancelSelect": "Cancel", "confirm_one": "Group {{count}} exercise", "confirm_other": "Group {{count}} exercises", "badge": "Superset", "ungroup": "Ungroup"`
- es: `"startSelect": "Agrupar ejercicios", "cancelSelect": "Cancelar", "confirm_one": "Agrupar {{count}} ejercicio", "confirm_other": "Agrupar {{count}} ejercicios", "badge": "Superserie", "ungroup": "Separar"`
- pt: `"startSelect": "Agrupar exercícios", "cancelSelect": "Cancelar", "confirm_one": "Agrupar {{count}} exercício", "confirm_other": "Agrupar {{count}} exercícios", "badge": "Superserie", "ungroup": "Desagrupar"`
- de: `"startSelect": "Übungen gruppieren", "cancelSelect": "Abbrechen", "confirm_one": "{{count}} Übung gruppieren", "confirm_other": "{{count}} Übungen gruppieren", "badge": "Superset", "ungroup": "Trennen"`

Use the existing Python `json.load`/`OrderedDict`/`dump` script pattern
(see any earlier commit this session that touched these 5 files) to keep
key order stable and the diff additive-only. Verify with `git diff --stat`
that each locale file only grew.

- [ ] **Step 5: Typecheck, lint, manual smoke test**

Run: `cd apps/mobile && npx tsc --noEmit -p .` — expect no errors.
Run: `npx eslint apps/mobile/src/features/training/SessionBlocksEditor.tsx
apps/mobile/src/features/training/EditWorkoutScreen.tsx
apps/mobile/src/features/training/NewWorkoutScreen.tsx` — expect no new
errors (pre-existing unused-var warnings in these files are fine, do not
fix unrelated ones).
Start the dev server and manually verify: create a Musculation block with
3+ exercises, tap "Grouper des exercices", select 2, confirm — the two rows
get a colored border and a "Superset" badge; "Dissocier" removes it.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/features/training/EditWorkoutScreen.tsx apps/mobile/src/features/training/NewWorkoutScreen.tsx apps/mobile/src/features/training/SessionBlocksEditor.tsx apps/mobile/src/i18n/locales/*.json
git commit -m "Let a session's exercises be grouped into a superset in the block editor"
```

---

### Task 7: Save path — forward `supersetGroups` into saved sets

**Files:**
- Modify: `apps/mobile/src/features/training/NewWorkoutScreen.tsx`
- Modify: `apps/mobile/src/features/training/EditWorkoutScreen.tsx`

**Interfaces:**
- Consumes: `BlockDraft.supersetGroups` (Task 5), the repository fields
  from Task 4.
- Produces: a saved workout whose `workout_sets` rows carry the real
  `superset_group` value.

- [ ] **Step 1: `NewWorkoutScreen.tsx` submit**

In the `addCircuitWorkout.mutateAsync({...})` call's `blocks.map((b) =>
({...}))`, inside `sets: b.order.map((id, i) => {...})`, add
`supersetGroup: b.supersetGroups[id]` to the returned object, alongside the
existing `reps`/`weightKg`/`restSec` fields:

```ts
            sets: b.order.map((id, i) => {
              const s = b.selected[id]!;
              return {
                exerciseId: id,
                order: i,
                reps: s.reps ? Number(s.reps) : undefined,
                weightKg: b.format === 'strength' && s.weight ? Number(s.weight) : undefined,
                restSec: b.format === 'strength' && s.rest ? Number(s.rest) : undefined,
                supersetGroup: b.supersetGroups[id],
              };
            }),
```

(Match the exact surrounding fields already there — this plan shows the
target shape; if the real file's field list differs slightly, add
`supersetGroup: b.supersetGroups[id],` as one more line in that same
object without changing anything else.)

- [ ] **Step 2: `EditWorkoutScreen.tsx` submit**

Same change in `editCircuitWorkout.mutateAsync({...})`'s block-building
`sets: b.order.map((exerciseId, index) => {...})`.

- [ ] **Step 3: Typecheck and manual test**

Run: `cd apps/mobile && npx tsc --noEmit -p .` — expect no errors.
Manually: create a session with a grouped superset (per Task 6), save it,
open `WorkoutDetailScreen` for it (badge display isn't wired until Task 11,
so nothing visible changes yet — just confirm save succeeds without error
and the workout appears in the list).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/features/training/NewWorkoutScreen.tsx apps/mobile/src/features/training/EditWorkoutScreen.tsx
git commit -m "Save a block's superset grouping onto its sets"
```

---

### Task 8: `blockRunnerEngine.ts` — superset badge helper

**Files:**
- Modify: `apps/mobile/src/features/training/blockRunnerEngine.ts`
- Test: `apps/mobile/src/features/training/blockRunnerEngine.test.ts`

**Interfaces:**
- Produces: `supersetPartners<T>(sets: T[], index: number): string[]` —
  consumed by Task 9 (`CircuitRunnerScreen`) for the "Superset avec …"
  badge label.

- [ ] **Step 1: Write the failing test**

Add to `blockRunnerEngine.test.ts`:

```ts
describe('supersetPartners', () => {
  it('returns the other exercise ids sharing the same group', () => {
    const sets = [
      { exerciseId: 'a', supersetGroup: 1 },
      { exerciseId: 'b', supersetGroup: 1 },
      { exerciseId: 'c', supersetGroup: undefined },
    ];
    expect(supersetPartners(sets, 0)).toEqual(['b']);
    expect(supersetPartners(sets, 1)).toEqual(['a']);
    expect(supersetPartners(sets, 2)).toEqual([]);
  });

  it('deduplicates and excludes the set at index itself even if the id repeats', () => {
    const sets = [
      { exerciseId: 'a', supersetGroup: 1 },
      { exerciseId: 'a', supersetGroup: 1 },
      { exerciseId: 'b', supersetGroup: 1 },
    ];
    expect(supersetPartners(sets, 0)).toEqual(['b']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run apps/mobile/src/features/training/blockRunnerEngine.test.ts`
Expected: FAIL — `supersetPartners` is not exported yet.

- [ ] **Step 3: Implement**

Add to `blockRunnerEngine.ts`, after `formatClock`:

```ts
/** The *other* exercise ids sharing `sets[index]`'s superset group, in order, deduplicated. Empty if that set isn't grouped. */
export function supersetPartners<T extends { exerciseId: string; supersetGroup?: number }>(sets: T[], index: number): string[] {
  const group = sets[index]?.supersetGroup;
  if (group == null) return [];
  const selfId = sets[index]!.exerciseId;
  const ids = new Set<string>();
  for (const s of sets) {
    if (s.supersetGroup === group && s.exerciseId !== selfId) ids.add(s.exerciseId);
  }
  return [...ids];
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run apps/mobile/src/features/training/blockRunnerEngine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/training/blockRunnerEngine.ts apps/mobile/src/features/training/blockRunnerEngine.test.ts
git commit -m "Add supersetPartners helper for the live-runner badge label"
```

---

### Task 9: `CircuitRunnerScreen.tsx` — alternating superset execution

**Files:**
- Modify: `apps/mobile/src/features/training/CircuitRunnerScreen.tsx`
- Modify: `apps/mobile/src/i18n/locales/{fr,en,es,pt,de}.json`

**Interfaces:**
- Consumes: `supersetPartners` (Task 8), `SetEntry.supersetGroup` (via
  `useBlockSets`, already returning it since Task 4).

- [ ] **Step 1: Add the new state and derived values**

Add `stepIndex`/`restCountdown` state next to the existing `roundsCompleted`:

```ts
  const [roundsCompleted, setRoundsCompleted] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [restCountdown, setRestCountdown] = useState<number | null>(null);
```

Reset them alongside the existing per-block reset effect:

```ts
  useEffect(() => {
    setElapsedSec(0);
    setRoundsCompleted(0);
    setStepIndex(0);
    setRestCountdown(null);
  }, [activeIndex]);
```

Add the derived flag right after `isRepeatingStrength`:

```ts
  const hasSuperset = active?.format === 'strength' && sets.some((s) => s.supersetGroup != null);
```

- [ ] **Step 2: Rest countdown ticking**

Reuse the existing `tick` ref (already unused during a strength block — the
seconds-ticking effect at the top explicitly skips `format === 'strength'`)
with its own effect:

```ts
  useEffect(() => {
    if (restCountdown == null) return;
    if (restCountdown <= 0) return;
    const id = setInterval(() => setRestCountdown((s) => (s == null ? null : Math.max(0, s - 1))), 1000);
    return () => clearInterval(id);
  }, [restCountdown != null]);
```

- [ ] **Step 3: The step-advance handler**

Add right after `finishActiveBlock`'s declaration (it's used inside, so
either declare this after `finishActiveBlock` or hoist — placing it after
is simplest since `isFinished`'s effect already runs after both):

```ts
  const advanceSupersetStep = (): void => {
    if (!active) return;
    if (stepIndex + 1 < sets.length) {
      setStepIndex(stepIndex + 1);
      return;
    }
    const nextRounds = roundsCompleted + 1;
    setRoundsCompleted(nextRounds);
    setStepIndex(0);
    const target = repeatRounds ?? 1;
    if (nextRounds < target) {
      setRestCountdown(sets.at(-1)?.restSec ?? 90);
    }
  };
```

- [ ] **Step 4: Render the new branch**

Change the block-selection condition on the existing plain-strength branch
from `active.format === 'strength' && !isRepeatingStrength` to also exclude
`hasSuperset`:

```tsx
      {active.format === 'strength' && !isRepeatingStrength && !hasSuperset ? (
```

Change the repeated-strength branch's condition the same way:

```tsx
      ) : active.format === 'strength' && isRepeatingStrength && !hasSuperset ? (
```

Add the new branch right before the final timer-based `else` block (so it
sits between the two existing strength branches and the AMRAP/EMOM/for_time
one):

```tsx
      ) : active.format === 'strength' && hasSuperset ? (
        restCountdown != null ? (
          <View style={{ flex: 1, gap: spacing[4], alignItems: 'center', justifyContent: 'center' }}>
            <Text variant="caption" color="textSubtle">{t('sport.circuitRunner.superset.resting')}</Text>
            <View style={{ width: 224, height: 224, borderRadius: radii.full, borderWidth: 3, borderColor: accent, backgroundColor: `${accent}22`, alignItems: 'center', justifyContent: 'center' }}>
              <Text variant="display">{formatClock(restCountdown)}</Text>
            </View>
            <Button label={t('sport.circuitRunner.superset.skipRest')} variant="secondary" onPress={() => setRestCountdown(0)} />
          </View>
        ) : (
          <View style={{ flex: 1, gap: spacing[4] }}>
            <View style={{ alignItems: 'center', gap: spacing[3] }}>
              <Text variant="caption" color="textSubtle">
                {t('sport.circuitRunner.round', { current: Math.min(roundsCompleted + 1, repeatRounds ?? 1) })}
              </Text>
              {(() => {
                const s = sets[stepIndex];
                if (!s) return null;
                const partners = supersetPartners(sets, stepIndex);
                return (
                  <Card style={{ width: '100%' }}>
                    {partners.length > 0 ? <Badge label={t('sport.circuitRunner.superset.withPartner', { name: exerciseName(partners[0]!) })} tone="info" /> : null}
                    <Text variant="heading" style={{ marginTop: spacing[2] }}>{exerciseName(s.exerciseId)}</Text>
                    <Text variant="caption" color="textSubtle">
                      {s.reps != null ? t('sport.circuitRunner.reps', { reps: s.reps }) : '—'}{s.weightKg != null ? t('sport.circuitRunner.weightSuffix', { weight: s.weightKg }) : ''}
                    </Text>
                  </Card>
                );
              })()}
            </View>
            <View style={{ flexDirection: 'row', gap: spacing[3] }}>
              <Button label={t('sport.circuitRunner.stop')} variant="secondary" onPress={() => router.back()} />
              <Button label={t('sport.circuitRunner.superset.itemDone')} onPress={advanceSupersetStep} />
            </View>
          </View>
        )
      ) : (
```

When `restCountdown` reaches 0 — via either the ticking effect or the
"skip" button setting it to 0 directly — the rest screen must clear itself
so the next round's first item shows. Add one more small effect:

```ts
  useEffect(() => {
    if (restCountdown === 0) setRestCountdown(null);
  }, [restCountdown]);
```

Add the two new imports needed: `supersetPartners` from
`./blockRunnerEngine` (alongside the existing `computeAmrapState,
computeEmomState, computeForTimeState, formatClock` import), and
`exerciseName` is already in scope (defined earlier in the component).

- [ ] **Step 5: Add the i18n keys**

Add under `sport.circuitRunner` in `fr.json`:

```json
"superset": {
  "itemDone": "Terminé",
  "resting": "Repos",
  "skipRest": "Passer",
  "withPartner": "Superset avec {{name}}"
}
```

en: `"itemDone": "Done", "resting": "Rest", "skipRest": "Skip", "withPartner": "Superset with {{name}}"`
es: `"itemDone": "Hecho", "resting": "Descanso", "skipRest": "Saltar", "withPartner": "Superserie con {{name}}"`
pt: `"itemDone": "Concluído", "resting": "Descanso", "skipRest": "Pular", "withPartner": "Superserie com {{name}}"`
de: `"itemDone": "Fertig", "resting": "Pause", "skipRest": "Überspringen", "withPartner": "Superset mit {{name}}"`

- [ ] **Step 6: Typecheck and manual smoke test**

Run: `cd apps/mobile && npx tsc --noEmit -p .` — expect no errors.
Manually: save a session with a 2-exercise superset and `targetRounds` set
to 2+ (Task 6/7), start it live from `WorkoutDetailScreen`, step through —
confirm alternation (A → B → rest countdown → A → B), "Passer" skips the
rest, and the block completes and advances after the last round.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/features/training/CircuitRunnerScreen.tsx apps/mobile/src/i18n/locales/*.json
git commit -m "Execute a superset live as an alternating round with rest after each round"
```

---

### Task 10: `OcrImportScreen.tsx` — grouping UI and save branch

**Files:**
- Modify: `apps/mobile/src/features/sport/OcrImportScreen.tsx`
- Modify: `apps/mobile/src/i18n/locales/{fr,en,es,pt,de}.json`

**Interfaces:**
- Consumes: `ParsedExercise.supersetGroup` (Task 3),
  `useAddCircuitWorkout` (already exists — see `apps/mobile/src/lib/data
  /queries.ts:828`).

- [ ] **Step 1: Carry `supersetGroup` into `ExerciseDraft`**

```ts
interface ExerciseDraft {
  rawName: string;
  confidence: ParsedExercise['confidence'];
  sets: SetDraft[];
  exerciseId?: string;
  matchName?: string;
  pickerOpen: boolean;
  pickerQuery: string;
  supersetGroup?: number;
}
```

In `toDraft`, forward it: `supersetGroup: ex.supersetGroup,` added to the
returned object.

- [ ] **Step 2: Import `useAddCircuitWorkout` and branch the save**

```ts
import { useAddCircuitWorkout, useAddWorkout, useCustomExercises } from '@/lib/data/queries';
```

In the component body, add the hook next to the existing `addWorkout`:

```ts
  const addWorkout = useAddWorkout();
  const addCircuitWorkout = useAddCircuitWorkout();
```

Replace the `submit` function's save call. It currently builds a flat
`sets` array with a running `order` counter and calls
`addWorkout.mutateAsync`. Change it to check for any `supersetGroup` and
branch:

```ts
  const submit = async (): Promise<void> => {
    setSaveError(null);
    if (!drafts || drafts.length === 0) {
      setSaveError(t('sport.ocrImport.errors.noExercises'));
      return;
    }
    if (drafts.some((d) => !d.exerciseId)) {
      setSaveError(t('sport.ocrImport.errors.unmatchedExercises'));
      return;
    }
    let order = 0;
    const sets = drafts.flatMap((d) =>
      d.sets
        .filter((s) => s.reps.trim() || s.weight.trim())
        .map((s) => ({
          exerciseId: d.exerciseId!,
          order: order++,
          reps: s.reps.trim() ? Number(s.reps) : undefined,
          weightKg: s.weight.trim() ? Number(s.weight) : undefined,
          supersetGroup: d.supersetGroup,
        })),
    );
    if (sets.length === 0) {
      setSaveError(t('sport.ocrImport.errors.noSets'));
      return;
    }
    const sessionName = name.trim() || t('sport.ocrImport.defaultSessionName');
    try {
      if (drafts.some((d) => d.supersetGroup != null)) {
        await addCircuitWorkout.mutateAsync({ name: sessionName, blocks: [{ format: 'strength', sets }] });
      } else {
        await addWorkout.mutateAsync({ name: sessionName, sets });
      }
      router.back();
    } catch {
      setSaveError(t('sport.ocrImport.errors.saveFailed'));
    }
  };
```

Note the flat `useAddWorkout` path's `sets` shape doesn't accept
`supersetGroup` on a `NewWorkout` (it maps straight to `SetEntry` without a
`blockId`, and the migration's column exists regardless of `blockId`, so
this is harmless either way — but since the ungrouped branch never sets
`supersetGroup` on any draft, `s.supersetGroup` is always `undefined` there
in practice; leaving the field in the shared `sets` builder above, used by
both branches, is simpler than duplicating the `.map`).

Update the `isPending` check used by the Save button to cover both
mutations: find `addWorkout.isPending` in the render and change to
`(addWorkout.isPending || addCircuitWorkout.isPending)`.

- [ ] **Step 3: Show which exercises are grouped in the review list**

In the `drafts.map((d, exIndex) => {...})` render, right after the
`Badge` showing `CONFIDENCE_LABEL[d.confidence]`, add a second badge when
grouped:

```tsx
                      <Badge label={CONFIDENCE_LABEL[d.confidence]} tone={CONFIDENCE_TONE[d.confidence]} />
                      {d.supersetGroup != null ? <Badge label={t('sport.ocrImport.superset.badge')} tone="info" /> : null}
```

- [ ] **Step 4: Add the i18n key**

Add `"superset": { "badge": "Superset" }` under `sport.ocrImport` in
`fr.json`, and the same key (value `"Superset"` / `"Superserie"` following
each locale's existing `sessionBuilder.superset.badge` translation from
Task 6) in `en.json`/`es.json`/`pt.json`/`de.json`.

- [ ] **Step 5: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit -p .` — expect no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/features/sport/OcrImportScreen.tsx apps/mobile/src/i18n/locales/*.json
git commit -m "Save an OCR-detected superset through the circuit-workout path"
```

---

### Task 11: `WorkoutDetailScreen.tsx` — superset badge on saved sessions

**Files:**
- Modify: `apps/mobile/src/features/training/WorkoutDetailScreen.tsx`
- Modify: `apps/mobile/src/i18n/locales/{fr,en,es,pt,de}.json`

**Interfaces:**
- Consumes: `SetEntry.supersetGroup` (already flowing through
  `useWorkoutSets`/`useBlockSets` since Task 4), `supersetPartners` (Task
  8).

- [ ] **Step 1: Add the `supersetPartners` import**

In `WorkoutDetailScreen.tsx`, add `supersetPartners` to the existing
`blockRunnerEngine` import (if `BlockSummaryCard` doesn't already import
from there, add a new import line: `import { supersetPartners } from
'./blockRunnerEngine';`).

- [ ] **Step 2: Add the badge in `BlockSummaryCard`**

`BlockSummaryCard`'s exercise list currently renders one `Text` line per
set with no wrapper (around line 248-254):

```tsx
      <View style={{ marginTop: spacing[2], gap: spacing[1] }}>
        {sets.map((s) => (
          <Text key={s.id} variant="caption" color="textSubtle">
            {exerciseName(s.exerciseId)}{s.reps != null ? ` · ${s.reps} reps` : ''}{block.format === 'strength' && s.weightKg != null ? ` · ${s.weightKg} kg` : ''}
          </Text>
        ))}
      </View>
```

Replace it with a version that also shows the badge when that set has any
superset partners:

```tsx
      <View style={{ marginTop: spacing[2], gap: spacing[1] }}>
        {sets.map((s, i) => (
          <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
            <Text variant="caption" color="textSubtle">
              {exerciseName(s.exerciseId)}{s.reps != null ? ` · ${s.reps} reps` : ''}{block.format === 'strength' && s.weightKg != null ? ` · ${s.weightKg} kg` : ''}
            </Text>
            {supersetPartners(sets, i).length > 0 ? <Badge label={t('sport.workoutDetail.superset.badge')} tone="info" /> : null}
          </View>
        ))}
      </View>
```

`Badge` must already be imported in this file (it's used elsewhere on this
screen — confirm, and add it to the existing `@supotsu/ui` import if not).

- [ ] **Step 3: Add the i18n key**

Add `"superset": { "badge": "Superset" }` under `sport.workoutDetail` in
all 5 locale files (same value convention as Task 6/10).

- [ ] **Step 4: Typecheck and manual verification**

Run: `cd apps/mobile && npx tsc --noEmit -p .` — expect no errors.
Manually: open the detail screen for the superset session saved in Task
7/9's manual tests — confirm the badge shows on both grouped exercises.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/training/WorkoutDetailScreen.tsx apps/mobile/src/i18n/locales/*.json
git commit -m "Show a Superset badge on grouped exercises in the saved workout detail"
```

---

### Task 12: Full-suite regression pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run --passWithNoTests` from the repo root.
Expected: PASS — all pre-existing tests plus every test added in Tasks 2,
3, 8 (was 328 before this plan; expect that plus the new cases).

- [ ] **Step 2: Full typecheck**

Run: `cd apps/mobile && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 3: Lint the touched files**

Run: `npx eslint packages/connectors/src/workoutOcr.ts
apps/mobile/src/lib/data/repository.ts
apps/mobile/src/features/training/sessionBuilder.ts
apps/mobile/src/features/training/SessionBlocksEditor.tsx
apps/mobile/src/features/training/NewWorkoutScreen.tsx
apps/mobile/src/features/training/EditWorkoutScreen.tsx
apps/mobile/src/features/training/CircuitRunnerScreen.tsx
apps/mobile/src/features/training/blockRunnerEngine.ts
apps/mobile/src/features/sport/OcrImportScreen.tsx
apps/mobile/src/features/training/WorkoutDetailScreen.tsx`
Expected: no new errors (pre-existing unrelated warnings in these files are
fine — do not fix them here).

- [ ] **Step 4: No commit for this task** — it's a verification gate; if
anything fails, fix it within the task that owns the broken file and
re-run this task's checks.
