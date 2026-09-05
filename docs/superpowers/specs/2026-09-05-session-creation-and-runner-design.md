# Création & suivi de séance — design

**Date :** 2026-09-05
**Statut :** spec approuvée pour le Lot 1 ; lots 2-3 cadrés au niveau architecture.

## Objectif

Améliorer la création et le suivi de séance en s'appuyant sur l'existant
(`sessionBuilder.ts`, `SessionBlocksEditor`, `blockRunnerEngine.ts`,
`CircuitRunnerScreen`), dans un style mix Fitbod (charges suggérées,
échauffements guidés) + Garmin/CrossFit (blocs, chronos proéminents).

Maquettes d'intention : `docs/prompts/assets/{creation-suivi-seance,
suivi-multibloc,suivi-emom,suivi-fortime}.png`. Elles fixent la direction
(densité, hiérarchie, chrono dominant sur les formats chronométrés), à
reproduire avec les tokens et composants réels, pas au pixel.

## Découpage en lots

Le périmètre couvre neuf chantiers ; il est livré en trois lots, le Lot 1
étant prérequis des deux autres.

| Lot | Contenu | Livrable |
|---|---|---|
| **1 — Fondations** | Modèle (`plannedReps`, `plannedWeightKg`, `rir`, `isWarmup`) + migration 0029 ; préférences (effort, barre, disques, repos) ; moteurs purs (disques, échauffement) ; `suggestProgression` internationalisé | Aucun changement visible ; base testée pour 2 et 3 |
| **2 — Runner** | B1 log réel + repos auto, B2 référence précédente + RPE/RIR, B3 reprise + écran allumé + « prochain », B4 disques + échauffement auto ; refonte visuelle des écrans de suivi | Suivi de séance complet |
| **3 — Création** | A1 prefill + suggestion, A2 sélecteur rapide (recherche normalisée, favoris, ajout multiple), A3 modèles & duplication, A4 UX supersets/blocs | Création de séance complète |

Ce document spécifie le **Lot 1** en détail et cadre les lots 2-3 juste
assez pour que les interfaces du Lot 1 soient correctes du premier coup.

---

## Lot 1 — Fondations

### 1.1 Modèle de données : prévu vs réalisé

Décision actée : **on conserve les deux**. Le choix structurant est de savoir
quel champ porte le réalisé.

`reps` / `weightKg` portent **la meilleure vérité connue** : la valeur prévue
tant que la série n'a pas été loguée, la valeur réalisée dès qu'elle l'est.
`plannedReps` / `plannedWeightKg` conservent le programmé, et ne sont jamais
réécrits après création.

Ce sens de lecture est retenu parce qu'il est purement additif : tous les
écrans et moteurs existants (volume, travail musculaire, progression,
historique) lisent déjà `reps`/`weightKg` et continuent de fonctionner sans
modification, en devenant plus justes. L'inverse (`reps` = prévu, nouveaux
champs = réalisé) aurait obligé à réécrire chaque lecture pour rester exact.

`plannedReps` à `null` signifie « aucun plan enregistré » — c'est le cas de
toutes les données antérieures à cette migration, et le cas doit être traité
partout comme légitime, jamais comme une erreur.

**`packages/core/src/training.ts` — `SetEntry` gagne :**

```ts
  /** Ce qui était programmé, jamais réécrit après la création — null pour les séances antérieures à la 0029. */
  plannedReps?: number;
  plannedWeightKg?: number;
  /** Reps en réserve, alternative au RPE selon la préférence effortMetric. */
  rir?: number;
  /** Série d'échauffement : affichée mais exclue du volume et des records. */
  isWarmup?: boolean;
```

**`SetDraft` (`sessionBuilder.ts`) gagne** `isWarmup?: boolean`. Le draft ne
porte pas `plannedReps`/`plannedWeightKg` : à la création, le prévu *est* la
saisie, la couche repository duplique la valeur dans les deux colonnes.

### 1.2 Migration `0029_set_planned_effort_warmup.sql`

```sql
alter table public.workout_sets
  add column planned_reps smallint,
  add column planned_weight_kg numeric(6, 2),
  add column rir smallint check (rir between 0 and 10),
  add column is_warmup boolean not null default false;
```

Colonnes nullables (sauf `is_warmup`, défaut `false`) : aucune donnée
existante n'est invalidée. Comme pour 0025-0028, l'environnement n'a pas de
clé service-role : la migration est appliquée à la main par l'utilisateur
dans l'éditeur SQL Supabase, et le code doit tolérer son absence temporaire.

`user_session_exercises` (bibliothèque « Mes séances ») gagne aussi
`is_warmup boolean not null default false`, pour qu'un échauffement enregistré
dans un modèle soit restitué au lancement. Le prévu/réalisé n'a en revanche
aucun sens dans la bibliothèque : `planned_*` n'y est pas répliqué.

### 1.3 Préférences

Étendre `Preferences` (`apps/mobile/src/lib/preferences.tsx`) — pattern
`secureStorage` déjà en place, pas de store parallèle :

```ts
  /** Échelle d'effort saisie par série dans le runner. */
  effortMetric: 'rpe' | 'rir';
  /** Poids de la barre, pour le calculateur de disques. */
  barWeightKg: number;
  /** Disques disponibles (kg, une face), ordre décroissant. */
  availablePlates: number[];
  /** Repos par défaut quand la série n'en porte pas. */
  defaultRestSec: number;
```

Défauts : `'rpe'`, `20`, `[25, 20, 15, 10, 5, 2.5, 1.25]`, `90`.

### 1.4 Moteurs purs

Deux modules dans `packages/engines/src/`, sans aucune dépendance UI, testés
au Vitest. Ils sont écrits en Lot 1 et consommés en Lot 2.

**`plates.ts`**

```ts
export interface PlateCount { plateKg: number; count: number }
export interface PlateSolution {
  /** Disques à mettre d'un côté de la barre, du plus lourd au plus léger. */
  perSide: PlateCount[];
  /** Charge réellement atteinte — inférieure à la cible si les disques ne tombent pas juste. */
  achievedKg: number;
}
/** Décomposition gloutonne de la charge cible. undefined si la cible est sous le poids de la barre. */
export function computePlates(targetKg: number, barKg: number, available: number[]): PlateSolution | undefined;
```

Cas à couvrir : cible = barre nue (`perSide: []`, `achievedKg = barKg`) ;
cible sous la barre (`undefined`) ; cible impossible à atteindre exactement
(on descend au plus proche atteignable, `achievedKg < targetKg`) ; disques
fournis en désordre (triés en interne) ; disques dupliqués ou non positifs
(ignorés).

**`warmup.ts`**

```ts
export interface WarmupSet { weightKg: number; reps: number; percent: number }
/** Rampe d'échauffement vers une série de travail : ~40/60/80 % avec reps dégressives. */
export function warmupRamp(workKg: number, workReps: number, opts?: { roundToKg?: number }): WarmupSet[];
```

Arrondi par défaut à 2,5 kg. Retourne `[]` quand la charge de travail est
nulle, négative, ou trop légère pour qu'une rampe ait du sens (une marche
d'échauffement doit rester ≥ la barre à vide côté appelant — le moteur, lui,
ne connaît pas la barre et se contente de refuser `workKg <= 0`).

### 1.5 `suggestProgression` internationalisé

`ProgressionSuggestion.rationale` est aujourd'hui une phrase française codée
en dur — inutilisable dans une app en cinq langues. Aucun écran ne le
consomme encore (seuls le contrat et les tests le référencent), le
changement est donc sans risque de régression.

`rationale: string` devient une donnée structurée que la couche UI traduit :

```ts
export type ProgressionRationale =
  | { kind: 'addRep'; reps: number }
  | { kind: 'increaseLoad'; fromWeightKg: number; toWeightKg: number; highReps: number; lowReps: number }
  | { kind: 'addRepSameLoad'; reps: number; weightKg: number };
```

Le moteur reste pur et sans langue ; l'app mappe `kind` vers une clé
`sport.progression.rationale.*` avec ses paramètres.

### 1.6 Tests (Lot 1)

Vitest, moteurs purs uniquement : `plates.test.ts` (cas listés en 1.4),
`warmup.test.ts` (rampe nominale, arrondi, charge nulle/négative),
`training.test.ts` étendu pour les trois `kind` de rationale.

---

## Lots 2 & 3 — cadrage

Détaillés dans leurs propres specs le moment venu ; résumés ici pour que les
interfaces du Lot 1 tiennent.

**Lot 2 — Runner.** Le suivi devient actif : cocher chaque série, saisir
reps/charge réels pré-remplis par le prévu, minuteur de repos démarrant
automatiquement à la validation (repos de la série sinon `defaultRestSec`),
haptique en fin, `+15 s` / passer. Référence « Précédent : 60 kg × 8 » via
`lastSessionSetsByExercise`. Effort par série en RPE ou RIR selon
`effortMetric`. `expo-keep-awake` (déjà installé) pendant le run.
Persistance de la progression du run pour reprendre après fermeture. Aperçu
« Prochain ». Calculateur de disques et échauffement auto branchés sur les
moteurs du Lot 1. Refonte visuelle des quatre formats selon les maquettes,
plus un écran de fil des blocs pour les séances multi-blocs.

Le risque principal du lot est la **persistance de l'état de run** : c'est le
seul morceau qui doit survivre à un crash et se réconcilier au remontage. Il
recevra son propre découpage.

**Lot 3 — Création.** Prefill depuis `lastSessionSetsByExercise` + suggestion
issue de `suggestProgression`, acceptable d'un tap, jamais imposée, avec
distinction visuelle nette entre « prévu » et « suggéré ». Sélecteur
d'exercices avec recherche normalisée sans accents sur les 873 entrées,
sections Récents et Favoris (nouveau store persistant par utilisateur), et
ajout multiple. Duplication d'une séance passée, bibliothèque de modèles
fournis, « enregistrer comme modèle ». UX supersets et blocs plus lisible
(groupement d'un tap, rendu du groupe, réorganisation par glisser).

## Hors périmètre

- La fréquence cardiaque live, déjà en place, n'est pas refaite.
- Aucune migration rétroactive des séances existantes : `planned_*` reste
  `null` pour l'historique, `is_warmup` à `false`.
- Pas de « taux d'adhésion au plan » : les colonnes `planned_*` le rendent
  possible plus tard, aucun écran ne l'expose dans ces trois lots.

## Contraintes globales

- Toute chaîne visible passe par `t()` et est remplie dans les cinq locales
  (fr, en, es, pt, de).
- `pnpm typecheck && pnpm lint && pnpm test` verts ; export web pour valider
  le bundling.
- Moteurs purs, sans UI, testés.
- Branche `claude/spot-wellness-app-r6l5bj` uniquement ; `git pull --rebase`
  avant push ; pas de PR sauf demande.
- Colonnes nullables ou à défaut, pour ne jamais casser l'existant.
