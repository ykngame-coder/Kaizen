# Alternative "à la maison" par exercice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à l'utilisateur de choisir "Salle" ou "Maison" au lancement de n'importe quelle séance ayant au moins un exercice avec une alternative définie, et faire exécuter la séance avec les bons exercices en conséquence — sans toucher aux séances qui n'en ont pas.

**Architecture:** Un champ optionnel `homeAlternativeExerciseId` porté par chaque exercice prescrit, à la fois côté catalogue (`user_session_exercises`) et côté séance personnelle copiée (`workout_sets`) — la copie à l'inscription (`sessionToWorkoutBlocks` → `addPlannedWorkout`) le fait traverser. Le choix se fait dans `WorkoutDetailScreen` juste avant de lancer `CircuitRunnerScreen`, qui substitue `exerciseId` en mémoire si `mode=home`, sans rien réécrire en base.

**Tech Stack:** React Native (Expo Router), TypeScript, Supabase/Postgres, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-08-exercise-home-alternative-design.md`

## Global Constraints

- Nullable partout, pas de défaut — la grande majorité des exercices n'ont pas d'alternative.
- Aucune UI pour qu'un utilisateur définisse SES PROPRES alternatives (hors scope).
- Le choix salle/maison n'est jamais mémorisé — redemandé à chaque lancement.
- Toute chaîne visible passe par `t()`, traduite en fr/en/es/pt/de.
- Pas de migration qui casse les lignes existantes (colonnes nullable, `add column` simple).

---

### Task 1: Migration — colonne `home_alternative_exercise_id`

**Files:**
- Create: `supabase/migrations/0043_exercise_home_alternative.sql`

**Interfaces:**
- Produces: colonne `home_alternative_exercise_id text references public.exercises (id)` sur `public.user_session_exercises` et `public.workout_sets`, utilisée par toutes les tâches suivantes.

- [ ] **Step 1: Écrire la migration**

```sql
-- SUPOTSU — Alternative "à la maison" par exercice
--
-- Un exercice prescrit (catalogue ou séance personnelle) peut désigner un
-- exercice de repli à utiliser quand l'utilisateur choisit "Maison" au
-- lancement de la séance plutôt que "Salle". Nullable : la grande majorité
-- des exercices n'ont pas d'alternative.
--
-- Portée sur les deux tables : user_session_exercises (contenu catalogue)
-- ET workout_sets (séance personnelle copiée à l'inscription) — sans la
-- colonne sur workout_sets, l'alternative ne survivrait pas à la copie
-- faite par sessionToWorkoutBlocks/addPlannedWorkout, et le choix fait au
-- lancement (potentiellement des semaines après l'inscription) n'aurait
-- plus rien à lire.

alter table public.user_session_exercises
  add column home_alternative_exercise_id text references public.exercises (id);

alter table public.workout_sets
  add column home_alternative_exercise_id text references public.exercises (id);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0043_exercise_home_alternative.sql
git commit -m "feat: migration pour l'alternative à la maison par exercice"
```

---

### Task 2: Types générés Supabase

**Files:**
- Modify: `packages/database/src/generated/database.types.ts:180-224` (table `workout_sets`)
- Modify: `packages/database/src/generated/database.types.ts:690-718` (table `user_session_exercises`)

**Interfaces:**
- Consumes: rien (fichier de types pur).
- Produces: `Database['public']['Tables']['workout_sets']['Row'|'Insert']` et `Database['public']['Tables']['user_session_exercises']['Row'|'Insert']` incluent désormais `home_alternative_exercise_id: string | null` — tout code qui passe par `Omit<WorkoutSetInsertRow, ...>` ou `Omit<UserSessionExerciseInsertRow, ...>` (ex. `writeSessionBlocks`, `insertWorkoutWithBlocks`) accepte le champ sans changement de leur propre code, grâce au spread générique déjà en place.

- [ ] **Step 1: Ajouter la colonne au type `workout_sets`**

Dans `packages/database/src/generated/database.types.ts`, le bloc `workout_sets` (ligne 180) :

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
          distance_m: number | null;
          rpe: number | null;
          block_id: string | null;
          superset_group: number | null;
          planned_reps: number | null;
          planned_weight_kg: number | null;
          planned_distance_m: number | null;
          planned_duration_sec: number | null;
          rir: number | null;
          is_warmup: boolean;
          completed_at: string | null;
          home_alternative_exercise_id: string | null;
        };
        Insert: {
          workout_id: string;
          exercise_id: string;
          order?: number;
          reps?: number | null;
          weight_kg?: number | null;
          duration_sec?: number | null;
          rest_sec?: number | null;
          distance_m?: number | null;
          rpe?: number | null;
          block_id?: string | null;
          superset_group?: number | null;
          planned_reps?: number | null;
          planned_weight_kg?: number | null;
          planned_distance_m?: number | null;
          planned_duration_sec?: number | null;
          rir?: number | null;
          is_warmup?: boolean;
          completed_at?: string | null;
          home_alternative_exercise_id?: string | null;
        };
        Update: Partial<Database['public']['Tables']['workout_sets']['Insert']>;
        Relationships: [];
      };
```

- [ ] **Step 2: Ajouter la colonne au type `user_session_exercises`**

Dans le même fichier, le bloc `user_session_exercises` (ligne 690) :

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
          distance_m: number | null;
          is_warmup: boolean;
          home_alternative_exercise_id: string | null;
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
          distance_m?: number | null;
          is_warmup?: boolean;
          home_alternative_exercise_id?: string | null;
        };
        Update: Partial<Database['public']['Tables']['user_session_exercises']['Insert']>;
        Relationships: [];
      };
```

- [ ] **Step 3: Vérifier que le projet type-check toujours**

Run: `cd apps/mobile && npx tsc --noEmit -p .`
Expected: aucune nouvelle erreur (ce fichier n'est que des types élargis, rien ne doit casser).

- [ ] **Step 4: Commit**

```bash
git add packages/database/src/generated/database.types.ts
git commit -m "feat: types Supabase pour home_alternative_exercise_id"
```

---

### Task 3: Types core — `SetEntry` et `UserSessionExercise`

**Files:**
- Modify: `packages/core/src/training.ts` (interface `SetEntry`, autour de la ligne 81-100)
- Modify: `packages/core/src/user-programs.ts` (interface `UserSessionExercise`, autour de la ligne 18-30)

**Interfaces:**
- Consumes: rien.
- Produces: `SetEntry.homeAlternativeExerciseId?: string` et `UserSessionExercise.homeAlternativeExerciseId?: string`, utilisés par toutes les tâches suivantes (mapping DB, `sessionToWorkoutBlocks`, substitution au lancement).

- [ ] **Step 1: Ajouter le champ à `SetEntry`**

Dans `packages/core/src/training.ts`, juste après `restSec?: number;` dans l'interface `SetEntry` :

```ts
  restSec?: number;
  /** Exercice de repli si l'utilisateur choisit "Maison" au lancement de la séance. */
  homeAlternativeExerciseId?: string;
```

- [ ] **Step 2: Ajouter le champ à `UserSessionExercise`**

Dans `packages/core/src/user-programs.ts`, juste après `restSec?: number;` dans l'interface `UserSessionExercise` :

```ts
  restSec?: number;
  /** Exercice de repli si l'utilisateur choisit "Maison" au lancement de la séance. */
  homeAlternativeExerciseId?: string;
```

- [ ] **Step 3: Vérifier le type-check**

Run: `cd apps/mobile && npx tsc --noEmit -p .`
Expected: aucune nouvelle erreur.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/training.ts packages/core/src/user-programs.ts
git commit -m "feat: homeAlternativeExerciseId sur SetEntry et UserSessionExercise"
```

---

### Task 4: Lecture — mapping DB → types, avec tests

**Files:**
- Modify: `apps/mobile/src/lib/data/repository.ts:822-835` (`rowToUserSessionExercise`)
- Modify: `apps/mobile/src/lib/data/repository.ts:3590-3613` (`getWorkoutSets`, mode DB)
- Modify: `apps/mobile/src/lib/data/repository.ts:3644-3667` (`getBlockSets`, mode DB)
- Test: `apps/mobile/src/lib/data/sessionWorkout.test.ts` (nouveau test dans ce fichier existant, voir Task 5 — les trois mappings ci-dessus n'ont pas de fichier de test dédié aujourd'hui : ils sont exercés indirectement via `sessionToWorkoutBlocks`, couvert par Task 5)

**Interfaces:**
- Consumes: `UserSessionExerciseRow`, lignes `workout_sets`/`user_session_exercises` retournées par Supabase — `home_alternative_exercise_id` ajouté en Task 2.
- Produces: `UserSessionExercise.homeAlternativeExerciseId`, `SetEntry.homeAlternativeExerciseId` correctement lus depuis la base.

- [ ] **Step 1: Mettre à jour `rowToUserSessionExercise`**

Dans `apps/mobile/src/lib/data/repository.ts`, fonction `rowToUserSessionExercise` (ligne 822) :

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
    distanceM: r.distance_m ?? undefined,
    restSec: r.rest_sec ?? undefined,
    homeAlternativeExerciseId: r.home_alternative_exercise_id ?? undefined,
  };
}
```

- [ ] **Step 2: Mettre à jour `getWorkoutSets` (mode DB)**

Dans `apps/mobile/src/lib/data/repository.ts`, méthode `getWorkoutSets` du client DB (ligne 3590), ajouter une ligne dans l'objet retourné par `.map()` :

```ts
    async getWorkoutSets(_userId, workoutId) {
      const rows = await listSetsForWorkout(client, workoutId);
      return rows.map((r) => ({
        id: r.id,
        workoutId: r.workout_id,
        blockId: r.block_id ?? undefined,
        exerciseId: r.exercise_id,
        order: r.order,
        reps: r.reps ?? undefined,
        weightKg: r.weight_kg ?? undefined,
        durationSec: r.duration_sec ?? undefined,
        distanceM: r.distance_m ?? undefined,
        restSec: r.rest_sec ?? undefined,
        rpe: r.rpe ?? undefined,
        supersetGroup: r.superset_group ?? undefined,
        plannedReps: r.planned_reps ?? undefined,
        plannedWeightKg: r.planned_weight_kg ?? undefined,
        plannedDistanceM: r.planned_distance_m ?? undefined,
        plannedDurationSec: r.planned_duration_sec ?? undefined,
        rir: r.rir ?? undefined,
        isWarmup: r.is_warmup ?? undefined,
        completedAt: r.completed_at ?? undefined,
        homeAlternativeExerciseId: r.home_alternative_exercise_id ?? undefined,
      }));
    },
```

- [ ] **Step 3: Mettre à jour `getBlockSets` (mode DB)**

Dans `apps/mobile/src/lib/data/repository.ts`, méthode `getBlockSets` du client DB (ligne 3644), même ajout :

```ts
    async getBlockSets(_userId, blockId) {
      const rows = await listSetsForBlockDb(client, blockId);
      return rows.map((r) => ({
        id: r.id,
        workoutId: r.workout_id,
        blockId: r.block_id ?? undefined,
        exerciseId: r.exercise_id,
        order: r.order,
        reps: r.reps ?? undefined,
        weightKg: r.weight_kg ?? undefined,
        durationSec: r.duration_sec ?? undefined,
        distanceM: r.distance_m ?? undefined,
        restSec: r.rest_sec ?? undefined,
        rpe: r.rpe ?? undefined,
        supersetGroup: r.superset_group ?? undefined,
        plannedReps: r.planned_reps ?? undefined,
        plannedWeightKg: r.planned_weight_kg ?? undefined,
        plannedDistanceM: r.planned_distance_m ?? undefined,
        plannedDurationSec: r.planned_duration_sec ?? undefined,
        rir: r.rir ?? undefined,
        isWarmup: r.is_warmup ?? undefined,
        completedAt: r.completed_at ?? undefined,
        homeAlternativeExerciseId: r.home_alternative_exercise_id ?? undefined,
      }));
    },
```

- [ ] **Step 4: Type-check**

Run: `cd apps/mobile && npx tsc --noEmit -p .`
Expected: aucune erreur.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/lib/data/repository.ts
git commit -m "feat: lire home_alternative_exercise_id depuis la base"
```

---

### Task 5: Écriture — `sessionToWorkoutBlocks` fait survivre l'alternative à l'inscription

**Files:**
- Modify: `apps/mobile/src/lib/data/sessionWorkout.ts:29-37` (`setOf`)
- Modify: `apps/mobile/src/lib/data/repository.ts:3528-3547` (`addPlannedWorkout`, mode DB, branche `input.blocks`)
- Test: `apps/mobile/src/lib/data/sessionWorkout.test.ts`

**Interfaces:**
- Consumes: `UserSessionExercise.homeAlternativeExerciseId` (Task 3), `WorkoutSetInsertRow.home_alternative_exercise_id` (Task 2).
- Produces: un `SetEntry` issu de `sessionToWorkoutBlocks` porte `homeAlternativeExerciseId` ; une ligne `workout_sets` créée via `addPlannedWorkout` porte `home_alternative_exercise_id`.

- [ ] **Step 1: Écrire le test qui échoue, dans `sessionWorkout.test.ts`**

Ajouter à la fin du `describe('sessionToWorkoutBlocks', ...)` existant :

```ts
  it('copie l alternative maison, pour qu elle survive à l inscription à un programme', () => {
    const out = sessionToWorkoutBlocks(
      [block('b1', 0)],
      [exercise({ exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', blockId: 'b1', order: 0, homeAlternativeExerciseId: 'Dips_-_Chest_Version' })],
    );
    expect(out[0]!.sets[0]!.homeAlternativeExerciseId).toBe('Dips_-_Chest_Version');
  });

  it('laisse homeAlternativeExerciseId absent quand aucune alternative n est définie', () => {
    const out = sessionToWorkoutBlocks([block('b1', 0)], [exercise({ exerciseId: 'Barbell_Squat', blockId: 'b1', order: 0 })]);
    expect(out[0]!.sets[0]!.homeAlternativeExerciseId).toBeUndefined();
  });
```

- [ ] **Step 2: Lancer les tests, vérifier qu ils échouent**

Run: `npx vitest run apps/mobile/src/lib/data/sessionWorkout.test.ts`
Expected: FAIL — `homeAlternativeExerciseId` est `undefined` même quand fourni, parce que `setOf` ne le copie pas encore.

- [ ] **Step 3: Mettre à jour `setOf` dans `sessionWorkout.ts`**

```ts
  const setOf = (e: UserSessionExercise, fallbackOrder: number): WorkoutBlocks[number]['sets'][number] => ({
    exerciseId: e.exerciseId,
    order: e.order ?? fallbackOrder,
    reps: e.reps,
    weightKg: e.weightKg,
    durationSec: e.durationSec,
    distanceM: e.distanceM,
    restSec: e.restSec,
    homeAlternativeExerciseId: e.homeAlternativeExerciseId,
  });
```

- [ ] **Step 4: Lancer les tests, vérifier qu ils passent**

Run: `npx vitest run apps/mobile/src/lib/data/sessionWorkout.test.ts`
Expected: PASS — tous les tests du fichier, y compris les deux nouveaux et ceux déjà existants (le test `toEqual` existant à la ligne 31 reste vert : `toEqual` ignore les propriétés `undefined`, donc l'ajout du nouveau champ ne le casse pas).

- [ ] **Step 5: Mettre à jour `addPlannedWorkout` (mode DB) pour écrire la colonne**

Dans `apps/mobile/src/lib/data/repository.ts`, méthode `addPlannedWorkout` du client DB, branche `input.blocks` (ligne ~3528), dans le `.map()` des sets :

```ts
            input.blocks.map((b) => ({
              format: b.format,
              timeCapSec: b.timeCapSec,
              targetRounds: b.targetRounds,
              sets: b.sets.map((s) => ({
                exercise_id: s.exerciseId,
                order: s.order,
                reps: s.reps ?? null,
                weight_kg: s.weightKg ?? null,
                // Sans ces deux-là, une station chronométrée ou mesurée en
                // mètres arrivait vide dans la séance planifiée : le lecteur
                // n'avait plus qu'à demander des répétitions.
                duration_sec: s.durationSec ?? null,
                distance_m: s.distanceM ?? null,
                rest_sec: s.restSec ?? null,
                superset_group: s.supersetGroup ?? null,
                planned_reps: s.reps ?? null,
                planned_weight_kg: s.weightKg ?? null,
                is_warmup: s.isWarmup ?? false,
                home_alternative_exercise_id: s.homeAlternativeExerciseId ?? null,
              })),
            })),
```

- [ ] **Step 6: Type-check complet**

Run: `cd apps/mobile && npx tsc --noEmit -p .`
Expected: aucune erreur.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/lib/data/sessionWorkout.ts apps/mobile/src/lib/data/sessionWorkout.test.ts apps/mobile/src/lib/data/repository.ts
git commit -m "feat: l alternative maison survit à l inscription à un programme"
```

---

### Task 6: i18n — clés pour le choix Salle/Maison

**Files:**
- Modify: `apps/mobile/src/i18n/locales/fr.json`
- Modify: `apps/mobile/src/i18n/locales/en.json`
- Modify: `apps/mobile/src/i18n/locales/es.json`
- Modify: `apps/mobile/src/i18n/locales/pt.json`
- Modify: `apps/mobile/src/i18n/locales/de.json`

**Interfaces:**
- Produces: clés `sport.workoutDetail.locationChoice.title`, `.subtitle`, `.gym`, `.home` — consommées par Task 7.

- [ ] **Step 1: Ajouter les clés dans `fr.json`**

Dans la section `"workoutDetail": { ... }` (ligne 886), ajouter après `"notFound"` :

```json
   "locationChoice": {
    "title": "Salle ou maison ?",
    "subtitle": "Certains exercices de cette séance ont une alternative à la maison.",
    "gym": "Salle",
    "home": "Maison"
   },
```

- [ ] **Step 2: Ajouter les clés dans `en.json`**

```json
   "locationChoice": {
    "title": "Gym or home?",
    "subtitle": "Some exercises in this session have a home alternative.",
    "gym": "Gym",
    "home": "Home"
   },
```

- [ ] **Step 3: Ajouter les clés dans `es.json`**

```json
   "locationChoice": {
    "title": "¿Gimnasio o casa?",
    "subtitle": "Algunos ejercicios de esta sesión tienen una alternativa en casa.",
    "gym": "Gimnasio",
    "home": "Casa"
   },
```

- [ ] **Step 4: Ajouter les clés dans `pt.json`**

```json
   "locationChoice": {
    "title": "Academia ou casa?",
    "subtitle": "Alguns exercícios desta sessão têm uma alternativa em casa.",
    "gym": "Academia",
    "home": "Casa"
   },
```

- [ ] **Step 5: Ajouter les clés dans `de.json`**

```json
   "locationChoice": {
    "title": "Fitnessstudio oder zu Hause?",
    "subtitle": "Einige Übungen dieser Einheit haben eine Alternative für zu Hause.",
    "gym": "Studio",
    "home": "Zuhause"
   },
```

- [ ] **Step 6: Vérifier que chaque fichier JSON reste valide**

Run: `for f in fr en es pt de; do node -e "JSON.parse(require('fs').readFileSync('apps/mobile/src/i18n/locales/$f.json', 'utf8')); console.log('$f OK')"; done`
Expected: `fr OK`, `en OK`, `es OK`, `pt OK`, `de OK` — aucune erreur de parsing.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/i18n/locales/*.json
git commit -m "feat: traductions pour le choix salle/maison"
```

---

### Task 7: UI — choix Salle/Maison dans `WorkoutDetailScreen`

**Files:**
- Modify: `apps/mobile/src/features/training/WorkoutDetailScreen.tsx`

**Interfaces:**
- Consumes: `useWorkoutSets(workout.id)` (déjà importé dans ce fichier) → `SetEntry[]` avec `homeAlternativeExerciseId` (Task 4) ; clés i18n `sport.workoutDetail.locationChoice.*` (Task 6).
- Produces: navigation vers `/sport/workout/[id]/run` avec `params: { id, mode: 'home' }` ou `params: { id }` — consommé par `CircuitRunnerScreen` en Task 8.

- [ ] **Step 1: Ajouter l état local et le calcul `hasAlternatives`**

`WorkoutDetailScreen` importe déjà `useWorkoutSets` (ligne 13) et l'utilise probablement déjà pour `byExercise` plus haut dans le fichier — réutiliser le même `sets` déjà chargé. Ajouter, près des autres `useState` du composant :

```ts
const [choosingLocation, setChoosingLocation] = useState(false);
const hasAlternatives = sets.some((s) => s.homeAlternativeExerciseId != null);
```

(Si la variable locale pour `useWorkoutSets(...)` ne s'appelle pas déjà `sets`, utiliser le nom existant dans le fichier à cet endroit — c'est la même donnée que celle qui alimente `byExercise`.)

- [ ] **Step 2: Remplacer le bouton "Démarrer" par un choix conditionnel**

Remplacer le bloc (ligne 226-233) :

```tsx
{!confirmingDelete && (workout.status === 'planned' || workout.status === 'in_progress') && blocks.length > 0 ? (
  <View style={{ alignItems: 'flex-start' }}>
    <Button
      label={workout.status === 'in_progress' ? t('sport.runner.resume') : t('sport.workoutDetail.actions.start')}
      onPress={() => router.push({ pathname: '/sport/workout/[id]/run', params: { id: workout.id } })}
    />
  </View>
) : null}
```

par :

```tsx
{!confirmingDelete && (workout.status === 'planned' || workout.status === 'in_progress') && blocks.length > 0 ? (
  <View style={{ alignItems: 'flex-start' }}>
    <Button
      label={workout.status === 'in_progress' ? t('sport.runner.resume') : t('sport.workoutDetail.actions.start')}
      onPress={() => {
        if (hasAlternatives) setChoosingLocation(true);
        else router.push({ pathname: '/sport/workout/[id]/run', params: { id: workout.id } });
      }}
    />
  </View>
) : null}

{choosingLocation ? (
  <Card>
    <Text variant="subtitle">{t('sport.workoutDetail.locationChoice.title')}</Text>
    <Text variant="body" color="textMuted" style={{ marginTop: spacing[1] }}>
      {t('sport.workoutDetail.locationChoice.subtitle')}
    </Text>
    <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[3] }}>
      <Button
        label={t('sport.workoutDetail.locationChoice.gym')}
        variant="secondary"
        onPress={() => router.push({ pathname: '/sport/workout/[id]/run', params: { id: workout.id } })}
      />
      <Button
        label={t('sport.workoutDetail.locationChoice.home')}
        onPress={() => router.push({ pathname: '/sport/workout/[id]/run', params: { id: workout.id, mode: 'home' } })}
      />
    </View>
  </Card>
) : null}
```

- [ ] **Step 3: Type-check**

Run: `cd apps/mobile && npx tsc --noEmit -p .`
Expected: aucune erreur. Si `sets` n'est pas le nom exact de la variable issue de `useWorkoutSets` dans ce fichier, le corriger pour qu'il corresponde à ce qui existe déjà au-dessus dans le même composant.

- [ ] **Step 4: Vérifier à la main dans le simulateur**

Lancer l'app (voir skill `run` du projet), ouvrir une séance SANS alternative (toute séance déjà existante) → le bouton "Démarrer" lance directement, comme avant. Ce test manuel sera refait avec une vraie séance à alternative une fois PPL inséré (Task 9).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/training/WorkoutDetailScreen.tsx
git commit -m "feat: choix salle/maison avant de lancer une séance"
```

---

### Task 8: `CircuitRunnerScreen` substitue les exercices en mode maison

**Files:**
- Modify: `apps/mobile/src/features/training/CircuitRunnerScreen.tsx`
- Test: `apps/mobile/src/features/training/circuitRunnerSubstitution.test.ts` (nouveau — logique de substitution extraite en fonction pure, testable sans monter le composant)

**Interfaces:**
- Consumes: `SetEntry[]` avec `homeAlternativeExerciseId` (Task 4), paramètre de route `mode`.
- Produces: `substituteForLocation(sets: SetEntry[], mode: 'gym' | 'home'): SetEntry[]` — fonction pure exportée, utilisée par `CircuitRunnerScreen` et testée indépendamment.

- [ ] **Step 1: Écrire la fonction pure et son test, qui échoue d abord**

Créer `apps/mobile/src/features/training/circuitRunnerSubstitution.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import type { SetEntry } from '@supotsu/core';
import { substituteForLocation } from './circuitRunnerSubstitution';

const set = (over: Partial<SetEntry> & { exerciseId: string }): SetEntry => ({
  id: `s-${over.exerciseId}`,
  workoutId: 'w1',
  order: 0,
  ...over,
});

describe('substituteForLocation', () => {
  it('ne change rien en mode salle, même avec une alternative définie', () => {
    const sets = [set({ exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', homeAlternativeExerciseId: 'Dips_-_Chest_Version' })];
    expect(substituteForLocation(sets, 'gym')).toEqual(sets);
  });

  it('remplace exerciseId par l alternative en mode maison, seulement quand elle existe', () => {
    const sets = [
      set({ exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', order: 0, homeAlternativeExerciseId: 'Dips_-_Chest_Version' }),
      set({ exerciseId: 'Barbell_Squat', order: 1 }),
    ];
    const out = substituteForLocation(sets, 'home');
    expect(out[0]!.exerciseId).toBe('Dips_-_Chest_Version');
    expect(out[1]!.exerciseId).toBe('Barbell_Squat');
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier qu il échoue**

Run: `npx vitest run apps/mobile/src/features/training/circuitRunnerSubstitution.test.ts`
Expected: FAIL — le module `./circuitRunnerSubstitution` n'existe pas encore.

- [ ] **Step 3: Créer la fonction**

Créer `apps/mobile/src/features/training/circuitRunnerSubstitution.ts` :

```ts
import type { SetEntry } from '@supotsu/core';

/**
 * Substitue l'exercice "maison" quand il existe, en mémoire uniquement —
 * rien n'est réécrit en base, le choix peut changer au prochain lancement.
 */
export function substituteForLocation(sets: SetEntry[], mode: 'gym' | 'home'): SetEntry[] {
  if (mode === 'gym') return sets;
  return sets.map((s) => (s.homeAlternativeExerciseId != null ? { ...s, exerciseId: s.homeAlternativeExerciseId } : s));
}
```

- [ ] **Step 4: Lancer le test, vérifier qu il passe**

Run: `npx vitest run apps/mobile/src/features/training/circuitRunnerSubstitution.test.ts`
Expected: PASS — les deux tests.

- [ ] **Step 5: Brancher la substitution dans `CircuitRunnerScreen`**

Dans `apps/mobile/src/features/training/CircuitRunnerScreen.tsx`, ajouter l'import :

```ts
import { substituteForLocation } from './circuitRunnerSubstitution';
```

Lire le paramètre de route, à côté de `const { id } = useLocalSearchParams<{ id: string }>();` (ligne ~39) :

```ts
const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>();
```

Remplacer la ligne qui lit les sets (ligne ~98) :

```ts
const { data: sets = [] } = useBlockSets(active?.id);
```

par :

```ts
const { data: rawSets = [] } = useBlockSets(active?.id);
const sets = useMemo(() => substituteForLocation(rawSets, mode === 'home' ? 'home' : 'gym'), [rawSets, mode]);
```

`useMemo` est déjà importé en haut du fichier (ligne 1 : `import React, { useEffect, useMemo, useRef, useState } from 'react';`).

- [ ] **Step 6: Type-check**

Run: `cd apps/mobile && npx tsc --noEmit -p .`
Expected: aucune erreur.

- [ ] **Step 7: Vérifier à la main**

Lancer l'app, ouvrir une séance existante (sans alternative) et la démarrer : comportement inchangé. (Le test avec une vraie alternative se fera une fois PPL inséré, Task 9.)

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/features/training/circuitRunnerSubstitution.ts apps/mobile/src/features/training/circuitRunnerSubstitution.test.ts apps/mobile/src/features/training/CircuitRunnerScreen.tsx
git commit -m "feat: substituer les exercices en mode maison au lancement"
```

---

### Task 9: Données — contenu catalogue PPL avec alternatives maison

**Files:**
- Create: `supabase/manual/2026-10-09-ppl-program-content.sql`

**Interfaces:**
- Consumes: `home_alternative_exercise_id` (Task 1), même mécanisme catalogue que Luc Léger/Hyrox (`supabase/manual/2026-10-08-luc-leger-program-content.sql` comme référence de style).
- Produces: programme catalogue "Push/Pull/Legs" publié, avec 3 séances (Push, Pull, Jambes), chacune 5 exercices avec leur alternative maison.

Contenu transcrit du PDF fourni par l'utilisateur (6 semaines, niveau débutant), même split chaque semaine.

Mapping exercice salle → id catalogue, alternative poids du corps → id (existant ou personnalisé) :

| Séance | Exercice (salle) | Alternative (maison) |
|---|---|---|
| Push | `Barbell_Bench_Press_-_Medium_Grip` (4×8-10, repos 2:00) | `Dips_-_Chest_Version` |
| Push | `Barbell_Shoulder_Press` (3×8-12, repos 1:30) | `Pike Push-Up` *(perso)* |
| Push | `Cable_Crossover` (3×10-12, repos 1:30) | `Pompes Archer` *(perso)* |
| Push | `Side_Lateral_Raise` (4×12-15, repos 1:00) | `Élévations en Planche` *(perso)* |
| Push | `Triceps_Pushdown` (3×10-12, repos 1:00) | `Pompes Diamant` *(perso)* |
| Pull | `Wide-Grip_Lat_Pulldown` (4×6-10, repos 2:00) | `Pullups` |
| Pull | `Bent_Over_Barbell_Row` (3×8-12, repos 1:30) | `Tractions Australiennes` *(perso)* |
| Pull | `Bent_Over_Dumbbell_Rear_Delt_Raise_With_Head_On_Bench` (3×12-15, repos 1:00) | `Reverse Fly au Sol` *(perso)* |
| Pull | `Barbell_Curl` (3×8-10, repos 1:30) | `Tractions Supination` *(perso)* |
| Pull | `Hammer_Curls` (3×10-12, repos 1:00) | `Tractions Australiennes Supination` *(perso)* |
| Jambes | `Barbell_Squat` (4×8-10, repos 2:00) | `Freehand_Jump_Squat` |
| Jambes | `Dumbbell_Lunges` (3×10-12, repos 1:30) | `Fentes Bulgares` *(perso)* |
| Jambes | `Romanian_Deadlift` (3×10-12, repos 1:30) | `Single-Leg Romanian Deadlift` *(perso)* |
| Jambes | `Calf_Press_On_The_Leg_Press_Machine` (4×15-20, repos 1:00) | `Élévation Mollet 1 Jambe` *(perso)* |
| Jambes | `Hanging_Leg_Raise` (3×12-15, repos 1:00) | `Bent-Knee_Hip_Raise` |

Reps prescrites : la fourchette du PDF (ex. "8-10") n'a pas d'équivalent direct dans `reps` (un seul entier) — utiliser la **borne basse** de chaque fourchette (ex. 8 pour "8-10"), cohérent avec la pratique du reste du catalogue (Luc Léger/Hyrox utilisent toujours une valeur unique, jamais une fourchette).

- [ ] **Step 1: Écrire le script SQL**

```sql
-- Crée le programme catalogue "Push/Pull/Legs" — transcrit du PDF fourni
-- par l'utilisateur (hybride salle/poids du corps, 6 semaines, niveau
-- débutant). Chaque exercice porte son alternative "maison"
-- (home_alternative_exercise_id) pour le choix salle/maison au lancement
-- d'une séance. Même mécanisme que Luc Léger/Hyrox : vraies séances
-- publiques (user_sessions/user_session_blocks/user_session_exercises),
-- reliées au programme via program_sessions.
--
-- 6 semaines, 3 séances/semaine (Push/Pull/Jambes, même split chaque
-- semaine, contenu identique — pas de progression par semaine ici,
-- contrairement à Hyrox).
--
-- À exécuter UNE SEULE FOIS dans l'éditeur SQL Supabase (projet vocumsjilhdmzilokhlq).

-- ---------------------------------------------------------------------------
-- 0. Mouvements absents de public.exercises — alternatives poids du corps
--    du PDF sans équivalent dans free-exercise-db.
-- ---------------------------------------------------------------------------
insert into public.exercises (id, name, category, primary_muscles, secondary_muscles, equipment, level)
values
  ('Pike Push-Up', 'Pike Push-Up', 'strength', '{shoulders}', '{triceps,chest}', '{}', 'intermediate'),
  ('Pompes Archer', 'Pompes Archer', 'strength', '{chest}', '{shoulders,triceps}', '{}', 'intermediate'),
  ('Élévations en Planche', 'Élévations en Planche', 'strength', '{shoulders}', '{core}', '{}', 'intermediate'),
  ('Pompes Diamant', 'Pompes Diamant', 'strength', '{triceps}', '{chest}', '{}', 'intermediate'),
  ('Tractions Australiennes', 'Tractions Australiennes', 'strength', '{back}', '{biceps}', '{}', 'beginner'),
  ('Reverse Fly au Sol', 'Reverse Fly au Sol', 'strength', '{shoulders}', '{back}', '{}', 'beginner'),
  ('Tractions Supination', 'Tractions Supination', 'strength', '{back,biceps}', '{}', '{}', 'intermediate'),
  ('Tractions Australiennes Supination', 'Tractions Australiennes Supination', 'strength', '{back,biceps}', '{}', '{}', 'beginner'),
  ('Fentes Bulgares', 'Fentes Bulgares', 'strength', '{quads,glutes}', '{}', '{}', 'intermediate'),
  ('Single-Leg Romanian Deadlift', 'Single-Leg Romanian Deadlift', 'strength', '{hamstrings,glutes}', '{core}', '{}', 'intermediate'),
  ('Élévation Mollet 1 Jambe', 'Élévation Mollet 1 Jambe', 'strength', '{calves}', '{}', '{}', 'beginner')
on conflict (id) do nothing;

with
  -- -------------------------------------------------------------------
  -- Push
  -- -------------------------------------------------------------------
  push_session as (
    insert into public.user_sessions (user_id, name, visibility)
    values ('856935cf-dd45-43d7-a42c-b11f6b230886', 'Push', 'public')
    returning id
  ),
  push_block as (
    insert into public.user_session_blocks (session_id, "order", format)
    select id, 0, 'strength' from push_session
    returning id as block_id, session_id
  ),
  push_spec (exercise_id, home_alt, reps, rest_sec, ord) as (
    values
      ('Barbell_Bench_Press_-_Medium_Grip', 'Dips_-_Chest_Version', 8, 120, 0),
      ('Barbell_Shoulder_Press', 'Pike Push-Up', 8, 90, 1),
      ('Cable_Crossover', 'Pompes Archer', 10, 90, 2),
      ('Side_Lateral_Raise', 'Élévations en Planche', 12, 60, 3),
      ('Triceps_Pushdown', 'Pompes Diamant', 10, 60, 4)
  ),
  push_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", reps, rest_sec, home_alternative_exercise_id)
    select b.session_id, b.block_id, s.exercise_id, s.ord, s.reps, s.rest_sec, s.home_alt
    from push_block b
    cross join push_spec s
    returning 1
  ),

  -- -------------------------------------------------------------------
  -- Pull
  -- -------------------------------------------------------------------
  pull_session as (
    insert into public.user_sessions (user_id, name, visibility)
    values ('856935cf-dd45-43d7-a42c-b11f6b230886', 'Pull', 'public')
    returning id
  ),
  pull_block as (
    insert into public.user_session_blocks (session_id, "order", format)
    select id, 0, 'strength' from pull_session
    returning id as block_id, session_id
  ),
  pull_spec (exercise_id, home_alt, reps, rest_sec, ord) as (
    values
      ('Wide-Grip_Lat_Pulldown', 'Pullups', 6, 120, 0),
      ('Bent_Over_Barbell_Row', 'Tractions Australiennes', 8, 90, 1),
      ('Bent_Over_Dumbbell_Rear_Delt_Raise_With_Head_On_Bench', 'Reverse Fly au Sol', 12, 60, 2),
      ('Barbell_Curl', 'Tractions Supination', 8, 90, 3),
      ('Hammer_Curls', 'Tractions Australiennes Supination', 10, 60, 4)
  ),
  pull_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", reps, rest_sec, home_alternative_exercise_id)
    select b.session_id, b.block_id, s.exercise_id, s.ord, s.reps, s.rest_sec, s.home_alt
    from pull_block b
    cross join pull_spec s
    returning 1
  ),

  -- -------------------------------------------------------------------
  -- Jambes
  -- -------------------------------------------------------------------
  legs_session as (
    insert into public.user_sessions (user_id, name, visibility)
    values ('856935cf-dd45-43d7-a42c-b11f6b230886', 'Jambes', 'public')
    returning id
  ),
  legs_block as (
    insert into public.user_session_blocks (session_id, "order", format)
    select id, 0, 'strength' from legs_session
    returning id as block_id, session_id
  ),
  legs_spec (exercise_id, home_alt, reps, rest_sec, ord) as (
    values
      ('Barbell_Squat', 'Freehand_Jump_Squat', 8, 120, 0),
      ('Dumbbell_Lunges', 'Fentes Bulgares', 10, 90, 1),
      ('Romanian_Deadlift', 'Single-Leg Romanian Deadlift', 10, 90, 2),
      ('Calf_Press_On_The_Leg_Press_Machine', 'Élévation Mollet 1 Jambe', 15, 60, 3),
      ('Hanging_Leg_Raise', 'Bent-Knee_Hip_Raise', 12, 60, 4)
  ),
  legs_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", reps, rest_sec, home_alternative_exercise_id)
    select b.session_id, b.block_id, s.exercise_id, s.ord, s.reps, s.rest_sec, s.home_alt
    from legs_block b
    cross join legs_spec s
    returning 1
  ),

  -- -------------------------------------------------------------------
  -- Le programme catalogue lui-même.
  -- -------------------------------------------------------------------
  program as (
    insert into public.programs (id, title, author, focus, level, weeks, sessions_per_week, description, price_cents, published)
    values (
      'prog-ppl-supotsu', 'Push/Pull/Legs', 'Supotsu', 'strength', 'beginner', 6, 3,
      'Programme hybride Push/Pull/Legs sur 6 semaines — machines et charges libres en salle, avec une alternative au poids du corps pour chaque exercice (Calisthenics).',
      0, true
    )
    returning id
  )
insert into public.program_sessions (program_id, session_id, week_number, "order")
select program.id, x.session_id, w.week_number, x."order"
from program
cross join (values (1), (2), (3), (4), (5), (6)) as w(week_number)
cross join (
  select id as session_id, 0 as "order" from push_session
  union all
  select id, 1 from pull_session
  union all
  select id, 2 from legs_session
) as x(session_id, "order");
```

- [ ] **Step 2: Vérifier l équilibre des parenthèses et l absence de colonnes entièrement NULL**

Run:
```bash
python3 -c "
lines = open('supabase/manual/2026-10-09-ppl-program-content.sql').read().split(chr(10))
depth = 0
in_str = False
for lineno, raw in enumerate(lines, 1):
    j = 0
    while j < len(raw):
        if not in_str and raw[j:j+2] == '--':
            break
        if raw[j] == chr(39):
            if in_str and j+1 < len(raw) and raw[j+1] == chr(39):
                j += 2
                continue
            in_str = not in_str
        elif not in_str:
            if raw[j] == '(':
                depth += 1
            elif raw[j] == ')':
                depth -= 1
                if depth < 0:
                    print('UNBALANCED at line', lineno, raw)
        j += 1
print('final depth:', depth)
"
```
Expected: `final depth: 0`, aucune ligne `UNBALANCED`.

- [ ] **Step 3: Commit**

```bash
git add supabase/manual/2026-10-09-ppl-program-content.sql
git commit -m "feat: contenu catalogue PPL avec alternatives maison"
```

**Note pour l'utilisateur (pas une étape automatisée) :** ce script crée un nouveau programme catalogue — si `prog-ppl-supotsu` existe déjà en base (ancien script du 22/09), il faut d'abord relancer `2026-10-07-reset-program-catalog.sql` ou supprimer cette ligne de `public.programs` avant d'exécuter celui-ci, sinon conflit d'id primaire.

---

## Self-review (fait avant remise du plan)

- **Couverture spec** : migration ✓ (Task 1), types ✓ (Task 2-3), lecture ✓ (Task 4), écriture/copie à l'inscription ✓ (Task 5), choix UI au lancement ✓ (Task 6-7), substitution au runner ✓ (Task 8), contenu PPL ✓ (Task 9). Hors scope explicitement non traité : pas de tâche pour une UI de création d'alternative sur une séance personnelle, pas de mémorisation du choix — conforme à la spec.
- **Placeholders** : aucun "TBD"/"TODO" ; chaque étape de code a son contenu exact.
- **Cohérence des types/noms** : `homeAlternativeExerciseId` (camelCase, TS) / `home_alternative_exercise_id` (snake_case, DB) utilisés de façon cohérente à travers toutes les tâches ; `substituteForLocation(sets, mode)` défini en Task 8 n'est utilisé qu'en Task 8, signature stable.
