# Lot 3 — Création de séance

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** rendre la création de séance rapide et guidée — charges pré-remplies
et suggestion de surcharge acceptable d'un tap, recherche d'exercices qui
trouve vraiment, favoris, ajout multiple, duplication d'une séance passée et
modèles prêts à l'emploi.

**Architecture :** la logique testable (normalisation de recherche, mapping de
la suggestion) va dans des modules purs ; le store de favoris suit le pattern
`secureStorage` déjà en place ; l'éditeur de blocs existant est étendu, jamais
dupliqué.

**Spec :** `docs/superpowers/specs/2026-09-05-session-creation-and-runner-design.md`

## Ce qui existe déjà — à ne pas refaire

L'exploration du code montre qu'une bonne partie de l'énoncé A4, et une partie
d'A1 et A3, sont déjà en place :

- **Réorganisation par glisser** : `DraggableFlatList` est câblé, appui long
  sur la poignée `☰`, `onDragEnd` → `builder.reorderExercise`. **Fait.**
- **Groupement en superset** : multi-sélection (`pendingSuperset`) →
  `groupAsSuperset`, rendu du groupe par bordure `accentData` + badge, et lien
  « dégrouper » par slot. **Fait.**
- **Sections « Récents »** : `builder.recentExercises`, alimentées par
  l'historique. **Fait**, mais seuls `NewWorkoutScreen` et
  `SessionBuilderScreen` passent `recentExerciseIds` ; `EditWorkoutScreen` non.
- **Reprise de la dernière perf** : `lastKnownFor` + une puce tapable qui
  remplit reps/charge. **Fait**, mais seulement dans `NewWorkoutScreen`, et
  c'est un geste manuel, pas un pré-remplissage.
- **Duplication d'une séance passée** : toute la mécanique existe
  (`importSourceId`, `importSets`, effet de recopie, `pastWorkouts`) mais **sans
  point d'entrée dans l'UI** — mise en pause délibérée, d'où les deux
  avertissements `pickerOpen` / `pastWorkouts` traînant depuis des semaines.
  Elle aplatit aussi tout en un bloc `strength` unique, ce qui perdrait
  désormais la structure en blocs.

Le lot porte donc sur ce qui manque réellement, pas sur une réécriture.

## Global Constraints

- Le pré-remplissage et la suggestion sont des **propositions éditables**,
  jamais un pilotage : rien n'est écrit sans geste de l'utilisateur, et
  « prévu » se distingue visuellement de « suggéré ».
- La suggestion vient de `suggestProgression` (`@supotsu/engines`), dont le
  `rationale` est déjà une donnée structurée (Lot 1) : l'app le traduit, le
  moteur reste sans langue.
- Toute chaîne visible via `t()`, remplie dans fr/en/es/pt/de.
- Logique testable hors composants.
- Branche `claude/spot-wellness-app-r6l5bj`, `git pull --rebase` avant push.

---

### Task 1 : Recherche insensible aux accents

**Files:**
- Modify: `apps/mobile/src/features/training/sessionBuilder.ts`
- Modify: `apps/mobile/src/features/training/sessionBuilder.test.ts`

**Interfaces:**
- Produces: `normalizeSearch(text)`, utilisé par le filtre de recherche.

- [ ] **Step 1 : écrire les tests qui échouent**

Ajouter à `sessionBuilder.test.ts` :

```ts
describe('normalizeSearch', () => {
  it('replie les accents et la casse', () => {
    expect(normalizeSearch('Élévation Latérale')).toBe('elevation laterale');
  });

  it('laisse un texte déjà simple inchangé', () => {
    expect(normalizeSearch('squat')).toBe('squat');
  });

  it('rogne les espaces de bord', () => {
    expect(normalizeSearch('  Développé  ')).toBe('developpe');
  });

  it('gère une entrée vide', () => {
    expect(normalizeSearch('')).toBe('');
  });
});
```

Compléter l'import du fichier avec `normalizeSearch`.

- [ ] **Step 2 : lancer, vérifier l'échec**

Run: `npx vitest run apps/mobile/src/features/training/sessionBuilder.test.ts`
Expected: FAIL — `normalizeSearch is not a function`.

- [ ] **Step 3 : implémenter et brancher**

Ajouter dans `sessionBuilder.ts` :

```ts
/**
 * Forme comparable d'un texte de recherche : sans accent, en minuscules.
 * Sans ça, chercher « elevation » ne trouve pas « Élévation latérale » — le
 * catalogue est en français accentué et les claviers ne le sont pas toujours.
 */
export function normalizeSearch(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}
```

Puis remplacer dans le même fichier :

```ts
  const q = query.trim().toLowerCase();
```

par :

```ts
  const q = normalizeSearch(query);
```

et remplacer :

```ts
      .filter((ex) => !q || ex.name.toLowerCase().includes(q) || MUSCLE_LABEL[ex.primary].toLowerCase().includes(q) || ex.equipment.toLowerCase().includes(q))
```

par :

```ts
      .filter(
        (ex) =>
          !q ||
          normalizeSearch(ex.name).includes(q) ||
          normalizeSearch(MUSCLE_LABEL[ex.primary]).includes(q) ||
          normalizeSearch(ex.equipment).includes(q),
      )
```

- [ ] **Step 4 : vérifier et committer**

Run: `npx vitest run && cd apps/mobile && npx tsc --noEmit -p tsconfig.json`

```bash
git add apps/mobile/src/features/training/sessionBuilder.ts apps/mobile/src/features/training/sessionBuilder.test.ts
git commit -m "Make exercise search accent-insensitive"
```

---

### Task 2 : Store de favoris

**Files:**
- Create: `apps/mobile/src/features/exercises/favorites.ts`

**Interfaces:**
- Produces: `loadFavorites(userId)`, `toggleFavorite(userId, exerciseId)`,
  `isFavorite`. Consommés par la tâche 5.

- [ ] **Step 1 : écrire le module**

Créer `apps/mobile/src/features/exercises/favorites.ts`, sur le modèle de
`apps/mobile/src/lib/progressPhotos.ts` (même pattern `secureStorage`) :

```ts
import { secureStorage } from '@/lib/secure-storage';

/**
 * Exercices mis en favori, par utilisateur. Purement local : c'est un confort
 * de saisie, pas une donnée d'entraînement — rien à synchroniser.
 */
const key = (userId: string): string => `supotsu.favoriteExercises.${userId}`;

export async function loadFavorites(userId: string): Promise<string[]> {
  const raw = await secureStorage.getItem(key(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/** Bascule un exercice en favori et renvoie la liste résultante. */
export async function toggleFavorite(userId: string, exerciseId: string): Promise<string[]> {
  const current = await loadFavorites(userId);
  const next = current.includes(exerciseId)
    ? current.filter((id) => id !== exerciseId)
    : [exerciseId, ...current];
  await secureStorage.setItem(key(userId), JSON.stringify(next));
  return next;
}
```

- [ ] **Step 2 : vérifier et committer**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json && cd ../.. && npx vitest run`

```bash
git add apps/mobile/src/features/exercises/favorites.ts
git commit -m "Add per-user exercise favorites store"
```

---

### Task 3 : Traduction du rationale de progression

**Files:**
- Create: `apps/mobile/src/features/training/progressionText.ts`
- Modify: `apps/mobile/src/i18n/locales/{fr,en,es,pt,de}.json`

**Interfaces:**
- Consumes: `ProgressionRationale` (`@supotsu/engines`, Lot 1).
- Produces: `progressionRationaleKey(rationale)` → `{ key, params }`.

- [ ] **Step 1 : écrire le module**

Créer `apps/mobile/src/features/training/progressionText.ts` :

```ts
import type { ProgressionRationale } from '@supotsu/engines';

/**
 * Traduit la raison d'une suggestion. Le moteur renvoie une donnée structurée
 * (Lot 1) précisément pour que la phrase vive ici, dans les cinq locales, et
 * pas en dur dans le moteur.
 */
export function progressionRationaleKey(rationale: ProgressionRationale): {
  key: string;
  params: Record<string, number>;
} {
  switch (rationale.kind) {
    case 'addRep':
      return { key: 'sport.progression.rationale.addRep', params: { reps: rationale.reps } };
    case 'increaseLoad':
      return {
        key: 'sport.progression.rationale.increaseLoad',
        params: {
          from: rationale.fromWeightKg,
          to: rationale.toWeightKg,
          highReps: rationale.highReps,
          lowReps: rationale.lowReps,
        },
      };
    case 'addRepSameLoad':
      return {
        key: 'sport.progression.rationale.addRepSameLoad',
        params: { reps: rationale.reps, weight: rationale.weightKg },
      };
  }
}
```

- [ ] **Step 2 : ajouter les clés dans les cinq locales**

Par script Python additif, sous `sport.progression.rationale`. fr :

- `addRep` : « Ajoute une répétition ({{reps}}) par rapport à ta dernière séance. »
- `increaseLoad` : « Tu as atteint {{highReps}} reps à {{from}} kg — passe à {{to}} kg pour {{lowReps}} reps. »
- `addRepSameLoad` : « Vise {{reps}} reps à {{weight}} kg (même charge) avant d'augmenter. »

- [ ] **Step 3 : vérifier et committer**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json && cd ../.. && npx vitest run`

```bash
git add apps/mobile/src/features/training/progressionText.ts apps/mobile/src/i18n/locales
git commit -m "Translate progression rationale in the app layer"
```

---

### Task 4 : Pré-remplissage et carte de suggestion

**Files:**
- Modify: `apps/mobile/src/features/training/sessionBuilder.ts`
- Modify: `apps/mobile/src/features/training/SessionBlocksEditor.tsx`
- Modify: `apps/mobile/src/features/marketplace/SessionBuilderScreen.tsx`
- Modify: `apps/mobile/src/features/training/EditWorkoutScreen.tsx`

- [ ] **Step 1 : pré-remplir à l'ajout d'un exercice**

`useSessionBlocks` gagne une option `lastKnownFor?: (exerciseId) => { reps?: number; weightKg?: number; restSec?: number } | undefined`.
Dans `addExercise`, initialiser le `SetDraft` avec ces valeurs quand elles
existent, au lieu de `emptySet(exerciseId)` :

```ts
  const addExercise = (exerciseId: string): void => {
    const slotId = newSlotId(exerciseId);
    const known = options.lastKnownFor?.(exerciseId);
    const draft: SetDraft = known
      ? {
          exerciseId,
          reps: known.reps != null ? String(known.reps) : '',
          weight: known.weightKg != null ? String(known.weightKg) : '',
          rest: known.restSec != null ? String(known.restSec) : '',
        }
      : emptySet(exerciseId);
    updateActiveBlock({ selected: { ...activeSelected, [slotId]: draft }, order: [...activeOrder, slotId] });
    setQuery('');
  };
```

- [ ] **Step 2 : carte de suggestion sous chaque exercice**

Dans `SessionBlocksEditor`, sous la puce « dernière perf » existante, ajouter
une carte de suggestion quand l'appelant fournit
`suggestionFor?: (exerciseId) => ProgressionSuggestion | undefined` :

- libellé « Suggéré (surcharge progressive) » et la cible
  « {{weight}} kg × {{reps}} », avec le delta de charge quand il y en a un ;
- la raison, traduite via `progressionRationaleKey` ;
- un bouton « Accepter » qui remplit reps/charge du slot ;
- style visuel **distinct** du prévu (bordure pointillée, ton accent), pour que
  « suggéré » ne se confonde jamais avec « prévu » — c'est la contrainte
  explicite de l'énoncé.

Masquer entièrement la carte quand `suggestionFor` ne renvoie rien.

- [ ] **Step 3 : fournir les deux callbacks dans les trois écrans**

`NewWorkoutScreen` a déjà `lastKnownFor` : le passer aussi à `useSessionBlocks`
(option, pour le pré-remplissage) en plus de la prop de l'éditeur, et ajouter
`suggestionFor` construit sur `suggestProgression(history[exerciseId] ?? [])`.

`SessionBuilderScreen` et `EditWorkoutScreen` n'ont ni l'un ni l'autre : leur
ajouter `useExerciseHistory` et les mêmes deux callbacks. `EditWorkoutScreen`
doit aussi passer `recentExerciseIds`, qu'il ne passe pas aujourd'hui.

- [ ] **Step 4 : vérifier et committer**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json && cd ../.. && npx vitest run && npx eslint apps/mobile/src/features --ext .ts,.tsx`

```bash
git add apps/mobile/src/features
git commit -m "Prefill sets from history and offer a progression suggestion"
```

---

### Task 5 : Favoris et ajout multiple dans le sélecteur

**Files:**
- Modify: `apps/mobile/src/features/training/SessionBlocksEditor.tsx`
- Modify: `apps/mobile/src/features/training/sessionBuilder.ts`

- [ ] **Step 1 : sélection multiple**

Ajouter à `SessionBlocksEditor` un état local `pendingAdd: string[]`. Un appui
sur un résultat de recherche **bascule** l'exercice dans cette liste au lieu de
l'ajouter aussitôt. Un bouton « Ajouter ({{count}} sélectionnés) » apparaît dès
qu'un exercice est coché et appelle `builder.addExercise` pour chacun, dans
l'ordre de sélection, puis vide la liste.

Conserver l'ajout immédiat au tap dans les rangées « Récents » et « Favoris » :
ce sont des raccourcis, la sélection multiple y serait un pas de plus pour rien.

- [ ] **Step 2 : favoris**

Charger les favoris de l'utilisateur au montage (tâche 2), afficher une
**étoile** sur chaque résultat pour basculer, et une section « Favoris » au-dessus
de « Récents ». Section masquée tant qu'aucun favori n'existe.

- [ ] **Step 3 : vérifier et committer**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json && cd ../.. && npx vitest run`

```bash
git add apps/mobile/src/features/training
git commit -m "Add favorites and multi-select to the exercise picker"
```

---

### Task 6 : Duplication d'une séance passée

**Files:**
- Modify: `apps/mobile/src/features/training/NewWorkoutScreen.tsx`

- [ ] **Step 1 : préserver les blocs à la recopie**

L'effet de recopie existant aplatit tout en un bloc `strength` unique, ce qui
détruirait désormais la structure d'une séance AMRAP/EMOM. Lire aussi les blocs
de la séance source (`useWorkoutBlocks(importSourceId)`) et reconstruire un
`BlockDraft` par bloc — même mapping que le préremplissage d'`EditWorkoutScreen`,
y compris la reconversion des secondes en minutes pour AMRAP et For Time.

Quand la source n'a aucun bloc (séance historique), garder le repli actuel : un
bloc `strength` unique.

- [ ] **Step 2 : rendre le point d'entrée**

Ajouter un bouton « Dupliquer une séance » ouvrant la liste `pastWorkouts`
(déjà calculée), et retirer le commentaire « paused » devenu faux. Cela
supprime au passage les deux avertissements `pickerOpen` / `pastWorkouts`
traînant depuis des semaines.

- [ ] **Step 3 : vérifier et committer**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json && cd ../.. && npx eslint apps/mobile/src/features/training --ext .ts,.tsx`
Expected: les avertissements `pickerOpen` et `pastWorkouts` ont disparu.

```bash
git add apps/mobile/src/features/training/NewWorkoutScreen.tsx
git commit -m "Restore duplicate-a-past-session, preserving its blocks"
```

---

### Task 7 : Modèles de séance

**Files:**
- Create: `apps/mobile/src/features/training/sessionTemplates.ts`
- Modify: `apps/mobile/src/features/training/NewWorkoutScreen.tsx`

**Interfaces:**
- Produces: `SESSION_TEMPLATES: SessionTemplate[]` et
  `templateToBlocks(template)` → `BlockDraft[]`.

- [ ] **Step 1 : écrire les modèles**

Créer `apps/mobile/src/features/training/sessionTemplates.ts` : quatre modèles
de départ — Full body, Push/Pull/Legs (une séance par jour type), Haut/Bas, et
un WOD type (AMRAP). Chacun porte un nom, une description courte et ses blocs.

N'employer que des `exerciseId` **existants** : les vérifier contre
`EXERCISE_LIBRARY` et `exercises.data.json`. Un modèle référençant un id absent
afficherait l'id brut, exactement le bug corrigé au build 45.

- [ ] **Step 2 : vérifier les identifiants employés**

Écrire un contrôle ponctuel qui charge le catalogue et confirme que chaque
`exerciseId` des modèles s'y trouve. Corriger avant de continuer.

- [ ] **Step 3 : proposer les modèles à la création**

Dans `NewWorkoutScreen`, quand la séance est encore vide, afficher une rangée
« Partir d'un modèle » ; en choisir un remplit nom et blocs via
`templateToBlocks`. Rien n'est enregistré tant que l'utilisateur ne valide pas.

- [ ] **Step 4 : i18n et commit**

Ajouter les libellés dans les cinq locales.

```bash
git add apps/mobile/src/features/training apps/mobile/src/i18n/locales
git commit -m "Add ready-made session templates as a starting point"
```

---

### Task 8 : Texte d'aide sur les formats et vérification finale

**Files:**
- Modify: `apps/mobile/src/features/training/SessionBlocksEditor.tsx`
- Modify: `apps/mobile/src/i18n/locales/{fr,en,es,pt,de}.json`

- [ ] **Step 1 : aide contextuelle du format**

Sous le sélecteur de format, une ligne expliquant le format choisi :
musculation (séries et répétitions, repos entre séries), AMRAP (le plus de
tours possible dans le temps imparti), EMOM (une tâche au début de chaque
intervalle), For Time (finir les tours le plus vite possible).

- [ ] **Step 2 : vérification complète du lot**

Run:
```bash
cd apps/mobile && npx tsc --noEmit -p tsconfig.json && cd ../..
npx eslint packages apps/mobile/src --ext .ts,.tsx
npx vitest run
pnpm --filter @supotsu/mobile export:web
```
Expected: 0 erreur, et **deux avertissements de moins** qu'avant le lot
(`pickerOpen`, `pastWorkouts`, résorbés en tâche 6).

- [ ] **Step 3 : contrôler l'alignement des locales**

Comparer les clés `sport.progression.*`, `sport.sessionBuilder.*` employées au
contenu des cinq fichiers ; corriger tout manque ou toute clé orpheline.

- [ ] **Step 4 : pousser et rapporter**

```bash
git add -A
git commit -m "Add block format help text"
git pull --rebase
git push
```

Signaler ce qui était déjà en place et n'a donc pas été refait (glisser-déposer,
groupement superset, section Récents), et ce qui reste hors périmètre.
