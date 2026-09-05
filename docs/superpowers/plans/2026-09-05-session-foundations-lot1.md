# Lot 1 — Fondations création & suivi de séance

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** poser le modèle de données, les préférences et les moteurs purs dont
les lots Runner et Création dépendent, sans changer quoi que ce soit de visible.

**Architecture :** quatre colonnes additives sur `workout_sets` (`planned_reps`,
`planned_weight_kg`, `rir`, `is_warmup`, `completed_at`), leurs équivalents dans
`SetEntry`, quatre nouvelles préférences dans le store `secureStorage` existant,
et trois moteurs purs testés dans `packages/engines` (disques, échauffement,
adhésion au plan). `suggestProgression` passe d'une phrase française codée en dur
à une donnée structurée traduisible.

**Tech Stack :** TypeScript, Supabase/Postgres, Vitest, React Native/Expo.

**Spec :** `docs/superpowers/specs/2026-09-05-session-creation-and-runner-design.md`

## Global Constraints

- `reps`/`weightKg` portent la meilleure vérité connue (prévu tant que non logué,
  réalisé ensuite). `plannedReps`/`plannedWeightKg` ne sont jamais réécrits.
- Colonnes nullables, sauf `is_warmup` (défaut `false`). Aucune donnée existante
  invalidée ; `planned_reps` à `null` = « aucun plan enregistré », cas légitime.
- Le chemin d'import Garmin n'écrit **pas** `planned_*` : ce sont des séances
  historiques, jamais programmées dans l'app.
- Moteurs purs : aucune dépendance UI, aucune chaîne traduisible.
- Aucune chaîne visible ajoutée dans ce lot → aucun travail i18n.
- Branche `claude/spot-wellness-app-r6l5bj`, `git pull --rebase` avant push.
- Vérification après chaque tâche : `npx vitest run` depuis la racine, plus
  `npx tsc --noEmit` sur les packages touchés.

---

### Task 1 : Moteur — calculateur de disques

**Files:**
- Create: `packages/engines/src/plates.ts`
- Create: `packages/engines/src/plates.test.ts`
- Modify: `packages/engines/src/index.ts`

**Interfaces:**
- Produces: `computePlates(targetKg, barKg, available) => PlateSolution | undefined`,
  types `PlateCount { plateKg, count }` et `PlateSolution { perSide, achievedKg }`.
  Consommé par le Lot 2 (carte « Disques » du runner).

- [ ] **Step 1 : écrire le test qui échoue**

Créer `packages/engines/src/plates.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { computePlates } from './plates';

const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

describe('computePlates', () => {
  it('décompose une charge atteignable exactement', () => {
    // 62,5 = barre 20 + 2 x (20 + 1,25)
    expect(computePlates(62.5, 20, PLATES)).toEqual({
      perSide: [{ plateKg: 20, count: 1 }, { plateKg: 1.25, count: 1 }],
      achievedKg: 62.5,
    });
  });

  it('empile plusieurs fois le même disque', () => {
    expect(computePlates(120, 20, PLATES)).toEqual({
      perSide: [{ plateKg: 25, count: 2 }],
      achievedKg: 120,
    });
  });

  it('rend la barre nue quand la cible vaut la barre', () => {
    expect(computePlates(20, 20, PLATES)).toEqual({ perSide: [], achievedKg: 20 });
  });

  it('retourne undefined sous le poids de la barre', () => {
    expect(computePlates(15, 20, PLATES)).toBeUndefined();
  });

  it('descend au plus proche atteignable quand la cible ne tombe pas juste', () => {
    // 61 kg impossible avec ces disques : 60 est le plus proche en dessous.
    const s = computePlates(61, 20, PLATES)!;
    expect(s.achievedKg).toBe(60);
    expect(s.perSide).toEqual([{ plateKg: 20, count: 1 }]);
  });

  it('trie les disques fournis en désordre et ignore les valeurs invalides', () => {
    expect(computePlates(62.5, 20, [1.25, 20, 0, -5, 20])).toEqual({
      perSide: [{ plateKg: 20, count: 1 }, { plateKg: 1.25, count: 1 }],
      achievedKg: 62.5,
    });
  });

  it('retourne la barre nue quand aucun disque n’est disponible', () => {
    expect(computePlates(60, 20, [])).toEqual({ perSide: [], achievedKg: 20 });
  });
});
```

- [ ] **Step 2 : lancer le test, vérifier qu'il échoue**

Run: `npx vitest run packages/engines/src/plates.test.ts`
Expected: FAIL — `Failed to resolve import "./plates"`.

- [ ] **Step 3 : écrire l'implémentation**

Créer `packages/engines/src/plates.ts` :

```ts
/**
 * Calculateur de disques (Lot 1 — fondations création & suivi). Pur : une
 * charge cible, un poids de barre et les disques disponibles en entrée, la
 * pile d'un côté en sortie. Ne connaît ni l'UI ni les préférences.
 */

export interface PlateCount {
  plateKg: number;
  count: number;
}

export interface PlateSolution {
  /** Disques d'un seul côté de la barre, du plus lourd au plus léger. */
  perSide: PlateCount[];
  /** Charge réellement atteinte — inférieure à la cible si les disques ne tombent pas juste. */
  achievedKg: number;
}

/** Tolérance de comparaison : les disques vont au quart de kilo, les flottants dérivent. */
const EPSILON = 1e-9;

/**
 * Décomposition gloutonne : à chaque étape le disque le plus lourd qui tient
 * encore dans ce qu'il reste à charger. Optimal ici parce que les jeux de
 * disques réels sont "canoniques" (chaque disque est un multiple des plus
 * petits), et de toute façon c'est ainsi qu'on charge une barre en salle.
 * Retourne undefined si la cible est sous le poids de la barre.
 */
export function computePlates(
  targetKg: number,
  barKg: number,
  available: number[],
): PlateSolution | undefined {
  if (!Number.isFinite(targetKg) || !Number.isFinite(barKg)) return undefined;
  if (targetKg < barKg - EPSILON) return undefined;

  // Une barre se charge symétriquement : on raisonne sur un seul côté.
  let remainingPerSide = (targetKg - barKg) / 2;
  const usable = [...new Set(available.filter((p) => Number.isFinite(p) && p > 0))].sort((a, b) => b - a);

  const perSide: PlateCount[] = [];
  for (const plateKg of usable) {
    const count = Math.floor((remainingPerSide + EPSILON) / plateKg);
    if (count <= 0) continue;
    perSide.push({ plateKg, count });
    remainingPerSide -= count * plateKg;
  }

  const loadedPerSide = perSide.reduce((sum, p) => sum + p.plateKg * p.count, 0);
  return { perSide, achievedKg: barKg + loadedPerSide * 2 };
}
```

- [ ] **Step 4 : lancer le test, vérifier qu'il passe**

Run: `npx vitest run packages/engines/src/plates.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5 : exporter depuis le barrel**

Dans `packages/engines/src/index.ts`, après la ligne `export * from './load';`, ajouter :

```ts
export * from './plates';
```

- [ ] **Step 6 : vérifier et committer**

Run: `npx tsc --noEmit -p packages/engines && npx vitest run`
Expected: aucune erreur, suite complète verte.

```bash
git add packages/engines/src/plates.ts packages/engines/src/plates.test.ts packages/engines/src/index.ts
git commit -m "Add pure barbell plate calculator engine"
```

---

### Task 2 : Moteur — rampe d'échauffement

**Files:**
- Create: `packages/engines/src/warmup.ts`
- Create: `packages/engines/src/warmup.test.ts`
- Modify: `packages/engines/src/index.ts`

**Interfaces:**
- Produces: `warmupRamp(workKg, workReps, opts?) => WarmupSet[]`, type
  `WarmupSet { weightKg, reps, percent }`. Consommé par le Lot 2.

- [ ] **Step 1 : écrire le test qui échoue**

Créer `packages/engines/src/warmup.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { warmupRamp } from './warmup';

describe('warmupRamp', () => {
  it('produit une rampe 40/60/80 % avec reps dégressives', () => {
    expect(warmupRamp(100, 8)).toEqual([
      { weightKg: 40, reps: 8, percent: 40 },
      { weightKg: 60, reps: 5, percent: 60 },
      { weightKg: 80, reps: 3, percent: 80 },
    ]);
  });

  it('arrondit au pas de 2,5 kg par défaut', () => {
    // 62,5 x 40 % = 25 ; x 60 % = 37,5 ; x 80 % = 50
    expect(warmupRamp(62.5, 8).map((s) => s.weightKg)).toEqual([25, 37.5, 50]);
  });

  it('respecte un pas d’arrondi personnalisé', () => {
    expect(warmupRamp(100, 8, { roundToKg: 5 }).map((s) => s.weightKg)).toEqual([40, 60, 80]);
  });

  it('ne descend jamais une marche à zéro', () => {
    // 5 kg x 40 % = 2 -> arrondi à 2,5 plutôt qu'à 0.
    const ramp = warmupRamp(5, 10);
    expect(ramp.every((s) => s.weightKg > 0)).toBe(true);
  });

  it('retourne une rampe vide pour une charge nulle ou négative', () => {
    expect(warmupRamp(0, 8)).toEqual([]);
    expect(warmupRamp(-20, 8)).toEqual([]);
  });

  it('borne les reps d’échauffement même pour une série de travail très longue', () => {
    expect(warmupRamp(100, 30).map((s) => s.reps)).toEqual([10, 6, 3]);
  });
});
```

- [ ] **Step 2 : lancer le test, vérifier qu'il échoue**

Run: `npx vitest run packages/engines/src/warmup.test.ts`
Expected: FAIL — `Failed to resolve import "./warmup"`.

- [ ] **Step 3 : écrire l'implémentation**

Créer `packages/engines/src/warmup.ts` :

```ts
/**
 * Rampe d'échauffement (Lot 1 — fondations création & suivi). Pur : une série
 * de travail en entrée, les marches d'échauffement en sortie. Le moteur ignore
 * le poids de la barre — c'est à l'appelant de filtrer les marches plus légères
 * que la barre à vide, il est le seul à connaître le matériel de l'utilisateur.
 */

export interface WarmupSet {
  weightKg: number;
  reps: number;
  percent: number;
}

export interface WarmupOptions {
  /** Pas d'arrondi des charges, en kg. */
  roundToKg?: number;
}

/** Pourcentages de la charge de travail, et reps associées — dégressives : on s'échauffe, on ne fatigue pas. */
const STEPS: { percent: number; repsFactor: number; maxReps: number }[] = [
  { percent: 40, repsFactor: 1, maxReps: 10 },
  { percent: 60, repsFactor: 0.6, maxReps: 6 },
  { percent: 80, repsFactor: 0.4, maxReps: 3 },
];

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/**
 * Rampe vers une série de travail : ~40/60/80 % de la charge, reps dégressives.
 * Vide si la charge de travail n'est pas exploitable (nulle, négative, non finie).
 */
export function warmupRamp(workKg: number, workReps: number, opts: WarmupOptions = {}): WarmupSet[] {
  if (!Number.isFinite(workKg) || workKg <= 0) return [];
  const step = opts.roundToKg && opts.roundToKg > 0 ? opts.roundToKg : 2.5;
  const baseReps = Number.isFinite(workReps) && workReps > 0 ? workReps : 1;

  return STEPS.map(({ percent, repsFactor, maxReps }) => ({
    // Jamais zéro : une marche à 0 kg n'est pas un échauffement, on garde le
    // plus petit incrément représentable à la place.
    weightKg: Math.max(step, roundTo((workKg * percent) / 100, step)),
    reps: Math.max(1, Math.min(maxReps, Math.round(baseReps * repsFactor))),
    percent,
  }));
}
```

- [ ] **Step 4 : lancer le test, vérifier qu'il passe**

Run: `npx vitest run packages/engines/src/warmup.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5 : exporter depuis le barrel**

Dans `packages/engines/src/index.ts`, après `export * from './plates';`, ajouter :

```ts
export * from './warmup';
```

- [ ] **Step 6 : vérifier et committer**

Run: `npx tsc --noEmit -p packages/engines && npx vitest run`

```bash
git add packages/engines/src/warmup.ts packages/engines/src/warmup.test.ts packages/engines/src/index.ts
git commit -m "Add pure warmup ramp engine"
```

---

### Task 3 : Modèle — `SetEntry` et types de base de données

**Files:**
- Modify: `packages/core/src/training.ts`
- Create: `supabase/migrations/0029_set_planned_effort_warmup.sql`
- Modify: `packages/database/src/generated/database.types.ts`

**Interfaces:**
- Produces: `SetEntry.plannedReps`, `.plannedWeightKg`, `.rir`, `.isWarmup`,
  `.completedAt`. Consommé par les tâches 4, 5 et 6, et par les lots 2 et 3.

- [ ] **Step 1 : étendre `SetEntry`**

Dans `packages/core/src/training.ts`, remplacer :

```ts
  /** Set-level RPE. */
  rpe?: number;
  /** Sets sharing this number, within the same block and adjacent in order, form one superset — alternated live, no rest between members. */
  supersetGroup?: number;
}
```

par :

```ts
  /** Set-level RPE. */
  rpe?: number;
  /** Sets sharing this number, within the same block and adjacent in order, form one superset — alternated live, no rest between members. */
  supersetGroup?: number;
  /**
   * What was programmed, never rewritten after creation. reps/weightKg above
   * hold the best known truth — the plan until the set is logged, the actual
   * performance afterwards — so every existing reader stays correct and gets
   * more accurate. Undefined for anything created before migration 0029.
   */
  plannedReps?: number;
  plannedWeightKg?: number;
  /** Reps in reserve — the alternative to rpe, picked via the effortMetric preference. */
  rir?: number;
  /** A warm-up set: shown while training, excluded from volume, records and adherence. */
  isWarmup?: boolean;
  /**
   * When the set was ticked off in the runner. Absent means never performed —
   * which is what separates "done exactly as planned" from "skipped", since
   * the runner prefills every set with its planned values.
   */
  completedAt?: ISODateString;
}
```

- [ ] **Step 2 : écrire la migration**

Créer `supabase/migrations/0029_set_planned_effort_warmup.sql` :

```sql
-- Lot 1 des fondations création & suivi de séance.
-- Voir docs/superpowers/specs/2026-09-05-session-creation-and-runner-design.md
--
-- reps/weight_kg gardent la meilleure vérité connue (le prévu tant que la
-- série n'est pas loguée, le réalisé ensuite) : tous les écrans et moteurs
-- existants continuent donc de fonctionner sans modification. planned_* ne
-- fait que conserver ce qui était programmé, et n'est jamais réécrit.
--
-- completed_at est indispensable à l'adhésion au plan : le runner pré-remplit
-- chaque série avec le prévu, donc sans ce champ une série jamais faite est
-- indiscernable d'une série faite exactement comme prévu.

alter table public.workout_sets
  add column planned_reps smallint,
  add column planned_weight_kg numeric(6, 2),
  add column rir smallint check (rir between 0 and 10),
  add column is_warmup boolean not null default false,
  add column completed_at timestamptz;

-- La bibliothèque « Mes séances » retient l'échauffement pour le restituer au
-- lancement. Le prévu/réalisé n'y a en revanche aucun sens : pas de planned_*.
alter table public.user_session_exercises
  add column is_warmup boolean not null default false;
```

- [ ] **Step 3 : mettre à jour les types générés — `workout_sets`**

Dans `packages/database/src/generated/database.types.ts`, remplacer :

```ts
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
```

par :

```ts
          rpe: number | null;
          block_id: string | null;
          superset_group: number | null;
          planned_reps: number | null;
          planned_weight_kg: number | null;
          rir: number | null;
          is_warmup: boolean;
          completed_at: string | null;
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
          planned_reps?: number | null;
          planned_weight_kg?: number | null;
          rir?: number | null;
          is_warmup?: boolean;
          completed_at?: string | null;
        };
```

- [ ] **Step 4 : mettre à jour les types générés — `user_session_exercises`**

Dans le même fichier, remplacer :

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
```

par :

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
          is_warmup: boolean;
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
          is_warmup?: boolean;
        };
```

- [ ] **Step 5 : vérifier et committer**

Run: `npx tsc --noEmit -p packages/core && npx tsc --noEmit -p packages/database && npx vitest run`
Expected: aucune erreur (les nouveaux champs sont tous optionnels).

```bash
git add packages/core/src/training.ts supabase/migrations/0029_set_planned_effort_warmup.sql packages/database/src/generated/database.types.ts
git commit -m "Add planned/effort/warmup/completion fields to the set model"
```

---

### Task 4 : Moteur — adhésion au plan

**Files:**
- Create: `packages/engines/src/adherence.ts`
- Create: `packages/engines/src/adherence.test.ts`
- Modify: `packages/engines/src/index.ts`

**Interfaces:**
- Consumes: `SetEntry` étendu (tâche 3).
- Produces: `computePlanAdherence(sets) => PlanAdherence | undefined`, type
  `PlanAdherence { ratio, comparedSets, metOrExceeded }`. Consommé par le Lot 2
  (badge sur la fiche de séance).

- [ ] **Step 1 : écrire le test qui échoue**

Créer `packages/engines/src/adherence.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import type { SetEntry } from '@supotsu/core';
import { computePlanAdherence } from './adherence';

const set = (over: Partial<SetEntry>): SetEntry => ({
  id: 'sx',
  workoutId: 'w1',
  exerciseId: 'squat',
  order: 0,
  completedAt: '2026-09-05T10:00:00.000Z',
  ...over,
});

describe('computePlanAdherence', () => {
  it('rend 100 % quand tout est réalisé comme prévu', () => {
    const sets = [
      set({ plannedReps: 8, plannedWeightKg: 60, reps: 8, weightKg: 60 }),
      set({ plannedReps: 8, plannedWeightKg: 60, reps: 8, weightKg: 60 }),
    ];
    expect(computePlanAdherence(sets)).toEqual({ ratio: 1, comparedSets: 2, metOrExceeded: 2 });
  });

  it('compte une série non validée comme un réalisé nul', () => {
    const sets = [
      set({ plannedReps: 10, plannedWeightKg: 50, reps: 10, weightKg: 50 }),
      // Pré-remplie par le runner mais jamais cochée : ne compte pas comme faite.
      set({ plannedReps: 10, plannedWeightKg: 50, reps: 10, weightKg: 50, completedAt: undefined }),
    ];
    expect(computePlanAdherence(sets)).toEqual({ ratio: 0.5, comparedSets: 2, metOrExceeded: 1 });
  });

  it('capte une baisse de charge à reps identiques', () => {
    // Les reps seules diraient 100 % : c'est précisément ce que le tonnage évite.
    const sets = [set({ plannedReps: 8, plannedWeightKg: 62.5, reps: 8, weightKg: 50 })];
    expect(computePlanAdherence(sets)!.ratio).toBeCloseTo(0.8, 5);
  });

  it('exclut les séries d’échauffement des deux côtés', () => {
    const sets = [
      set({ isWarmup: true, plannedReps: 8, plannedWeightKg: 25, reps: 8, weightKg: 25 }),
      set({ plannedReps: 8, plannedWeightKg: 60, reps: 4, weightKg: 60 }),
    ];
    expect(computePlanAdherence(sets)).toEqual({ ratio: 0.5, comparedSets: 1, metOrExceeded: 0 });
  });

  it('ignore les séries sans plan et retourne undefined s’il n’en reste aucune', () => {
    expect(computePlanAdherence([set({ reps: 8, weightKg: 60 })])).toBeUndefined();
    expect(computePlanAdherence([])).toBeUndefined();
  });

  it('borne le dépassement à 200 %', () => {
    const sets = [set({ plannedReps: 5, plannedWeightKg: 20, reps: 40, weightKg: 20 })];
    expect(computePlanAdherence(sets)!.ratio).toBe(2);
  });

  it('compte les reps quand il n’y a pas de charge', () => {
    const sets = [set({ plannedReps: 20, reps: 15 })];
    expect(computePlanAdherence(sets)!.ratio).toBeCloseTo(0.75, 5);
  });
});
```

- [ ] **Step 2 : lancer le test, vérifier qu'il échoue**

Run: `npx vitest run packages/engines/src/adherence.test.ts`
Expected: FAIL — `Failed to resolve import "./adherence"`.

- [ ] **Step 3 : écrire l'implémentation**

Créer `packages/engines/src/adherence.ts` :

```ts
import type { SetEntry } from '@supotsu/core';

/**
 * Adhésion au plan (Lot 1 — fondations création & suivi) : ce qui était
 * programmé face à ce qui a été réalisé, sur une séance. Pur.
 */

export interface PlanAdherence {
  /** Réalisé / prévu, borné à [0, 2] — au-delà de 200 % la valeur ne dit plus rien d'utile. */
  ratio: number;
  /** Séries porteuses d'un plan, hors échauffement. */
  comparedSets: number;
  /** Parmi elles, celles atteintes ou dépassées. */
  metOrExceeded: number;
}

/** Ratio maximal retenu : au-delà, le chiffre cesse d'être informatif. */
const MAX_RATIO = 2;

/**
 * Contribution d'une série, en tonnage. Le tonnage plutôt que les reps parce
 * que les reps seules manquent les écarts de charge : prévu 8 x 62,5 kg,
 * réalisé 8 x 50 kg donnerait 100 %. Une charge absente compte pour 1 afin que
 * les séries au poids du corps pèsent leurs répétitions.
 */
function tonnage(reps: number | undefined, weightKg: number | undefined): number {
  return (reps ?? 0) * (weightKg ?? 1);
}

/**
 * Adhésion d'une séance. Retourne undefined quand aucune série ne porte de
 * plan — tout l'historique antérieur à la migration 0029 — pour que l'appelant
 * n'affiche simplement rien plutôt que d'avoir à gérer un cas d'erreur.
 */
export function computePlanAdherence(sets: SetEntry[]): PlanAdherence | undefined {
  const planned = sets.filter((s) => !s.isWarmup && s.plannedReps !== undefined);
  if (planned.length === 0) return undefined;

  let plannedTotal = 0;
  let actualTotal = 0;
  let metOrExceeded = 0;

  for (const s of planned) {
    const target = tonnage(s.plannedReps, s.plannedWeightKg);
    // Sans completedAt la série n'a pas été faite, quelles que soient les
    // valeurs qu'elle porte : le runner les a pré-remplies avec le prévu.
    const done = s.completedAt ? tonnage(s.reps, s.weightKg) : 0;
    plannedTotal += target;
    actualTotal += done;
    if (done >= target) metOrExceeded += 1;
  }

  if (plannedTotal <= 0) return undefined;
  return {
    ratio: Math.min(MAX_RATIO, actualTotal / plannedTotal),
    comparedSets: planned.length,
    metOrExceeded,
  };
}
```

- [ ] **Step 4 : lancer le test, vérifier qu'il passe**

Run: `npx vitest run packages/engines/src/adherence.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5 : exporter depuis le barrel**

Dans `packages/engines/src/index.ts`, après `export * from './warmup';`, ajouter :

```ts
export * from './adherence';
```

- [ ] **Step 6 : vérifier et committer**

Run: `npx tsc --noEmit -p packages/engines && npx vitest run`

```bash
git add packages/engines/src/adherence.ts packages/engines/src/adherence.test.ts packages/engines/src/index.ts
git commit -m "Add pure plan-adherence engine"
```

---

### Task 5 : `suggestProgression` internationalisable

**Files:**
- Modify: `packages/engines/src/training.ts`
- Modify: `packages/engines/src/training.test.ts`

**Interfaces:**
- Produces: `ProgressionRationale` (union discriminée) remplaçant
  `rationale: string`. Consommé par le Lot 3 (carte « Suggéré » du builder).

- [ ] **Step 1 : remplacer le type de `rationale`**

Dans `packages/engines/src/training.ts`, remplacer :

```ts
export interface ProgressionSuggestion {
  weightKg?: number;
  reps?: number;
  rationale: string;
}
```

par :

```ts
/**
 * Pourquoi cette suggestion — donnée structurée, pas une phrase. Le moteur
 * reste sans langue : c'est l'app qui traduit chaque `kind` avec ses
 * paramètres (clés sport.progression.rationale.*).
 */
export type ProgressionRationale =
  | { kind: 'addRep'; reps: number }
  | { kind: 'increaseLoad'; fromWeightKg: number; toWeightKg: number; highReps: number; lowReps: number }
  | { kind: 'addRepSameLoad'; reps: number; weightKg: number };

export interface ProgressionSuggestion {
  weightKg?: number;
  reps?: number;
  rationale: ProgressionRationale;
}
```

- [ ] **Step 2 : remplacer les trois retours**

Dans le même fichier, remplacer :

```ts
    return { reps: bestReps + 1, rationale: `Ajoute une répétition (${bestReps + 1}) par rapport à ta dernière séance.` };
```

par :

```ts
    return { reps: bestReps + 1, rationale: { kind: 'addRep', reps: bestReps + 1 } };
```

Puis remplacer :

```ts
    return {
      weightKg,
      reps: low,
      rationale: `Tu as atteint ${high} reps à ${top.weightKg} kg — passe à ${weightKg} kg pour ${low} reps.`,
    };
```

par :

```ts
    return {
      weightKg,
      reps: low,
      rationale: {
        kind: 'increaseLoad',
        fromWeightKg: top.weightKg!,
        toWeightKg: weightKg,
        highReps: high,
        lowReps: low,
      },
    };
```

Puis remplacer :

```ts
  return {
    weightKg: top.weightKg,
    reps: top.reps! + 1,
    rationale: `Vise ${top.reps! + 1} reps à ${top.weightKg} kg (même charge) avant d’augmenter.`,
  };
```

par :

```ts
  return {
    weightKg: top.weightKg,
    reps: top.reps! + 1,
    rationale: { kind: 'addRepSameLoad', reps: top.reps! + 1, weightKg: top.weightKg! },
  };
```

- [ ] **Step 3 : ajouter les tests des trois `kind`**

Dans `packages/engines/src/training.test.ts`, ajouter à la fin du fichier :

```ts
describe('suggestProgression — rationale structurée', () => {
  it('addRep quand aucune charge n’est enregistrée', () => {
    const s = suggestProgression([
      { id: 's1', workoutId: 'w', exerciseId: 'pushup', order: 0, reps: 12 },
    ]);
    expect(s?.rationale).toEqual({ kind: 'addRep', reps: 13 });
  });

  it('increaseLoad une fois le haut de la fourchette atteint', () => {
    const s = suggestProgression([
      { id: 's1', workoutId: 'w', exerciseId: 'squat', order: 0, reps: 12, weightKg: 60 },
    ]);
    expect(s?.rationale).toEqual({
      kind: 'increaseLoad',
      fromWeightKg: 60,
      toWeightKg: 62.5,
      highReps: 12,
      lowReps: 8,
    });
  });

  it('addRepSameLoad tant que la fourchette n’est pas atteinte', () => {
    const s = suggestProgression([
      { id: 's1', workoutId: 'w', exerciseId: 'squat', order: 0, reps: 9, weightKg: 60 },
    ]);
    expect(s?.rationale).toEqual({ kind: 'addRepSameLoad', reps: 10, weightKg: 60 });
  });
});
```

Si `suggestProgression` ou `describe` ne sont pas déjà importés en tête du
fichier, les ajouter à l'import existant.

- [ ] **Step 4 : vérifier**

Run: `npx tsc --noEmit -p packages/engines && npx vitest run`
Expected: suite verte. Aucun écran ne consommait `rationale` — s'il apparaît
une erreur de type ailleurs, ne pas contourner : signaler.

- [ ] **Step 5 : committer**

```bash
git add packages/engines/src/training.ts packages/engines/src/training.test.ts
git commit -m "Make progression rationale structured instead of a hardcoded French sentence"
```

---

### Task 6 : Repository — persister les nouveaux champs

**Files:**
- Modify: `apps/mobile/src/lib/data/repository.ts`
- Modify: `apps/mobile/src/features/training/sessionBuilder.ts`

**Interfaces:**
- Consumes: `SetEntry` étendu (tâche 3), types générés (tâche 3).
- Produces: lecture/écriture de `plannedReps`, `plannedWeightKg`, `rir`,
  `isWarmup`, `completedAt` ; `SetDraft.isWarmup`.

- [ ] **Step 1 : ajouter `isWarmup` au brouillon de série**

Dans `apps/mobile/src/features/training/sessionBuilder.ts`, remplacer :

```ts
export interface SetDraft {
  /** The real exercise this slot references — `order`/`selected` are keyed by a synthetic slot id, not this, so the same exercise can appear more than once in a block. */
  exerciseId: string;
  reps: string;
  weight: string;
  rest: string;
}
```

par :

```ts
export interface SetDraft {
  /** The real exercise this slot references — `order`/`selected` are keyed by a synthetic slot id, not this, so the same exercise can appear more than once in a block. */
  exerciseId: string;
  reps: string;
  weight: string;
  rest: string;
  /** Warm-up slot: kept out of volume and records. Set by the runner's auto-ramp (lot 2) or by hand. */
  isWarmup?: boolean;
}
```

- [ ] **Step 2 : étendre la ligne de série du dépôt démo**

Dans `apps/mobile/src/lib/data/repository.ts`, remplacer :

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

par :

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
  plannedReps?: number | null;
  plannedWeightKg?: number | null;
  rir?: number | null;
  isWarmup?: boolean;
  completedAt?: string | null;
}
```

- [ ] **Step 3 : lire les nouveaux champs (dépôt Supabase)**

Dans le même fichier, remplacer **les deux** occurrences identiques (dans
`getWorkoutSets` et `getBlockSets`) de :

```ts
        rpe: r.rpe ?? undefined,
        supersetGroup: r.superset_group ?? undefined,
      }));
```

par :

```ts
        rpe: r.rpe ?? undefined,
        supersetGroup: r.superset_group ?? undefined,
        plannedReps: r.planned_reps ?? undefined,
        plannedWeightKg: r.planned_weight_kg ?? undefined,
        rir: r.rir ?? undefined,
        isWarmup: r.is_warmup ?? undefined,
        completedAt: r.completed_at ?? undefined,
      }));
```

Les deux blocs étant identiques, utiliser un remplacement global (`replace_all`).

- [ ] **Step 4 : écrire `planned_*` à la création (dépôt Supabase)**

Le prévu est la saisie au moment de la création : chaque insertion d'une série
programmée duplique `reps`/`weight_kg` dans `planned_reps`/`planned_weight_kg`.

Appliquer aux **cinq** sites d'insertion de séances programmées. Remplacer
dans `addWorkout` :

```ts
        workout.sets.map((s) => ({
          exercise_id: s.exerciseId,
          order: s.order,
          reps: s.reps ?? null,
          weight_kg: s.weightKg ?? null,
          rest_sec: s.restSec ?? null,
          rpe: s.rpe ?? null,
        })),
```

par :

```ts
        workout.sets.map((s) => ({
          exercise_id: s.exerciseId,
          order: s.order,
          reps: s.reps ?? null,
          weight_kg: s.weightKg ?? null,
          rest_sec: s.restSec ?? null,
          rpe: s.rpe ?? null,
          planned_reps: s.reps ?? null,
          planned_weight_kg: s.weightKg ?? null,
          is_warmup: s.isWarmup ?? false,
        })),
```

Puis, dans `addPlannedWorkout` (chemin blocs) :

```ts
              sets: b.sets.map((s) => ({
                exercise_id: s.exerciseId,
                order: s.order,
                reps: s.reps ?? null,
                weight_kg: s.weightKg ?? null,
                rest_sec: s.restSec ?? null,
              })),
```

par :

```ts
              sets: b.sets.map((s) => ({
                exercise_id: s.exerciseId,
                order: s.order,
                reps: s.reps ?? null,
                weight_kg: s.weightKg ?? null,
                rest_sec: s.restSec ?? null,
                planned_reps: s.reps ?? null,
                planned_weight_kg: s.weightKg ?? null,
                is_warmup: s.isWarmup ?? false,
              })),
```

Puis, dans `addPlannedWorkout` (chemin plat) :

```ts
            input.sets.map((s) => ({
              exercise_id: s.exerciseId,
              order: s.order,
              reps: s.reps ?? null,
              weight_kg: s.weightKg ?? null,
              rest_sec: s.restSec ?? null,
              rpe: s.rpe ?? null,
            })),
```

par :

```ts
            input.sets.map((s) => ({
              exercise_id: s.exerciseId,
              order: s.order,
              reps: s.reps ?? null,
              weight_kg: s.weightKg ?? null,
              rest_sec: s.restSec ?? null,
              rpe: s.rpe ?? null,
              planned_reps: s.reps ?? null,
              planned_weight_kg: s.weightKg ?? null,
              is_warmup: s.isWarmup ?? false,
            })),
```

Puis, dans `addCircuitWorkout` **et** `editCircuitWorkout` — les deux blocs
sont identiques, utiliser un remplacement global. Remplacer :

```ts
          sets: b.sets.map((s) => ({
            exercise_id: s.exerciseId,
            order: s.order,
            reps: s.reps ?? null,
            weight_kg: s.weightKg ?? null,
            duration_sec: s.durationSec ?? null,
            rest_sec: s.restSec ?? null,
            superset_group: s.supersetGroup ?? null,
          })),
```

par :

```ts
          sets: b.sets.map((s) => ({
            exercise_id: s.exerciseId,
            order: s.order,
            reps: s.reps ?? null,
            weight_kg: s.weightKg ?? null,
            duration_sec: s.durationSec ?? null,
            rest_sec: s.restSec ?? null,
            superset_group: s.supersetGroup ?? null,
            planned_reps: s.reps ?? null,
            planned_weight_kg: s.weightKg ?? null,
            is_warmup: s.isWarmup ?? false,
          })),
```

Enfin, dans `editWorkout`, remplacer :

```ts
        patch.sets.map((s) => ({ exercise_id: s.exerciseId, order: s.order, reps: s.reps ?? null, weight_kg: s.weightKg ?? null, rest_sec: s.restSec ?? null })),
```

par :

```ts
        patch.sets.map((s) => ({ exercise_id: s.exerciseId, order: s.order, reps: s.reps ?? null, weight_kg: s.weightKg ?? null, rest_sec: s.restSec ?? null, planned_reps: s.reps ?? null, planned_weight_kg: s.weightKg ?? null, is_warmup: s.isWarmup ?? false })),
```

**Ne pas toucher** au bloc de `persistImport` (`setsByExternalId`) : les séances
importées de Garmin n'ont jamais été programmées dans l'app, `planned_*` doit
y rester `null`.

- [ ] **Step 5 : vérifier**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json`
Expected: aucune erreur.

Vérifier ensuite qu'aucun site d'insertion de séance programmée n'a été oublié :

Run: `grep -c "planned_reps: s.reps" apps/mobile/src/lib/data/repository.ts`
Expected: `6` (addWorkout, addPlannedWorkout blocs, addPlannedWorkout plat,
addCircuitWorkout, editCircuitWorkout, editWorkout).

- [ ] **Step 6 : lancer la suite complète et committer**

Run: `npx vitest run`

```bash
git add apps/mobile/src/lib/data/repository.ts apps/mobile/src/features/training/sessionBuilder.ts
git commit -m "Persist planned/effort/warmup/completion set fields"
```

---

### Task 7 : Préférences

**Files:**
- Modify: `apps/mobile/src/lib/preferences.tsx`

**Interfaces:**
- Produces: `Preferences.effortMetric`, `.barWeightKg`, `.availablePlates`,
  `.defaultRestSec`. Consommé par le Lot 2.

- [ ] **Step 1 : ajouter le type de l'échelle d'effort**

Dans `apps/mobile/src/lib/preferences.tsx`, remplacer :

```ts
export type UnitSystem = 'metric' | 'imperial';
export type TimeFormat = '24h' | '12h';
```

par :

```ts
export type UnitSystem = 'metric' | 'imperial';
export type TimeFormat = '24h' | '12h';
/** Comment l'effort d'une série se saisit dans le runner : RPE (1-10) ou reps en réserve. */
export type EffortMetric = 'rpe' | 'rir';
```

- [ ] **Step 2 : ajouter les quatre champs**

Dans le même fichier, remplacer :

```ts
  /** 'auto' follows the phone's language (expo-localization); otherwise a specific choice. */
  language: LanguagePreference;
}
```

par :

```ts
  /** 'auto' follows the phone's language (expo-localization); otherwise a specific choice. */
  language: LanguagePreference;
  /** Effort scale used per set while training. */
  effortMetric: EffortMetric;
  /** Barbell weight, for the runner's plate calculator. */
  barWeightKg: number;
  /** Plates the user owns (kg, one side), heaviest first. */
  availablePlates: number[];
  /** Rest used when a set carries none — replaces the hardcoded 90 s in the runner. */
  defaultRestSec: number;
}
```

- [ ] **Step 3 : ajouter les défauts**

Dans le même fichier, remplacer :

```ts
  dailyStepsGoal: 10_000,
  language: 'auto',
};
```

par :

```ts
  dailyStepsGoal: 10_000,
  language: 'auto',
  effortMetric: 'rpe',
  barWeightKg: 20,
  availablePlates: [25, 20, 15, 10, 5, 2.5, 1.25],
  defaultRestSec: 90,
};
```

- [ ] **Step 4 : vérifier et committer**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json && cd ../.. && npx vitest run`

Les préférences persistées avant ce lot sont fusionnées avec `DEFAULTS`
(`{ ...DEFAULTS, ...JSON.parse(raw) }`) : les quatre nouveaux champs prennent
donc leur valeur par défaut sans migration ni écriture supplémentaire.

```bash
git add apps/mobile/src/lib/preferences.tsx
git commit -m "Add effort metric, bar weight, plates and default rest preferences"
```

---

### Task 8 : Vérification finale du lot

- [ ] **Step 1 : typecheck complet**

Run:
```bash
npx tsc --noEmit -p packages/core
npx tsc --noEmit -p packages/shared
npx tsc --noEmit -p packages/database
npx tsc --noEmit -p packages/engines
cd apps/mobile && npx tsc --noEmit -p tsconfig.json && cd ../..
```
Expected: aucune erreur.

- [ ] **Step 2 : lint**

Run: `npx eslint packages/engines/src apps/mobile/src/lib/data/repository.ts apps/mobile/src/lib/preferences.tsx apps/mobile/src/features/training/sessionBuilder.ts --ext .ts,.tsx`
Expected: aucune erreur nouvelle. Deux avertissements de variables inutilisées
préexistants dans `NewWorkoutScreen.tsx` (`pickerOpen`, `pastWorkouts`) ne sont
pas dans le périmètre et ne doivent pas être corrigés ici.

- [ ] **Step 3 : suite de tests complète**

Run: `npx vitest run`
Expected: tous les fichiers verts, ~20 tests de plus qu'avant le lot
(7 disques + 6 échauffement + 7 adhésion + 3 rationale).

- [ ] **Step 4 : bundling web**

Run: `pnpm --filter @supotsu/mobile export:web`
Expected: export réussi.

- [ ] **Step 5 : pousser**

```bash
git pull --rebase
git push
```

- [ ] **Step 6 : signaler la migration à appliquer**

Prévenir l'utilisateur que `0029_set_planned_effort_warmup.sql` doit être
appliquée à la main dans l'éditeur SQL Supabase, comme les 0025-0028, et que
tant qu'elle ne l'est pas les lectures des nouvelles colonnes reviendront
`undefined` sans casser l'app.
