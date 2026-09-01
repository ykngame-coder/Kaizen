# Activity Muscle Tagging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user tag which muscle groups an activity worked (from its detail screen), feeding that into the same muscle-recovery engine the Récupération screen already reads, without double-counting activities that already have a matched structured strength workout.

**Architecture:** New nullable `muscles text[]` column on `activities` (+ matching `Activity.muscles?: MuscleGroup[]` core field). A new dependency-light module `apps/mobile/src/lib/data/muscleSessions.ts` turns tagged activities into `MuscleSession`s (the same shape `buildMuscleSessions` already produces from structured workouts), with an exclusion rule so an activity that already has a matched completed strength workout never double-counts. `repository.ts`'s `listMuscleSessions` (both demo and Supabase branches) concatenates both sources. `ActivityDetailScreen.tsx` gets a new inline muscle-chip card, shown only for activities without a matched workout, backed by a new `updateActivityMuscles` repo method/mutation.

**Tech Stack:** TypeScript, React Native/Expo, Supabase (Postgres + supabase-js), TanStack Query, Vitest, i18next (fr/en/es/pt/de).

**Spec:** docs/superpowers/specs/2026-09-01-activity-muscle-tagging-design.md

## Global Constraints

- No secondary-muscle tier for activity tags — one flat list, every tagged muscle at full weight (matches `primaryMuscles`, weight 1.0 in `computeMuscleStates`).
- Covers every activity type without exercise-level detail — manual or imported alike, not just imports.
- No editing of anything else about an activity (distance, calories, HR, notes) — muscles only.
- No retroactive/bulk tagging UI, no reminders/notifications.
- `apps/mobile/src/lib/data/muscleSessions.ts` must use **relative imports only** (no `@/` alias) so it stays importable from the repo's root `vitest run` — verified empirically that `repository.ts` itself cannot be (RN/Expo transitive imports + unresolved `@/` alias at the vitest root).
- New UI strings go through `t()` across all 5 locales (fr/en/es/pt/de); the rest of `ActivityDetailScreen.tsx`'s existing hardcoded French strings are left untouched (out of scope).
- Migration `supabase/migrations/0026_activity_muscles.sql` cannot be applied by the implementer — this environment has only `EXPO_PUBLIC_SUPABASE_ANON_KEY`, no service-role key. Flag this to the user same as migration 0025.

---

### Task 1: Data model — migration, core type, generated DB types

**Files:**
- Create: `supabase/migrations/0026_activity_muscles.sql`
- Modify: `packages/core/src/activity.ts`
- Modify: `packages/database/src/generated/database.types.ts` (`activities` table `Row`/`Insert`)

**Interfaces:**
- Produces: `Activity.muscles?: MuscleGroup[]` (packages/core), `Database['public']['Tables']['activities']['Row'].muscles: string[] | null` and `...['Insert'].muscles?: string[] | null` (packages/database) — Task 2 and Task 3 both read/write these.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0026_activity_muscles.sql
alter table public.activities add column muscles text[];
```

- [ ] **Step 2: Add the core field**

In `packages/core/src/activity.ts`, add the import and field:

```ts
import type { DataSource, ISODateString, OwnedEntity } from './common';
import type { MuscleGroup } from './training';
```

```ts
export interface Activity extends OwnedEntity {
  type: ActivityType;
  source: DataSource;
  startedAt: ISODateString;
  durationSec: number;
  distanceM?: number;
  calories?: number;
  intensity?: Intensity;
  avgHeartRate?: number;
  maxHeartRate?: number;
  elevationGainM?: number;
  /** Optional per-source raw payload kept for traceability (never overwritten). */
  raw?: Record<string, unknown>;
  notes?: string;
  /** Muscle groups the user says this activity worked — self-reported, only ever set for activities without exercise-level detail (see ActivityDetailScreen's matchedWorkout gate). Feeds computeMuscleStates via buildActivityMuscleSessions. */
  muscles?: MuscleGroup[];
}
```

- [ ] **Step 3: Patch the generated DB types**

In `packages/database/src/generated/database.types.ts`, find the `activities` table block (`Row`/`Insert`) and add the `muscles` field to both. The `Update` type is already `Partial<Insert>`, so it picks this up automatically — no separate edit needed there.

```ts
      activities: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          source: string;
          started_at: string;
          duration_sec: number;
          distance_m: number | null;
          calories: number | null;
          intensity: 'low' | 'moderate' | 'high' | 'max' | null;
          avg_heart_rate: number | null;
          max_heart_rate: number | null;
          elevation_gain_m: number | null;
          raw: Json | null;
          notes: string | null;
          external_id: string | null;
          muscles: string[] | null;
        } & Timestamps;
        Insert: {
          user_id: string;
          type: string;
          source?: string;
          started_at: string;
          duration_sec: number;
          distance_m?: number | null;
          calories?: number | null;
          intensity?: 'low' | 'moderate' | 'high' | 'max' | null;
          avg_heart_rate?: number | null;
          notes?: string | null;
          external_id?: string | null;
          muscles?: string[] | null;
        };
        Update: Partial<Database['public']['Tables']['activities']['Insert']>;
        Relationships: [];
      };
```

- [ ] **Step 4: Verify types compile**

Run: `cd packages/core && npx tsc --noEmit && cd ../database && npx tsc --noEmit`
Expected: no errors in either package.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0026_activity_muscles.sql packages/core/src/activity.ts packages/database/src/generated/database.types.ts
git commit -m "Add muscles column to activities (data model for muscle tagging)"
```

---

### Task 2: Repository + query layer — updateActivityMuscles

**Files:**
- Modify: `packages/database/src/repositories/activities.ts`
- Modify: `apps/mobile/src/lib/data/repository.ts` (`DataRepository` interface, demo branch, Supabase branch, `rowToActivity`)
- Modify: `apps/mobile/src/lib/data/queries.ts`

**Interfaces:**
- Consumes: `Activity.muscles?: MuscleGroup[]` and the generated DB `muscles` column from Task 1.
- Produces: `DataRepository.updateActivityMuscles(userId: string, activityId: string, muscles: MuscleGroup[]): Promise<Activity>`; `useUpdateActivityMuscles()` mutation hook (mutationFn takes `{ activityId: string; muscles: MuscleGroup[] }`) — Task 4's UI calls this hook directly.

- [ ] **Step 1: Add the Supabase repository function**

In `packages/database/src/repositories/activities.ts`, add after `insertActivity`:

```ts
/** Set (or clear) an activity's self-reported worked muscles — RLS scopes it to the owner. */
export async function updateActivityMuscles(
  client: SupotsuClient,
  activityId: string,
  muscles: string[],
): Promise<ActivityRow> {
  const { data, error } = await client
    .from('activities')
    .update({ muscles })
    .eq('id', activityId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}
```

- [ ] **Step 2: Wire it into `apps/mobile/src/lib/data/repository.ts`**

Add the import alongside the existing activity imports (near `insertActivity, upsertActivities, listActivities as listActivitiesDb, deleteActivity as deleteActivityDb,`):

```ts
  insertActivity,
  upsertActivities,
  listActivities as listActivitiesDb,
  updateActivityMuscles as updateActivityMusclesDb,
  deleteActivity as deleteActivityDb,
```

Add to the `DataRepository` interface, right after `addActivity`:

```ts
  listActivities(userId: string): Promise<Activity[]>;
  addActivity(userId: string, input: ActivityInput): Promise<Activity>;
  /** Set (or clear) an activity's self-reported worked muscles. */
  updateActivityMuscles(userId: string, activityId: string, muscles: MuscleGroup[]): Promise<Activity>;
  /** Remove a logged/imported activity (e.g. a duplicate or unwanted import). */
  deleteActivity(userId: string, activityId: string): Promise<void>;
```

Add `muscles: r.muscles ?? undefined,` to `rowToActivity` (right after `notes: r.notes ?? undefined,`):

```ts
function rowToActivity(r: ActivityRow): Activity {
  return {
    id: r.id,
    userId: r.user_id,
    type: r.type as Activity['type'],
    source: r.source as Activity['source'],
    startedAt: r.started_at,
    durationSec: r.duration_sec,
    distanceM: r.distance_m ?? undefined,
    calories: r.calories ?? undefined,
    intensity: r.intensity ?? undefined,
    avgHeartRate: r.avg_heart_rate ?? undefined,
    maxHeartRate: r.max_heart_rate ?? undefined,
    notes: r.notes ?? undefined,
    muscles: (r.muscles as MuscleGroup[] | null) ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
```

Add to the demo branch (`createDemoRepository`), right after `addActivity` and before `deleteActivity`:

```ts
    async updateActivityMuscles(userId, activityId, muscles) {
      const items = await readJson<Activity>(actKey(userId));
      let updated: Activity | undefined;
      const now = new Date().toISOString();
      const next = items.map((a) => {
        if (a.id !== activityId) return a;
        updated = { ...a, muscles, updatedAt: now };
        return updated;
      });
      if (!updated) throw new Error('Activité introuvable.');
      await writeJson(actKey(userId), next);
      return updated;
    },
```

Add to the Supabase branch (`createSupabaseRepository`), right after `addActivity` and before `deleteActivity`:

```ts
    async updateActivityMuscles(_userId, activityId, muscles) {
      return rowToActivity(await updateActivityMusclesDb(client, activityId, muscles));
    },
```

- [ ] **Step 3: Add the mutation hook**

In `apps/mobile/src/lib/data/queries.ts`, add `MuscleGroup` to the existing `@supotsu/core` type import:

```ts
import type { Challenge, GoalType, MuscleGroup, SetEntry, Visibility, Workout } from '@supotsu/core';
```

Add the hook after `useAddActivity` and before `useDeleteActivity`:

```ts
/** Set (or clear) an activity's self-reported worked muscles. */
export function useUpdateActivityMuscles() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { activityId: string; muscles: MuscleGroup[] }) => repo.updateActivityMuscles(user!.id, input.activityId, input.muscles),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activities', user?.id] });
    },
  });
}
```

- [ ] **Step 4: Verify types compile**

Run: `cd packages/database && npx tsc --noEmit && cd ../../apps/mobile && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/database/src/repositories/activities.ts apps/mobile/src/lib/data/repository.ts apps/mobile/src/lib/data/queries.ts
git commit -m "Add updateActivityMuscles repository method and mutation hook"
```

---

### Task 3: Engine integration — buildActivityMuscleSessions

**Files:**
- Create: `apps/mobile/src/lib/data/muscleSessions.ts`
- Test: `apps/mobile/src/lib/data/muscleSessions.test.ts`
- Modify: `apps/mobile/src/lib/data/repository.ts` (`listMuscleSessions`, both branches)

**Interfaces:**
- Consumes: `Activity.muscles?: MuscleGroup[]` (Task 1), `Workout.status`/`Workout.completedAt` (existing, unchanged), `localDateKey` (existing, from `apps/mobile/src/features/community/leaderboardHelpers.ts`).
- Produces: `buildActivityMuscleSessions(activities: Activity[], workouts: Workout[]): MuscleSession[]` — the demo and Supabase branches of `listMuscleSessions` both call this and concatenate its output with `buildMuscleSessions(...)`.

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/src/lib/data/muscleSessions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Activity, Workout } from '@supotsu/core';
import { buildActivityMuscleSessions } from './muscleSessions';

const baseActivity: Activity = {
  id: 'a1',
  userId: 'u1',
  type: 'cross_training',
  source: 'manual',
  startedAt: '2026-08-30T10:00:00.000Z',
  durationSec: 900,
  createdAt: '2026-08-30T10:00:00.000Z',
  updatedAt: '2026-08-30T10:00:00.000Z',
};

const baseWorkout: Workout = {
  id: 'w1',
  userId: 'u1',
  name: 'Musculation',
  status: 'completed',
  completedAt: '2026-08-30T18:00:00.000Z',
  createdAt: '2026-08-30T18:00:00.000Z',
  updatedAt: '2026-08-30T18:00:00.000Z',
};

describe('buildActivityMuscleSessions', () => {
  it('emits one session per tagged activity with no matched workout', () => {
    const activity: Activity = { ...baseActivity, muscles: ['chest', 'triceps'] };
    const out = buildActivityMuscleSessions([activity], []);
    expect(out).toEqual([
      { trainedAt: activity.startedAt, primaryMuscles: ['chest', 'triceps'], secondaryMuscles: [], recovery: false },
    ]);
  });

  it('skips an untagged activity', () => {
    const out = buildActivityMuscleSessions([baseActivity], []);
    expect(out).toEqual([]);
  });

  it('skips an activity tagged with an empty muscle list', () => {
    const activity: Activity = { ...baseActivity, muscles: [] };
    const out = buildActivityMuscleSessions([activity], []);
    expect(out).toEqual([]);
  });

  it('skips a strength activity that already has a matched completed workout the same day', () => {
    const activity: Activity = { ...baseActivity, type: 'strength', startedAt: '2026-08-30T09:00:00.000Z', muscles: ['back'] };
    const out = buildActivityMuscleSessions([activity], [baseWorkout]);
    expect(out).toEqual([]);
  });

  it('does not skip a strength activity when the matched workout is a different day', () => {
    const activity: Activity = { ...baseActivity, type: 'strength', startedAt: '2026-08-29T09:00:00.000Z', muscles: ['back'] };
    const out = buildActivityMuscleSessions([activity], [baseWorkout]);
    expect(out).toHaveLength(1);
  });

  it('does not skip a non-strength activity even with a same-day completed workout', () => {
    const activity: Activity = { ...baseActivity, type: 'cross_training', startedAt: '2026-08-30T09:00:00.000Z', muscles: ['back'] };
    const out = buildActivityMuscleSessions([activity], [baseWorkout]);
    expect(out).toHaveLength(1);
  });

  it('marks mobility/yoga activities as recovery sessions', () => {
    const mobility: Activity = { ...baseActivity, type: 'mobility', muscles: ['core'] };
    const yoga: Activity = { ...baseActivity, type: 'yoga', muscles: ['core'] };
    const [m, y] = buildActivityMuscleSessions([mobility, yoga], []);
    expect(m?.recovery).toBe(true);
    expect(y?.recovery).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/mobile/src/lib/data/muscleSessions.test.ts`
Expected: FAIL — `Failed to resolve import "./muscleSessions"` (the module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `apps/mobile/src/lib/data/muscleSessions.ts`:

```ts
import type { Activity, Workout } from '@supotsu/core';
import type { MuscleSession } from '@supotsu/engines';
import { localDateKey } from '../../features/community/leaderboardHelpers';

/**
 * Same "does this activity already have a matched structured workout" check
 * ActivityDetailScreen uses to decide whether to show its own exercise
 * breakdown — reused here so a tagged activity is never double-counted
 * against the workout that already feeds buildMuscleSessions (in
 * repository.ts) with real exercise-level muscle data.
 */
function hasMatchedWorkout(activity: Activity, workouts: Workout[]): boolean {
  if (activity.type !== 'strength') return false;
  const key = localDateKey(new Date(activity.startedAt));
  return workouts.some((w) => w.status === 'completed' && w.completedAt && localDateKey(new Date(w.completedAt)) === key);
}

/**
 * One MuscleSession per tagged activity that isn't already covered by a
 * matched structured workout. Mobility/yoga activities ease fatigue instead
 * of adding it, same treatment structured mobility exercises already get
 * (see buildMuscleSessions' isMobility handling in repository.ts).
 */
export function buildActivityMuscleSessions(activities: Activity[], workouts: Workout[]): MuscleSession[] {
  const out: MuscleSession[] = [];
  for (const a of activities) {
    if (!a.muscles || a.muscles.length === 0) continue;
    if (hasMatchedWorkout(a, workouts)) continue;
    out.push({
      trainedAt: a.startedAt,
      primaryMuscles: a.muscles,
      secondaryMuscles: [],
      recovery: a.type === 'mobility' || a.type === 'yoga',
    });
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/mobile/src/lib/data/muscleSessions.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Wire it into `listMuscleSessions` (demo branch)**

In `apps/mobile/src/lib/data/repository.ts`, add the import near the top (alongside other local imports, e.g. next to the `localDateKey` import from leaderboardHelpers):

```ts
import { buildActivityMuscleSessions } from './muscleSessions';
```

Replace the demo `listMuscleSessions` (currently):

```ts
    async listMuscleSessions(userId) {
      const rows = await readJson<LoggedSetRow & { date: string }>(setKey(userId));
      const dates = new Map(rows.map((r) => [r.workoutId, r.date]));
      return buildMuscleSessions(dates, rows);
    },
```

with:

```ts
    async listMuscleSessions(userId) {
      const rows = await readJson<LoggedSetRow & { date: string }>(setKey(userId));
      const dates = new Map(rows.map((r) => [r.workoutId, r.date]));
      const activities = await readJson<Activity>(actKey(userId));
      const workouts = await readJson<Workout>(wkKey(userId));
      return [...buildMuscleSessions(dates, rows), ...buildActivityMuscleSessions(activities, workouts)];
    },
```

- [ ] **Step 6: Wire it into `listMuscleSessions` (Supabase branch)**

Replace the Supabase `listMuscleSessions` (currently):

```ts
    async listMuscleSessions(userId) {
      const workouts = await listWorkoutsDb(client, userId);
      const dates = new Map(workouts.map((w) => [w.id, w.completed_at ?? w.created_at]));
      const sets = await listWorkoutSetsForUser(client, userId);
      return buildMuscleSessions(dates, sets);
    },
```

with:

```ts
    async listMuscleSessions(userId) {
      const workoutRows = await listWorkoutsDb(client, userId);
      const dates = new Map(workoutRows.map((w) => [w.id, w.completed_at ?? w.created_at]));
      const sets = await listWorkoutSetsForUser(client, userId);
      const activities = (await listActivitiesDb(client, userId)).map(rowToActivity);
      const workouts = workoutRows.map(rowToWorkout);
      return [...buildMuscleSessions(dates, sets), ...buildActivityMuscleSessions(activities, workouts)];
    },
```

- [ ] **Step 7: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass, including the 7 new ones and the pre-existing 342.

- [ ] **Step 8: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/src/lib/data/muscleSessions.ts apps/mobile/src/lib/data/muscleSessions.test.ts apps/mobile/src/lib/data/repository.ts
git commit -m "Feed tagged-activity muscle sessions into the recovery engine"
```

---

### Task 4: UI — ActivityDetailScreen muscle-tag card

**Files:**
- Modify: `apps/mobile/src/features/activities/ActivityDetailScreen.tsx`
- Modify: `apps/mobile/src/i18n/locales/fr.json`, `en.json`, `es.json`, `pt.json`, `de.json`

**Interfaces:**
- Consumes: `useUpdateActivityMuscles()` (Task 2), `MUSCLE_LABEL` (existing export from `apps/mobile/src/features/exercises/catalog.ts`), `FilterChip` (existing export from `@supotsu/ui`).

- [ ] **Step 1: Add the i18n keys (all 5 locales)**

Add a new `sport.activityDetail.muscles` namespace to each locale file. French (`fr.json`), under `sport` (new top-level `activityDetail` key, sibling of `muscles`/`goals`/etc.):

```json
"activityDetail": {
  "muscles": {
    "heading": "Muscles travaillés",
    "hint": "Indique quels muscles cette activité a sollicités pour qu'elle compte dans ta récupération.",
    "save": "Enregistrer",
    "saved": "Enregistré"
  }
}
```

English (`en.json`):

```json
"activityDetail": {
  "muscles": {
    "heading": "Muscles worked",
    "hint": "Tell us which muscles this activity worked so it counts toward your recovery.",
    "save": "Save",
    "saved": "Saved"
  }
}
```

Spanish (`es.json`):

```json
"activityDetail": {
  "muscles": {
    "heading": "Músculos trabajados",
    "hint": "Indica qué músculos trabajó esta actividad para que cuente en tu recuperación.",
    "save": "Guardar",
    "saved": "Guardado"
  }
}
```

Portuguese (`pt.json`):

```json
"activityDetail": {
  "muscles": {
    "heading": "Músculos trabalhados",
    "hint": "Indica que músculos esta atividade trabalhou para que conte na tua recuperação.",
    "save": "Guardar",
    "saved": "Guardado"
  }
}
```

German (`de.json`):

```json
"activityDetail": {
  "muscles": {
    "heading": "Beanspruchte Muskeln",
    "hint": "Gib an, welche Muskeln diese Aktivität beansprucht hat, damit sie in deiner Erholung zählt.",
    "save": "Speichern",
    "saved": "Gespeichert"
  }
}
```

Insert each block as a new key under `"sport": { ... }` in the respective file (e.g. right after the closing brace of the existing `"muscles"` entry under `sport`, before the next sibling key — exact position doesn't matter for JSON validity, only that it's a direct child of `sport`). Verify each file stays valid JSON after editing:

```bash
cd apps/mobile/src/i18n/locales && for f in fr en es pt de; do python3 -c "import json; json.load(open('$f.json')); print('$f OK')"; done
```

- [ ] **Step 2: Add the muscle-picker imports and state**

In `apps/mobile/src/features/activities/ActivityDetailScreen.tsx`, update the imports:

```ts
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Card, EmptyState, FilterChip, Icon, Screen, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { MuscleGroup } from '@supotsu/core';
import { EXERCISE_LIBRARY } from '@supotsu/shared';
import { EXERCISES, MUSCLE_LABEL } from '@/features/exercises/catalog';
import { BackButton } from '@/features/navigation/BackButton';
import { useActivities, useCustomExercises, useDeleteActivity, useUpdateActivityMuscles, useWorkoutBlocks, useWorkoutSets, useWorkouts } from '@/lib/data/queries';
import { activityLabel, formatDate, formatDistance, formatDuration } from '@/lib/format';
import { BlockSummaryCard } from '@/features/training/WorkoutDetailScreen';

const MUSCLES: MuscleGroup[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core', 'full_body'];
```

(`EXERCISE_LIBRARY` stays as-is — only add `FilterChip` to the `@supotsu/ui` import, add the `MuscleGroup` type import, add `MUSCLE_LABEL` alongside the existing `EXERCISES` import from the catalog module, add `useUpdateActivityMuscles` to the queries import, and add the new local `MUSCLES` const.)

Inside the component, after the existing `const [confirmingDelete, setConfirmingDelete] = useState(false);` line, add:

```ts
  const updateActivityMuscles = useUpdateActivityMuscles();
  const [selectedMuscles, setSelectedMuscles] = useState<MuscleGroup[] | null>(null);
  const [musclesSaved, setMusclesSaved] = useState(false);
```

`selectedMuscles` starts `null` so the chip row can be seeded from `activity.muscles` the first time `activity` loads, without fighting the user's in-progress selection on every re-render — seed it right after the existing `const activity = useMemo(...)` block:

```ts
  const activity = useMemo(() => activities.find((a) => a.id === id), [activities, id]);
  const musclesValue = selectedMuscles ?? activity?.muscles ?? [];
```

- [ ] **Step 3: Add the toggle handler and save handler**

Right after `const onDelete = async (): Promise<void> => { ... };`, add:

```ts
  const toggleMuscle = (m: MuscleGroup): void => {
    const current = musclesValue;
    setSelectedMuscles(current.includes(m) ? current.filter((x) => x !== m) : [...current, m]);
    setMusclesSaved(false);
  };

  const onSaveMuscles = async (): Promise<void> => {
    if (!activity) return;
    await updateActivityMuscles.mutateAsync({ activityId: activity.id, muscles: musclesValue });
    setMusclesSaved(true);
  };
```

- [ ] **Step 4: Render the card**

Insert the new card right after the existing Notes card block and before the `{matchedWorkout && blocks.length > 0 ? (` block:

```tsx
      {!matchedWorkout ? (
        <Card>
          <Text variant="heading">{t('sport.activityDetail.muscles.heading')}</Text>
          <Text variant="caption" color="textMuted" style={{ marginTop: spacing[1] }}>
            {t('sport.activityDetail.muscles.hint')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[3] }}>
            {MUSCLES.map((m) => (
              <FilterChip key={m} label={MUSCLE_LABEL[m]} active={musclesValue.includes(m)} onPress={() => toggleMuscle(m)} />
            ))}
          </View>
          <View style={{ alignItems: 'flex-start', marginTop: spacing[3] }}>
            <Button
              label={updateActivityMuscles.isPending ? '…' : musclesSaved ? t('sport.activityDetail.muscles.saved') : t('sport.activityDetail.muscles.save')}
              onPress={onSaveMuscles}
              disabled={updateActivityMuscles.isPending}
            />
          </View>
        </Card>
      ) : null}

```

This screen doesn't use `useTranslation` today — add it:

```ts
export function ActivityDetailScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
```

- [ ] **Step 5: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Lint**

Run: `npx eslint apps/mobile/src/features/activities/ActivityDetailScreen.tsx --ext .ts,.tsx`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/features/activities/ActivityDetailScreen.tsx apps/mobile/src/i18n/locales/fr.json apps/mobile/src/i18n/locales/en.json apps/mobile/src/i18n/locales/es.json apps/mobile/src/i18n/locales/pt.json apps/mobile/src/i18n/locales/de.json
git commit -m "Add muscle-tagging card to ActivityDetailScreen"
```

---

### Task 5: Full regression + finish

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (342 pre-existing + 7 new `muscleSessions.test.ts` = 349).

- [ ] **Step 2: Typecheck every touched package**

Run:
```bash
cd packages/core && npx tsc --noEmit
cd ../database && npx tsc --noEmit
cd ../../apps/mobile && npx tsc --noEmit -p tsconfig.json
```
Expected: no errors in any of the three.

- [ ] **Step 3: Lint the touched app files**

Run: `npx eslint apps/mobile/src/features/activities apps/mobile/src/lib/data --ext .ts,.tsx`
Expected: no errors.

- [ ] **Step 4: Remind the user about the pending migrations**

Both `supabase/migrations/0025_workout_set_supersets.sql` and `0026_activity_muscles.sql` still need to be applied manually to the live Supabase database (this environment has no service-role key) — flag this explicitly when reporting completion.
