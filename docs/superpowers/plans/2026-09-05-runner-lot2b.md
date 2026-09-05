# Lot 2b — Formats chronométrés & multi-blocs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** refondre les trois formats chronométrés (AMRAP, EMOM, For Time) selon
les maquettes, ajouter un fil des blocs pour les séances multi-blocs, et rendre
tous les chronos justes en arrière-plan avec une vraie pause.

**Architecture :** une horloge commune ancrée sur `Date.now()` avec pause
cumulée, extraite en logique pure testée ; un écran par format, montés par
`CircuitRunnerScreen` ; un écran de fil des blocs.

**Tech Stack :** TypeScript, React Native/Expo, Vitest.

**Spec :** `docs/superpowers/specs/2026-09-05-runner-lot2-design.md`

## Global Constraints

- Les chronos dérivent de `Date.now()` et d'une pause cumulée, jamais d'un
  compteur incrémenté par `setInterval`.
- Les cochages de mouvements pendant un tour sont de l'**état d'écran
  éphémère** : ils se réinitialisent à chaque tour et ne sont jamais écrits en
  base. Le résultat durable d'un bloc chronométré reste `completedRounds` +
  `resultTimeSec`, écrits par `completeBlock` à la fin — modèle déjà en place.
- Toute chaîne visible via `t()`, remplie dans fr/en/es/pt/de.
- Branche `claude/spot-wellness-app-r6l5bj`, `git pull --rebase` avant push.

## Écarts assumés entre maquettes et modèle

Deux éléments des maquettes n'ont aucun support dans le modèle actuel :

**Schéma dégressif « 21-15-9 » (For Time).** Le modèle n'a pas de reps par
tour : un bloc porte des séries à reps fixes et un `targetRounds`. Afficher un
vrai 21-15-9 demanderait une colonne de schéma sur `workout_blocks`, sa saisie
dans le builder (lot 3) et sa restitution. **Hors périmètre du 2b** : l'écran
affiche « Round X / Y » avec les reps du bloc. À rouvrir comme travail à part
entière si le besoin se confirme.

**Objectif de temps (For Time).** `timeCapSec` est documenté comme « plafond
AMRAP, ou durée d'intervalle EMOM » et n'est **pas utilisé** par le format
for_time. On le réemploie comme objectif de temps pour ce format : aucune
migration, aucun champ nouveau. L'objectif s'affiche seulement quand il est
renseigné.

## Écran AMRAP (aucune maquette fournie)

Construit par analogie avec EMOM et For Time, dont il partage la structure :

1. bandeau de format « AMRAP · {n} min » et fréquence cardiaque (existant) ;
2. carte de chrono dominante : **décompte** du plafond, libellé « restant » ;
3. sous le chrono, deux indicateurs discrets : tours réalisés et **cadence**
   (temps moyen par tour, masquée tant qu'aucun tour n'est fini — une moyenne
   sur zéro tour n'a pas de sens) ;
4. liste des mouvements du tour en cours, cochables ;
5. pied : pause, et « Tour terminé » qui incrémente le compteur et remet les
   cochages à zéro.

---

### Task 1 : Horloge de run et calculs de format

**Files:**
- Modify: `apps/mobile/src/features/training/runnerState.ts`
- Modify: `apps/mobile/src/features/training/runnerState.test.ts`

**Interfaces:**
- Produces: `elapsedSecFrom`, `cadenceSecPerRound`, `emomMinuteTask`.
  Consommés par les tâches 3 à 6.

- [ ] **Step 1 : écrire les tests qui échouent**

Ajouter à la fin de `runnerState.test.ts` :

```ts
describe('elapsedSecFrom', () => {
  it('compte depuis le démarrage', () => {
    expect(elapsedSecFrom({ startedAtMs: 1_000, pausedTotalMs: 0 }, 6_000)).toBe(5);
  });

  it('retranche le temps déjà mis en pause', () => {
    expect(elapsedSecFrom({ startedAtMs: 1_000, pausedTotalMs: 2_000 }, 6_000)).toBe(3);
  });

  it('se fige pendant une pause en cours', () => {
    const state = { startedAtMs: 1_000, pausedTotalMs: 0, pausedAtMs: 4_000 };
    // L'horloge murale avance, l'écoulé non.
    expect(elapsedSecFrom(state, 6_000)).toBe(3);
    expect(elapsedSecFrom(state, 60_000)).toBe(3);
  });

  it('ne renvoie jamais de valeur négative', () => {
    expect(elapsedSecFrom({ startedAtMs: 9_000, pausedTotalMs: 0 }, 1_000)).toBe(0);
  });
});

describe('cadenceSecPerRound', () => {
  it('moyenne le temps par tour', () => {
    expect(cadenceSecPerRound(180, 3)).toBe(60);
  });

  it('ne renvoie rien sans tour terminé', () => {
    expect(cadenceSecPerRound(180, 0)).toBeUndefined();
  });
});

describe('emomMinuteTask', () => {
  it('répète l’unique mouvement à chaque minute', () => {
    const sets = [s({ id: 'a', order: 0 })];
    expect(emomMinuteTask(sets, 1)?.id).toBe('a');
    expect(emomMinuteTask(sets, 7)?.id).toBe('a');
  });

  it('alterne les mouvements minute après minute', () => {
    const sets = [s({ id: 'a', order: 0 }), s({ id: 'b', order: 1 })];
    expect(emomMinuteTask(sets, 1)?.id).toBe('a');
    expect(emomMinuteTask(sets, 2)?.id).toBe('b');
    expect(emomMinuteTask(sets, 3)?.id).toBe('a');
  });

  it('ne renvoie rien sans mouvement', () => {
    expect(emomMinuteTask([], 1)).toBeUndefined();
  });
});
```

Compléter l'import en tête du fichier avec `cadenceSecPerRound`,
`elapsedSecFrom` et `emomMinuteTask`.

- [ ] **Step 2 : lancer les tests, vérifier qu'ils échouent**

Run: `npx vitest run apps/mobile/src/features/training/runnerState.test.ts`
Expected: FAIL — les trois fonctions n'existent pas.

- [ ] **Step 3 : implémenter**

Ajouter à la fin de `runnerState.ts` :

```ts
/** Horloge d'un bloc chronométré, avec pause. */
export interface RunClock {
  startedAtMs: number;
  /** Temps total déjà passé en pause. */
  pausedTotalMs: number;
  /** Instant de mise en pause, absent si l'horloge tourne. */
  pausedAtMs?: number;
}

/**
 * Secondes écoulées, pause déduite. Ancré sur l'horloge murale plutôt que sur
 * un compteur : un `setInterval` s'arrête en arrière-plan et un AMRAP de 12
 * minutes en afficherait 9 sans rien signaler.
 */
export function elapsedSecFrom(clock: RunClock, nowMs: number): number {
  const reference = clock.pausedAtMs ?? nowMs;
  return Math.max(0, Math.floor((reference - clock.startedAtMs - clock.pausedTotalMs) / 1000));
}

/** Temps moyen par tour. undefined tant qu'aucun tour n'est fini — une moyenne sur zéro n'a pas de sens. */
export function cadenceSecPerRound(elapsedSec: number, roundsCompleted: number): number | undefined {
  if (roundsCompleted <= 0) return undefined;
  return Math.round(elapsedSec / roundsCompleted);
}

/**
 * Mouvement de la minute EMOM demandée (1-based). Un seul mouvement se répète
 * à chaque minute ; plusieurs s'alternent en boucle.
 */
export function emomMinuteTask<T extends { order: number }>(sets: T[], minute: number): T | undefined {
  if (sets.length === 0) return undefined;
  const ordered = [...sets].sort((a, b) => a.order - b.order);
  return ordered[(Math.max(1, minute) - 1) % ordered.length];
}
```

- [ ] **Step 4 : vérifier et committer**

Run: `npx vitest run apps/mobile/src/features/training/runnerState.test.ts`
Expected: PASS (23 tests au total dans ce fichier).

```bash
git add apps/mobile/src/features/training/runnerState.ts apps/mobile/src/features/training/runnerState.test.ts
git commit -m "Add run clock, cadence and EMOM minute-task logic"
```

---

### Task 2 : Hook d'horloge partagé

**Files:**
- Create: `apps/mobile/src/features/training/useRunClock.ts`

**Interfaces:**
- Consumes: `elapsedSecFrom` (tâche 1).
- Produces: `useRunClock()` → `{ elapsedSec, isPaused, togglePause, reset }`.
  Consommé par les tâches 3 à 5.

- [ ] **Step 1 : écrire le hook**

Créer `apps/mobile/src/features/training/useRunClock.ts` :

```ts
import { useEffect, useMemo, useRef, useState } from 'react';
import { elapsedSecFrom, type RunClock } from './runnerState';

export interface RunClockApi {
  elapsedSec: number;
  isPaused: boolean;
  togglePause: () => void;
  /** Repart de zéro — au changement de bloc. */
  reset: () => void;
}

/**
 * Horloge partagée des blocs chronométrés (Lot 2b). L'intervalle ne fait que
 * rafraîchir l'affichage : la valeur vient toujours d'`elapsedSecFrom`, donc
 * un passage en arrière-plan ne fait pas dériver le chrono.
 */
export function useRunClock(runningKey: string | undefined): RunClockApi {
  const clockRef = useRef<RunClock>({ startedAtMs: Date.now(), pausedTotalMs: 0 });
  const [, forceRender] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Nouveau bloc : nouvelle horloge.
  useEffect(() => {
    clockRef.current = { startedAtMs: Date.now(), pausedTotalMs: 0 };
    setNowMs(Date.now());
  }, [runningKey]);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const elapsedSec = elapsedSecFrom(clockRef.current, nowMs);
  const isPaused = clockRef.current.pausedAtMs !== undefined;

  return useMemo(
    () => ({
      elapsedSec,
      isPaused,
      togglePause: () => {
        const c = clockRef.current;
        clockRef.current = c.pausedAtMs === undefined
          ? { ...c, pausedAtMs: Date.now() }
          // Reprise : le temps passé en pause s'ajoute au cumul, l'origine ne bouge pas.
          : { startedAtMs: c.startedAtMs, pausedTotalMs: c.pausedTotalMs + (Date.now() - c.pausedAtMs) };
        forceRender((n) => n + 1);
        setNowMs(Date.now());
      },
      reset: () => {
        clockRef.current = { startedAtMs: Date.now(), pausedTotalMs: 0 };
        setNowMs(Date.now());
      },
    }),
    [elapsedSec, isPaused],
  );
}
```

- [ ] **Step 2 : vérifier et committer**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json && cd ../.. && npx vitest run`

```bash
git add apps/mobile/src/features/training/useRunClock.ts
git commit -m "Add shared run clock hook with pause"
```

---

### Task 3 : Écran AMRAP

**Files:**
- Create: `apps/mobile/src/features/training/AmrapRunner.tsx`

**Interfaces:**
- Consumes: `useRunClock` (tâche 2), `computeAmrapState`, `formatClock`
  (`blockRunnerEngine`), `cadenceSecPerRound` (tâche 1).

- [ ] **Step 1 : écrire le composant**

Créer `apps/mobile/src/features/training/AmrapRunner.tsx`, structuré comme
décrit en tête de plan (§ « Écran AMRAP ») :

- props : `{ block: WorkoutBlock; sets: SetEntry[]; onFinished: () => void }` ;
- chrono dominant (`variant="display"`) affichant
  `formatClock(computeAmrapState(elapsedSec, block.timeCapSec ?? 0, rounds).displaySec)` ;
- sous le chrono, tours réalisés, et cadence via `cadenceSecPerRound` —
  **masquée** tant qu'aucun tour n'est terminé ;
- liste des mouvements du tour, chacun avec une case cochable en état local ;
  le tableau des cochages se vide à chaque incrément de tour ;
- pied : bouton pause (`togglePause`) et « Tour terminé » ;
- appeler `onFinished()` quand `computeAmrapState(...).isFinished`.

Résolution des noms d'exercices sur les **trois** sources
(`EXERCISE_LIBRARY`, `EXERCISES`, exercices personnalisés), comme
`StrengthRunner`.

- [ ] **Step 2 : vérifier et committer**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json && cd ../.. && npx vitest run`

```bash
git add apps/mobile/src/features/training/AmrapRunner.tsx
git commit -m "Add AMRAP runner screen"
```

---

### Task 4 : Écran EMOM

**Files:**
- Create: `apps/mobile/src/features/training/EmomRunner.tsx`

**Interfaces:**
- Consumes: `useRunClock`, `computeEmomState`, `emomMinuteTask` (tâche 1).

- [ ] **Step 1 : écrire le composant**

Créer `apps/mobile/src/features/training/EmomRunner.tsx`, d'après
`docs/prompts/assets/suivi-emom.png` :

- libellé « MINUTE {n} / {total} » au-dessus du chrono, décompte de la minute
  en cours (`computeEmomState(...).displaySec`) et mention « avant la
  prochaine minute » ;
- **bande de pastilles**, une par intervalle : faites, en cours, à venir —
  un `View` par pastille avec la couleur correspondante, pas d'image ;
- carte « CETTE MINUTE » : le mouvement issu d'`emomMinuteTask(sets, round)`,
  avec sa case à cocher ;
- une fois la tâche cochée, remplacer la carte par un état de repos
  « Fini ? repos jusqu'à la minute {n+1} » ;
- pied : pause et « Minute faite ✓ ».

Le passage de minute est piloté par le chrono (`computeEmomState` avance
seul) : le cochage n'avance pas la minute, il ne fait que basculer l'affichage
en repos. Remettre le cochage à zéro à chaque changement de minute.

- [ ] **Step 2 : vérifier et committer**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json && cd ../.. && npx vitest run`

```bash
git add apps/mobile/src/features/training/EmomRunner.tsx
git commit -m "Add EMOM runner screen"
```

---

### Task 5 : Écran For Time

**Files:**
- Create: `apps/mobile/src/features/training/ForTimeRunner.tsx`

**Interfaces:**
- Consumes: `useRunClock`, `computeForTimeState`.

- [ ] **Step 1 : écrire le composant**

Créer `apps/mobile/src/features/training/ForTimeRunner.tsx`, d'après
`docs/prompts/assets/suivi-fortime.png` :

- « TEMPS ÉCOULÉ » et chrono qui **monte** ;
- quand `block.timeCapSec` est renseigné, une puce « objectif < {mm:ss} » —
  réemploi documenté du champ pour ce format (voir § Écarts assumés). Rien
  quand il est absent ;
- « Round {n} / {total} » et la liste des mouvements du tour, cochables ;
- **pas** de schéma dégressif : le modèle ne le porte pas (voir § Écarts) ;
- pied : pause et « Round terminé », qui incrémente et vide les cochages ;
- `onFinished()` quand `computeForTimeState(...).isFinished`.

- [ ] **Step 2 : vérifier et committer**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json && cd ../.. && npx vitest run`

```bash
git add apps/mobile/src/features/training/ForTimeRunner.tsx
git commit -m "Add For Time runner screen"
```

---

### Task 6 : Fil des blocs et branchement

**Files:**
- Create: `apps/mobile/src/features/training/BlockTimeline.tsx`
- Modify: `apps/mobile/src/features/training/CircuitRunnerScreen.tsx`

- [ ] **Step 1 : écrire le fil des blocs**

Créer `apps/mobile/src/features/training/BlockTimeline.tsx`, d'après
`docs/prompts/assets/suivi-multibloc.png` :

- en-tête : nom de la séance, « Bloc {n} / {total} », chrono de séance ;
- barre de progression segmentée : un `Meter` par bloc dans une rangée, ou des
  `View` à largeur égale — terminé, en cours, à venir ;
- un nœud par bloc : numéro (ou ✓ si terminé), puce de format, nom, état, et
  pour le bloc actif un résumé de ses exercices et un bouton « Continuer » ;
- pied : pause et « Passer au bloc suivant ».

N'afficher ce fil que si la séance a **plus d'un bloc** : pour un bloc unique,
il n'apporte rien et ajoute une étape.

- [ ] **Step 2 : brancher les trois formats**

Dans `CircuitRunnerScreen.tsx`, remplacer les branches `amrap` / `emom` /
`for_time` (aujourd'hui fondues dans un unique `else`) par le rendu de
`AmrapRunner`, `EmomRunner` et `ForTimeRunner` selon `active.format`. Les
branches `strength` (simple, répétée, superset) restent inchangées.

Supprimer ensuite l'état de chrono devenu inutile dans `CircuitRunnerScreen`
(`elapsedSec`, son `setInterval`, `tick`) : chaque écran de format porte
désormais sa propre horloge. Vérifier qu'aucune référence ne subsiste.

- [ ] **Step 3 : vérifier et committer**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json && cd ../.. && npx vitest run && npx eslint apps/mobile/src/features/training --ext .ts,.tsx`

```bash
git add apps/mobile/src/features/training
git commit -m "Add block timeline and wire the three timed formats"
```

---

### Task 7 : i18n et vérification finale

**Files:**
- Modify: `apps/mobile/src/i18n/locales/{fr,en,es,pt,de}.json`

- [ ] **Step 1 : relever les clés**

Run: `grep -ohE "'sport\.(runner|circuitRunner)\.[a-zA-Z0-9.]+'" apps/mobile/src/features/training/*.tsx | sort -u`

- [ ] **Step 2 : remplir les cinq locales**

Ajouter les clés manquantes sous `sport.runner`, par script Python additif
(`json.load` / `OrderedDict` / `json.dump` avec `ensure_ascii=False`,
`indent=1`) — ne jamais réécrire un fichier de locale à la main.

Libellés fr de référence : « avant la prochaine minute »,
« Minute {{current}} / {{total}}», « Cette minute », « Minute faite »,
« repos jusqu'à la minute {{next}} », « Temps écoulé », « restant »,
« objectif < {{time}} », « Tour terminé », « Cadence {{sec}} s/tour »,
« {{done}} tours », « Continuer », « Passer au bloc suivant »,
« Pause », « Reprendre », « terminé », « en cours », « à venir ».

- [ ] **Step 3 : contrôler l'alignement des locales**

Écrire un contrôle ponctuel comparant les clés relevées au contenu des cinq
fichiers, et corriger tout manque ou toute clé orpheline avant de continuer.

- [ ] **Step 4 : vérification complète**

Run:
```bash
cd apps/mobile && npx tsc --noEmit -p tsconfig.json && cd ../..
npx eslint packages apps/mobile/src --ext .ts,.tsx
npx vitest run
pnpm --filter @supotsu/mobile export:web
```
Expected: 0 erreur. Les avertissements préexistants (`NewWorkoutScreen`,
`SupportScreen`, `NutritionScreen`) ne sont pas au périmètre.

- [ ] **Step 5 : pousser et rapporter**

```bash
git add apps/mobile/src/i18n/locales
git commit -m "Translate timed-format runner strings to en/es/pt/de"
git pull --rebase
git push
```

Signaler à l'utilisateur : les écrans livrés, les deux écarts assumés (schéma
21-15-9 absent du modèle, `timeCapSec` réemployé comme objectif For Time), et
les comportements non vérifiables sans appareil (justesse des chronos après un
passage en arrière-plan, pause).
