# Lot 2a — Runner force

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** transformer le suivi d'une séance de musculation en compagnon actif —
cocher ses séries, saisir le réalisé, repos automatique, reprise après
fermeture — et afficher l'adhésion au plan une fois la séance finie.

**Architecture :** la logique décisionnelle sort des composants dans un module
pur testé (`runnerState.ts`) ; les données de série partent en base à chaque
validation via de nouvelles méthodes de repository ; seul l'état de minuteur
vit en local (`runStore.ts`). Les chronos sont ancrés sur `Date.now()` et non
sur un compteur de ticks.

**Tech Stack :** TypeScript, React Native/Expo, TanStack Query, Supabase, Vitest.

**Spec :** `docs/superpowers/specs/2026-09-05-runner-lot2-design.md`

## Global Constraints

- `planned_*` n'est **jamais** réécrit par le runner. Seuls `reps`,
  `weight_kg`, `rpe`, `rir`, `completed_at` changent après création.
- Les minuteurs stockent un instant de référence (`Date.now()`), jamais un
  compteur incrémenté par `setInterval` : iOS suspend les timers en arrière-plan.
- Toute chaîne visible passe par `t()` et est remplie dans fr/en/es/pt/de.
- La logique testable vit dans `runnerState.ts`, pas dans les composants
  (aucune infra de test de rendu dans le repo, et en ajouter n'est pas au périmètre).
- Le dépôt démo synthétise les ids de série (`${workoutId}-${order}`) : toute
  méthode adressant une série doit accepter ce format hérité (tâche 3).
- Branche `claude/spot-wellness-app-r6l5bj`, `git pull --rebase` avant push.
- Vérification après chaque tâche : `npx vitest run` à la racine +
  `npx tsc --noEmit` sur les packages touchés.

---

### Task 1 : Logique pure du runner

**Files:**
- Create: `apps/mobile/src/features/training/runnerState.ts`
- Create: `apps/mobile/src/features/training/runnerState.test.ts`

**Interfaces:**
- Consumes: `SetEntry` (`@supotsu/core`), `warmupRamp` (`@supotsu/engines`).
- Produces: `buildRunProgress`, `restRemainingSec`, `warmupProposal`,
  `adherenceTone`. Consommés par les tâches 6 à 9.

- [ ] **Step 1 : écrire le test qui échoue**

Créer `apps/mobile/src/features/training/runnerState.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import type { SetEntry } from '@supotsu/core';
import { adherenceTone, buildRunProgress, restRemainingSec, warmupProposal } from './runnerState';

const DONE = '2026-09-05T10:00:00.000Z';
const s = (over: Partial<SetEntry>): SetEntry => ({
  id: 'id',
  workoutId: 'w1',
  exerciseId: 'bench',
  order: 0,
  ...over,
});

describe('buildRunProgress', () => {
  it('désigne la première série non faite comme active', () => {
    const sets = [
      s({ id: 'a', order: 0, completedAt: DONE }),
      s({ id: 'b', order: 1 }),
      s({ id: 'c', order: 2 }),
    ];
    const p = buildRunProgress(sets);
    expect(p.activeSetId).toBe('b');
    expect(p.doneCount).toBe(1);
    expect(p.totalCount).toBe(3);
  });

  it('trie par ordre avant de décider', () => {
    const sets = [s({ id: 'b', order: 1 }), s({ id: 'a', order: 0, completedAt: DONE })];
    expect(buildRunProgress(sets).activeSetId).toBe('b');
  });

  it('nomme le prochain exercice différent', () => {
    const sets = [
      s({ id: 'a', order: 0, exerciseId: 'bench' }),
      s({ id: 'b', order: 1, exerciseId: 'bench' }),
      s({ id: 'c', order: 2, exerciseId: 'row' }),
    ];
    expect(buildRunProgress(sets).nextExerciseId).toBe('row');
  });

  it('ne renvoie aucun prochain exercice sur le dernier', () => {
    const sets = [s({ id: 'a', order: 0, exerciseId: 'bench' })];
    expect(buildRunProgress(sets).nextExerciseId).toBeUndefined();
  });

  it('signale une séance terminée', () => {
    const sets = [s({ id: 'a', order: 0, completedAt: DONE })];
    const p = buildRunProgress(sets);
    expect(p.activeSetId).toBeUndefined();
    expect(p.isFinished).toBe(true);
  });

  it('compte les séries de l’exercice actif hors échauffement', () => {
    const sets = [
      s({ id: 'w', order: 0, isWarmup: true, completedAt: DONE }),
      s({ id: 'a', order: 1, completedAt: DONE }),
      s({ id: 'b', order: 2 }),
    ];
    const p = buildRunProgress(sets);
    expect(p.activeSetIndexInExercise).toBe(1);
    expect(p.workingSetsInExercise).toBe(2);
  });
});

describe('restRemainingSec', () => {
  it('compte le temps restant jusqu’à l’instant de fin', () => {
    expect(restRemainingSec(10_000, 4_000)).toBe(6);
  });

  it('rend zéro une fois l’échéance passée, même longtemps après', () => {
    // Retour d'arrière-plan bien après la fin du repos : jamais de négatif.
    expect(restRemainingSec(10_000, 999_000)).toBe(0);
  });

  it('rend zéro sans repos en cours', () => {
    expect(restRemainingSec(undefined, 4_000)).toBe(0);
  });
});

describe('warmupProposal', () => {
  it('propose une rampe sur une première série de travail chargée', () => {
    const ramp = warmupProposal({ workKg: 100, workReps: 8, barWeightKg: 20 });
    expect(ramp.length).toBeGreaterThan(0);
    expect(ramp.every((w) => w.weightKg >= 20)).toBe(true);
  });

  it('écarte les marches plus légères que la barre', () => {
    // 40 % de 40 kg = 16 kg, sous une barre de 20 kg : marche retirée.
    const ramp = warmupProposal({ workKg: 40, workReps: 8, barWeightKg: 20 });
    expect(ramp.every((w) => w.weightKg >= 20)).toBe(true);
    expect(ramp.length).toBeLessThan(3);
  });

  it('ne propose rien sans charge de travail', () => {
    expect(warmupProposal({ workKg: undefined, workReps: 8, barWeightKg: 20 })).toEqual([]);
  });
});

describe('adherenceTone', () => {
  it('classe aux bornes 90 % et 70 %', () => {
    expect(adherenceTone(0.9)).toBe('success');
    expect(adherenceTone(0.89)).toBe('neutral');
    expect(adherenceTone(0.7)).toBe('neutral');
    expect(adherenceTone(0.69)).toBe('warning');
  });

  it('traite un dépassement comme un succès', () => {
    expect(adherenceTone(1.2)).toBe('success');
  });
});
```

- [ ] **Step 2 : lancer le test, vérifier qu'il échoue**

Run: `npx vitest run apps/mobile/src/features/training/runnerState.test.ts`
Expected: FAIL — `Failed to resolve import "./runnerState"`.

- [ ] **Step 3 : écrire l'implémentation**

Créer `apps/mobile/src/features/training/runnerState.ts` :

```ts
import type { SetEntry } from '@supotsu/core';
import { warmupRamp, type WarmupSet } from '@supotsu/engines';

/**
 * Logique du runner, hors composants (Lot 2a). Tout ce qui décide « où en
 * est-on » vit ici pour être testable : les écrans ne font que rendre.
 */

export interface RunProgress {
  /** Série à faire maintenant — absente quand tout est terminé. */
  activeSetId?: string;
  /** Exercice de la série active. */
  activeExerciseId?: string;
  /** Rang de la série active parmi les séries de travail de son exercice (0-based). */
  activeSetIndexInExercise: number;
  /** Nombre de séries de travail de l'exercice actif. */
  workingSetsInExercise: number;
  /** Premier exercice différent après l'actif, pour l'aperçu « Prochain ». */
  nextExerciseId?: string;
  doneCount: number;
  totalCount: number;
  isFinished: boolean;
}

/**
 * Reconstruit la progression à partir des seules séries. C'est ce qui permet
 * de reprendre une séance même si l'état local a disparu : `completedAt` en
 * base est la source de vérité, le store local n'est qu'un confort.
 */
export function buildRunProgress(sets: SetEntry[]): RunProgress {
  const ordered = [...sets].sort((a, b) => a.order - b.order);
  const active = ordered.find((s) => !s.completedAt);
  const doneCount = ordered.filter((s) => s.completedAt).length;

  const activeExerciseId = active?.exerciseId;
  const working = ordered.filter((s) => s.exerciseId === activeExerciseId && !s.isWarmup);

  return {
    activeSetId: active?.id,
    activeExerciseId,
    activeSetIndexInExercise: active ? Math.max(0, working.findIndex((s) => s.id === active.id)) : 0,
    workingSetsInExercise: working.length,
    nextExerciseId: active
      ? ordered.slice(ordered.indexOf(active) + 1).find((s) => s.exerciseId !== activeExerciseId)?.exerciseId
      : undefined,
    doneCount,
    totalCount: ordered.length,
    isFinished: active === undefined && ordered.length > 0,
  };
}

/**
 * Secondes de repos restantes, calculées par différence d'horloge plutôt que
 * par décrément : iOS suspend les timers en arrière-plan, un compteur
 * incrémenté prendrait du retard sans le signaler.
 */
export function restRemainingSec(restEndsAtMs: number | undefined, nowMs: number): number {
  if (restEndsAtMs === undefined) return 0;
  return Math.max(0, Math.ceil((restEndsAtMs - nowMs) / 1000));
}

export interface WarmupProposalInput {
  workKg?: number;
  workReps?: number;
  barWeightKg: number;
}

/**
 * Rampe d'échauffement retenue pour une série de travail : le moteur ignore le
 * matériel, c'est ici qu'on écarte les marches plus légères que la barre à vide
 * (les charger est impossible).
 */
export function warmupProposal({ workKg, workReps, barWeightKg }: WarmupProposalInput): WarmupSet[] {
  if (!workKg || workKg <= 0) return [];
  return warmupRamp(workKg, workReps ?? 1).filter((w) => w.weightKg >= barWeightKg);
}

export type AdherenceTone = 'success' | 'neutral' | 'warning';

/**
 * Tonalité du badge d'adhésion. Un dépassement est un succès : faire plus que
 * prévu n'est pas un échec.
 */
export function adherenceTone(ratio: number): AdherenceTone {
  if (ratio >= 0.9) return 'success';
  if (ratio >= 0.7) return 'neutral';
  return 'warning';
}
```

- [ ] **Step 4 : lancer le test, vérifier qu'il passe**

Run: `npx vitest run apps/mobile/src/features/training/runnerState.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 5 : vérifier et committer**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json && cd ../.. && npx vitest run`

```bash
git add apps/mobile/src/features/training/runnerState.ts apps/mobile/src/features/training/runnerState.test.ts
git commit -m "Add pure runner-state logic"
```

---

### Task 2 : Store local d'état de run

**Files:**
- Create: `apps/mobile/src/features/training/runStore.ts`

**Interfaces:**
- Produces: `loadRunState`, `saveRunState`, `clearRunState`, type `RunState`.
  Consommés par les tâches 6 et 8.

- [ ] **Step 1 : écrire le module**

Créer `apps/mobile/src/features/training/runStore.ts` :

```ts
import { secureStorage } from '@/lib/secure-storage';

/**
 * État d'écran d'une séance en cours (Lot 2a). Volontairement limité aux
 * minuteurs : ce qui a réellement été fait vit en base (`completedAt` sur
 * chaque série), pas ici. Perdre ce store ne perd donc jamais une performance,
 * seulement le chrono — la reprise se reconstruit depuis les séries.
 */
export interface RunState {
  /** Instant de démarrage du chrono de séance. */
  startedAtMs: number;
  /** Échéance du repos en cours, absente si aucun repos ne tourne. */
  restEndsAtMs?: number;
  /** Bloc actif, pour les séances multi-blocs. */
  activeBlockIndex: number;
}

const key = (workoutId: string): string => `supotsu.runState.${workoutId}`;

export async function loadRunState(workoutId: string): Promise<RunState | null> {
  const raw = await secureStorage.getItem(key(workoutId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<RunState>;
    if (typeof parsed.startedAtMs !== 'number') return null;
    return {
      startedAtMs: parsed.startedAtMs,
      restEndsAtMs: typeof parsed.restEndsAtMs === 'number' ? parsed.restEndsAtMs : undefined,
      activeBlockIndex: typeof parsed.activeBlockIndex === 'number' ? parsed.activeBlockIndex : 0,
    };
  } catch {
    // État corrompu : on repart d'un chrono neuf plutôt que de bloquer la séance.
    return null;
  }
}

export async function saveRunState(workoutId: string, state: RunState): Promise<void> {
  await secureStorage.setItem(key(workoutId), JSON.stringify(state));
}

export async function clearRunState(workoutId: string): Promise<void> {
  await secureStorage.removeItem(key(workoutId));
}
```

- [ ] **Step 2 : vérifier que `removeItem` existe**

Run: `grep -n "removeItem" apps/mobile/src/lib/secure-storage.ts`
Expected: la méthode existe. Si elle n'existe pas, l'ajouter en suivant le
style des méthodes voisines (`getItem`/`setItem`) plutôt que d'écrire une
chaîne vide à la place — signaler ce cas dans le rapport de tâche.

- [ ] **Step 3 : vérifier et committer**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json && cd ../.. && npx vitest run`

```bash
git add apps/mobile/src/features/training/runStore.ts
git commit -m "Add local run-state store for runner timers"
```

---

### Task 3 : Couche base de données — mutations de série

**Files:**
- Modify: `packages/database/src/repositories/workouts.ts`

**Interfaces:**
- Produces: `updateSetLog`, `clearSetLog`, `insertWorkoutSets`. Consommés par
  la tâche 4.

- [ ] **Step 1 : ajouter les trois fonctions**

Dans `packages/database/src/repositories/workouts.ts`, ajouter à la fin du
fichier :

```ts
/** What the user actually did on one set. Never touches planned_reps/planned_weight_kg. */
export interface SetLogPatch {
  reps?: number;
  weightKg?: number;
  rpe?: number;
  rir?: number;
  completedAt: string;
}

/** Record a performed set. RLS scopes the update to the owner through the parent workout. */
export async function updateSetLog(
  client: SupotsuClient,
  setId: string,
  done: SetLogPatch,
): Promise<WorkoutSetRow> {
  const { data, error } = await client
    .from('workout_sets')
    .update({
      reps: done.reps ?? null,
      weight_kg: done.weightKg ?? null,
      rpe: done.rpe ?? null,
      rir: done.rir ?? null,
      completed_at: done.completedAt,
    })
    .eq('id', setId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/**
 * Undo a set's log — the user unticked it. reps/weight_kg go back to the
 * planned values rather than null, so the row keeps showing what is still to
 * be done; planned_* was never modified, so nothing is lost either way.
 */
export async function clearSetLog(client: SupotsuClient, setId: string): Promise<WorkoutSetRow> {
  const { data: current, error: readError } = await client
    .from('workout_sets')
    .select('*')
    .eq('id', setId)
    .single();
  if (readError) throw readError;

  const { data, error } = await client
    .from('workout_sets')
    .update({
      reps: current.planned_reps ?? current.reps,
      weight_kg: current.planned_weight_kg ?? current.weight_kg,
      rpe: null,
      rir: null,
      completed_at: null,
    })
    .eq('id', setId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/** Append sets to an existing workout (the runner's warm-up ramp). */
export async function insertWorkoutSets(
  client: SupotsuClient,
  workoutId: string,
  sets: Omit<WorkoutSetInsertRow, 'workout_id'>[],
): Promise<WorkoutSetRow[]> {
  if (sets.length === 0) return [];
  const { data, error } = await client
    .from('workout_sets')
    .insert(sets.map((s) => ({ ...s, workout_id: workoutId })))
    .select('*');
  if (error) throw error;
  return data;
}
```

- [ ] **Step 2 : vérifier que `WorkoutSetRow` est bien exporté**

Run: `grep -n "WorkoutSetRow" packages/database/src/repositories/workouts.ts | head -3`
Expected: le type existe déjà en tête de fichier. Sinon, l'ajouter à côté de
`WorkoutSetInsertRow` :
`export type WorkoutSetRow = Database['public']['Tables']['workout_sets']['Row'];`

- [ ] **Step 3 : vérifier et committer**

Run: `npx tsc --noEmit -p packages/database && npx vitest run`

```bash
git add packages/database/src/repositories/workouts.ts
git commit -m "Add set log/clear/append database operations"
```

---

### Task 4 : Repository — logSet, clearSetLog, addSetsToWorkout

**Files:**
- Modify: `apps/mobile/src/lib/data/repository.ts`

**Interfaces:**
- Consumes: tâche 3.
- Produces: `DataRepository.logSet`, `.clearSetLog`, `.addSetsToWorkout`.
  Consommés par la tâche 5.

- [ ] **Step 1 : déclarer les méthodes sur l'interface**

Dans `apps/mobile/src/lib/data/repository.ts`, juste après la ligne
`completeBlock(userId: string, blockId: string, result: { completedRounds?: number; resultTimeSec?: number }): Promise<WorkoutBlock>;`,
ajouter :

```ts
  /** Record what was actually performed on one set. Never rewrites the planned values. */
  logSet(userId: string, setId: string, done: SetLogInput): Promise<void>;
  /** Undo a set's log — it goes back to "to do", restored to its planned values. */
  clearSetLog(userId: string, setId: string): Promise<void>;
  /** Append sets to an existing workout (warm-up ramp inserted from the runner). */
  addSetsToWorkout(userId: string, workoutId: string, sets: NewRunnerSet[]): Promise<void>;
```

Puis, à côté des autres types d'entrée exportés (près de `NewCircuitBlockInput`),
ajouter :

```ts
/** What the runner records once a set is ticked off. */
export interface SetLogInput {
  reps?: number;
  weightKg?: number;
  rpe?: number;
  rir?: number;
  completedAt: string;
}

/** A set appended to a live session — currently only the warm-up ramp. */
export interface NewRunnerSet {
  exerciseId: string;
  order: number;
  blockId?: string;
  reps?: number;
  weightKg?: number;
  restSec?: number;
  isWarmup?: boolean;
}
```

- [ ] **Step 2 : donner un identifiant stable aux séries du dépôt démo**

Le dépôt démo synthétise les ids à la lecture (`${workoutId}-${order}`), donc
aucune méthode ne peut adresser une série de façon fiable. Ajouter un vrai id
stocké, avec repli sur la forme héritée pour les données déjà écrites.

Remplacer dans le même fichier :

```ts
interface LoggedSetRow {
  workoutId: string;
  blockId?: string;
```

par :

```ts
interface LoggedSetRow {
  /** Stable id, absent from rows written before lot 2a — readers fall back to the synthesized form. */
  id?: string;
  workoutId: string;
  blockId?: string;
```

Puis, dans le mapping démo de `getWorkoutSets`, remplacer :

```ts
          id: `${r.workoutId}-${r.order}`,
```

par :

```ts
          id: r.id ?? `${r.workoutId}-${r.order}`,
```

Et dans celui de `getBlockSets`, remplacer :

```ts
          id: `${r.workoutId}-${r.blockId}-${r.order}`,
```

par :

```ts
          id: r.id ?? `${r.workoutId}-${r.blockId}-${r.order}`,
```

Enfin, sur les **six** sites d'écriture démo repérés par
`grep -n "plannedReps: s.reps" apps/mobile/src/lib/data/repository.ts`, ajouter
`id: randomId(),` en première propriété de chaque objet de série créé.
`randomId` est déjà importé dans ce fichier.

- [ ] **Step 3 : implémenter dans le dépôt démo**

Dans l'objet retourné par `createDemoRepository`, après `completeBlock`,
ajouter :

```ts
    async logSet(userId, setId, done) {
      const rows = await readJson<LoggedSetRow & { date: string }>(setKey(userId));
      await writeJson(
        setKey(userId),
        rows.map((r) => {
          const id = r.id ?? `${r.workoutId}-${r.order}`;
          const blockId = r.id ?? `${r.workoutId}-${r.blockId}-${r.order}`;
          if (id !== setId && blockId !== setId) return r;
          return {
            ...r,
            reps: done.reps ?? null,
            weightKg: done.weightKg ?? null,
            rir: done.rir ?? null,
            completedAt: done.completedAt,
          };
        }),
      );
    },
    async clearSetLog(userId, setId) {
      const rows = await readJson<LoggedSetRow & { date: string }>(setKey(userId));
      await writeJson(
        setKey(userId),
        rows.map((r) => {
          const id = r.id ?? `${r.workoutId}-${r.order}`;
          const blockId = r.id ?? `${r.workoutId}-${r.blockId}-${r.order}`;
          if (id !== setId && blockId !== setId) return r;
          return {
            ...r,
            reps: r.plannedReps ?? r.reps,
            weightKg: r.plannedWeightKg ?? r.weightKg,
            rir: null,
            completedAt: null,
          };
        }),
      );
    },
    async addSetsToWorkout(userId, workoutId, sets) {
      const rows = await readJson<LoggedSetRow & { date: string }>(setKey(userId));
      const now = new Date().toISOString();
      const added = sets.map((s) => ({
        id: randomId(),
        workoutId,
        blockId: s.blockId,
        exerciseId: s.exerciseId,
        order: s.order,
        reps: s.reps ?? null,
        weightKg: s.weightKg ?? null,
        restSec: s.restSec ?? null,
        plannedReps: s.reps ?? null,
        plannedWeightKg: s.weightKg ?? null,
        isWarmup: s.isWarmup ?? false,
        date: now,
      }));
      await writeJson(setKey(userId), [...added, ...rows]);
    },
```

- [ ] **Step 4 : implémenter dans le dépôt Supabase**

Importer les trois fonctions de la tâche 3 dans le bloc d'import
`@supotsu/database` existant (`updateSetLog`, `clearSetLog as clearSetLogDb`,
`insertWorkoutSets`), puis, après `completeBlock` du dépôt Supabase, ajouter :

```ts
    async logSet(_userId, setId, done) {
      await updateSetLog(client, setId, done);
    },
    async clearSetLog(_userId, setId) {
      await clearSetLogDb(client, setId);
    },
    async addSetsToWorkout(_userId, workoutId, sets) {
      await insertWorkoutSets(
        client,
        workoutId,
        sets.map((s) => ({
          exercise_id: s.exerciseId,
          order: s.order,
          block_id: s.blockId ?? null,
          reps: s.reps ?? null,
          weight_kg: s.weightKg ?? null,
          rest_sec: s.restSec ?? null,
          planned_reps: s.reps ?? null,
          planned_weight_kg: s.weightKg ?? null,
          is_warmup: s.isWarmup ?? false,
        })),
      );
    },
```

- [ ] **Step 5 : vérifier et committer**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json && cd ../.. && npx vitest run`

```bash
git add apps/mobile/src/lib/data/repository.ts
git commit -m "Add set logging repository methods in both repositories"
```

---

### Task 5 : Hooks TanStack Query

**Files:**
- Modify: `apps/mobile/src/lib/data/queries.ts`

**Interfaces:**
- Consumes: tâche 4.
- Produces: `useLogSet`, `useClearSetLog`, `useAddSetsToWorkout`. Consommés par
  les tâches 6 à 8.

- [ ] **Step 1 : ajouter les trois hooks**

Dans `apps/mobile/src/lib/data/queries.ts`, juste après `useCompleteBlock`,
ajouter :

```ts
/**
 * Invalide tout ce qui dépend des séries d'une séance. Les trois mutations du
 * runner écrivent la même table, elles partagent donc la même invalidation.
 */
function invalidateSets(qc: ReturnType<typeof useQueryClient>, userId: string | undefined, workoutId: string): void {
  qc.invalidateQueries({ queryKey: ['workoutSets', workoutId] });
  qc.invalidateQueries({ queryKey: ['blockSets'] });
  qc.invalidateQueries({ queryKey: ['workouts', userId] });
  qc.invalidateQueries({ queryKey: ['exerciseHistory', userId] });
}

export function useLogSet() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { setId: string; workoutId: string; done: SetLogInput }) =>
      repo.logSet(user!.id, input.setId, input.done),
    onSuccess: (_d, input) => invalidateSets(qc, user?.id, input.workoutId),
  });
}

export function useClearSetLog() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { setId: string; workoutId: string }) => repo.clearSetLog(user!.id, input.setId),
    onSuccess: (_d, input) => invalidateSets(qc, user?.id, input.workoutId),
  });
}

export function useAddSetsToWorkout() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { workoutId: string; sets: NewRunnerSet[] }) =>
      repo.addSetsToWorkout(user!.id, input.workoutId, input.sets),
    onSuccess: (_d, input) => invalidateSets(qc, user?.id, input.workoutId),
  });
}
```

- [ ] **Step 2 : compléter l'import de types**

Dans le même fichier, ajouter `type SetLogInput` et `type NewRunnerSet` à
l'import existant depuis `./repository`.

- [ ] **Step 3 : vérifier les clés de requête employées**

Run: `grep -n "queryKey: \['workoutSets'\|queryKey: \['blockSets'" apps/mobile/src/lib/data/queries.ts`
Expected: les clés utilisées dans `invalidateSets` correspondent exactement à
celles des hooks `useWorkoutSets` / `useBlockSets`. Si elles diffèrent, aligner
`invalidateSets` sur les clés réelles — une invalidation qui ne correspond à
rien laisserait l'écran figé après validation d'une série.

- [ ] **Step 4 : vérifier et committer**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json && cd ../.. && npx vitest run`

```bash
git add apps/mobile/src/lib/data/queries.ts
git commit -m "Add set logging query hooks"
```

---

### Task 6 : Écran — liste de séries, log et effort

**Files:**
- Create: `apps/mobile/src/features/training/StrengthRunner.tsx`
- Modify: `apps/mobile/src/features/training/CircuitRunnerScreen.tsx`

**Interfaces:**
- Consumes: tâches 1, 2, 5.
- Produces: le composant `StrengthRunner`, monté par `CircuitRunnerScreen` à la
  place de sa branche `strength` non répétée.

- [ ] **Step 1 : créer le composant**

Créer `apps/mobile/src/features/training/StrengthRunner.tsx`. Il rend, dans
l'ordre de la maquette (panneau droit de `creation-suivi-seance.png`) :

1. le nom de l'exercice actif, « {n} / {total} séries », et la ligne
   « Précédent : … » issue de `useExerciseHistory` — **omise** s'il n'y a pas
   d'historique pour cet exercice, jamais remplacée par un tiret ;
2. une ligne par série : case à cocher, numéro (ou libellé d'échauffement en
   ton `warning`), `Input` reps, `Input` charge, état. La série active est
   entourée avec `colors.primary` ; les séries faites prennent un fond
   `colors.surfaceElevated` ;
3. sous la série active, un sélecteur d'effort 1-10 (`SegmentedControl` ou
   rangée de `Pressable`), libellé `RPE` ou `RIR` selon
   `preferences.effortMetric` ;
4. le pied « Prochain : {exercice} » et le bouton « Valider ».

Contraintes de mise en œuvre :

- l'état d'édition (reps/charge saisies pour la série active) est local au
  composant, initialisé depuis la série ; la validation appelle `useLogSet`
  avec `completedAt: new Date().toISOString()` ;
- décocher une série faite appelle `useClearSetLog` ;
- la liste des séries est **scrollable** (`ScrollView`) et le pied reste
  visible : c'est exactement le défaut corrigé au build 45, ne pas le
  réintroduire ;
- les noms d'exercices se résolvent via `EXERCISE_LIBRARY`, `EXERCISES` **et**
  les exercices personnalisés — les trois sources, comme
  `CircuitRunnerScreen` le fait depuis le build 45 ;
- toutes les chaînes via `t()` (clés ajoutées en tâche 10).

- [ ] **Step 2 : brancher depuis CircuitRunnerScreen**

Dans `CircuitRunnerScreen.tsx`, remplacer le contenu de la branche
`active.format === 'strength' && !isRepeatingStrength && !hasSuperset` par le
rendu de `<StrengthRunner ... />`, en lui passant les séries du bloc, l'id de
la séance et le callback de fin de bloc (`finishActiveBlock`). Les trois
autres branches restent inchangées : elles relèvent du lot 2b.

- [ ] **Step 3 : vérifier et committer**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json && cd ../.. && npx vitest run && npx eslint apps/mobile/src/features/training --ext .ts,.tsx`

```bash
git add apps/mobile/src/features/training/StrengthRunner.tsx apps/mobile/src/features/training/CircuitRunnerScreen.tsx
git commit -m "Add per-set logging to the strength runner"
```

---

### Task 7 : Repos automatique et calculateur de disques

**Files:**
- Modify: `apps/mobile/src/features/training/StrengthRunner.tsx`

**Interfaces:**
- Consumes: `restRemainingSec` (tâche 1), `runStore` (tâche 2),
  `computePlates` (`@supotsu/engines`), préférences du Lot 1.

- [ ] **Step 1 : minuteur de repos**

À la validation d'une série, poser
`restEndsAtMs = Date.now() + (set.restSec ?? preferences.defaultRestSec) * 1000`
dans le state et dans `runStore`. Un `setInterval` de 500 ms ne fait que
**rafraîchir** l'affichage : la valeur vient toujours de
`restRemainingSec(restEndsAtMs, Date.now())`. Ne jamais décrémenter un compteur.

Rendu : carte avec `ProgressRing` (`value` = pourcentage écoulé du repos),
temps restant au format `m:ss`, mention « démarré automatiquement », boutons
`+15 s` (décale `restEndsAtMs` de 15 000 ms) et « Passer » (met
`restEndsAtMs` à `undefined`). `triggerHaptic()` au passage à zéro, une seule
fois — garder un drapeau pour ne pas vibrer à chaque rafraîchissement.

- [ ] **Step 2 : carte des disques**

Sous le repos, pour la charge de la série active :
`computePlates(weightKg, preferences.barWeightKg, preferences.availablePlates)`.
La carte est **masquée** quand le résultat est `undefined` ou que la série n'a
pas de charge — haltères et poids du corps n'ont pas de disques à afficher.

Rendu : titre « Disques · {charge} kg », mention « barre {n} kg · par côté »,
puis une pastille par `PlateCount` (valeur, et le compte quand il dépasse 1).
Si `achievedKg` diffère de la charge demandée, l'indiquer — l'utilisateur doit
savoir que sa cible n'est pas exactement chargeable avec ses disques.

- [ ] **Step 3 : vérifier et committer**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json && cd ../.. && npx vitest run`

```bash
git add apps/mobile/src/features/training/StrengthRunner.tsx
git commit -m "Add auto rest timer and plate calculator to the runner"
```

---

### Task 8 : Échauffement, écran allumé, statut et reprise

**Files:**
- Modify: `apps/mobile/src/features/training/StrengthRunner.tsx`
- Modify: `apps/mobile/src/features/training/CircuitRunnerScreen.tsx`
- Modify: `apps/mobile/src/features/training/WorkoutDetailScreen.tsx`

- [ ] **Step 1 : proposition d'échauffement**

Sur la première série de travail d'un exercice chargé et non encore commencé,
afficher une action « Ajouter un échauffement » calculée par `warmupProposal`
(tâche 1). L'accepter appelle `useAddSetsToWorkout` avec `isWarmup: true` et
des `order` placés **avant** la série de travail. Jamais automatique : c'est
une proposition, comme la suggestion de charge du lot 3.

- [ ] **Step 2 : écran allumé**

Dans `CircuitRunnerScreen`, `activateKeepAwakeAsync()` au montage et
`deactivateKeepAwake()` au démontage — même pattern que
`apps/mobile/src/features/sommeil/SleepTrackingScreen.tsx`.

- [ ] **Step 3 : passer la séance en cours**

Toujours dans `CircuitRunnerScreen`, au montage : si le workout est `planned`,
appeler `useSetWorkoutStatus` avec `'in_progress'`, et initialiser `runStore`
avec `startedAtMs: Date.now()` si aucun état n'existe. Rien ne pose ce statut
aujourd'hui — c'est ce qui rend une séance en cours irrécupérable.

À la fin de la séance, après le passage en `completed`, appeler
`clearRunState(workoutId)`.

- [ ] **Step 4 : proposer la reprise**

Dans `WorkoutDetailScreen`, quand `workout.status === 'in_progress'`, afficher
un bouton « Reprendre la séance » vers `/sport/workout/[id]/run`, à la place du
bouton « Commencer ». Le bouton « Commencer » reste conditionné à
`status === 'planned' && blocks.length > 0`.

- [ ] **Step 5 : vérifier et committer**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json && cd ../.. && npx vitest run`

```bash
git add apps/mobile/src/features/training
git commit -m "Add warmup proposal, keep-awake, in-progress status and resume"
```

---

### Task 9 : Badge d'adhésion au plan

**Files:**
- Modify: `apps/mobile/src/features/training/WorkoutDetailScreen.tsx`

**Interfaces:**
- Consumes: `computePlanAdherence` (`@supotsu/engines`), `adherenceTone` (tâche 1).

- [ ] **Step 1 : afficher le badge**

Dans `WorkoutDetailScreen`, calculer
`computePlanAdherence(sets)` (mémoïsé sur `sets`) et, quand le résultat n'est
pas `undefined`, ajouter un `Stat` ou un `Badge` « {pourcentage} % du plan »
dans la rangée de résumé, avec la tonalité de `adherenceTone(ratio)`.

Quand la fonction retourne `undefined` — toute séance antérieure à la
migration 0029 — **ne rien afficher du tout** : pas de tiret, pas de 0 %.

Le pourcentage s'arrondit à l'entier. Un ratio supérieur à 1 s'affiche tel quel
(« 120 % du plan »), en tonalité succès.

- [ ] **Step 2 : vérifier et committer**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json && cd ../.. && npx vitest run`

```bash
git add apps/mobile/src/features/training/WorkoutDetailScreen.tsx
git commit -m "Show plan adherence on a finished session"
```

---

### Task 10 : i18n et vérification finale

**Files:**
- Modify: `apps/mobile/src/i18n/locales/{fr,en,es,pt,de}.json`

- [ ] **Step 1 : relever les clés employées**

Run: `grep -ohE "t\('sport\.(runner|workoutDetail)\.[a-zA-Z0-9.]+'" apps/mobile/src/features/training/*.tsx | sort -u`
Expected: la liste exhaustive des clés introduites par les tâches 6 à 9.

- [ ] **Step 2 : remplir les cinq locales**

Ajouter chaque clé dans les cinq fichiers, sous `sport.runner` (nouveau
sous-arbre, à côté de `sport.circuitRunner` qui reste au lot 2b). Utiliser un
script Python additif (`json.load` / `OrderedDict` / `json.dump` avec
`ensure_ascii=False`, `indent=1`), comme les lots i18n précédents — ne jamais
réécrire un fichier de locale à la main.

Libellés fr de référence : « Précédent : {{weight}} kg × {{reps}} »,
« {{done}} / {{total}} séries », « Échauffement », « Valider »,
« Prochain : {{name}} », « Repos en cours », « démarré automatiquement »,
« Passer », « Ajouter un échauffement », « Disques · {{weight}} kg »,
« barre {{bar}} kg · par côté », « Reprendre la séance »,
« {{percent}} % du plan ».

- [ ] **Step 3 : vérifier la validité des cinq fichiers**

Run:
```bash
for l in fr en es pt de; do python3 -c "import json;json.load(open('apps/mobile/src/i18n/locales/$l.json'));print('$l ok')"; done
```
Expected: cinq `ok`.

- [ ] **Step 4 : vérifier qu'aucune clé ne manque**

Écrire un contrôle ponctuel comparant les clés relevées au Step 1 au contenu
des cinq locales, et corriger tout manque avant de continuer.

- [ ] **Step 5 : vérification complète du lot**

Run:
```bash
npx tsc --noEmit -p packages/core
npx tsc --noEmit -p packages/database
npx tsc --noEmit -p packages/engines
cd apps/mobile && npx tsc --noEmit -p tsconfig.json && cd ../..
npx eslint packages apps/mobile/src --ext .ts,.tsx
npx vitest run
pnpm --filter @supotsu/mobile export:web
```
Expected: tout vert. Les deux avertissements préexistants de
`NewWorkoutScreen.tsx` (`pickerOpen`, `pastWorkouts`) ne sont pas au périmètre.

- [ ] **Step 6 : pousser**

```bash
git add apps/mobile/src/i18n/locales
git commit -m "Translate runner strings to en/es/pt/de"
git pull --rebase
git push
```

- [ ] **Step 7 : rapport**

Signaler à l'utilisateur : ce qui est livré, le fait que la migration 0029
doit être appliquée pour que la validation des séries fonctionne, et les deux
points invérifiables sans appareil (repos qui survit à un passage en
arrière-plan, reprise après fermeture forcée).
