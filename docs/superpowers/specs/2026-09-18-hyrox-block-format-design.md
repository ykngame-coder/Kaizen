# Bloc Hyrox — conception

Demandé le 2026-09-18 : un nouveau type de bloc permettant de créer des
séances avec un objectif de distance sur un agrès, plus un temps — le format
caractéristique des stations Hyrox.

## Mécanique retenue

Un bloc Hyrox enchaîne plusieurs **stations** sans repos, chacune sur un
agrès (un exercice du catalogue existant : rameur, ski erg, sled push...).
Chaque station a un objectif fixé à la création, dans l'un des deux sens
possibles — jamais les deux :

- **Station « distance »** : une distance cible connue à l'avance (ex. 1000 m
  rameur). Le runner chronomètre en comptant, l'utilisateur arrête le chrono
  quand la distance est parcourue — le **temps réalisé** est mesuré
  automatiquement.
- **Station « temps »** : une durée cible connue à l'avance (ex. 4 min ski
  erg). Le runner décompte cette durée ; à zéro, l'utilisateur saisit la
  **distance parcourue** à la main.

Dans les deux cas, un poids (charge du sled, résistance...) est optionnel et
modifiable à la fin de la station.

Ce n'est **pas** une extension de « Pour le temps » (chrono unique sur tout
le bloc) : chaque station a sa propre mesure, plus proche du cycle
objectif → saisie du réalisé déjà utilisé par la Musculation.

## Décisions

### 1. Le mode d'une station se déduit de ce qui est rempli, pas d'un champ dédié

`distanceM` et `durationSec` existent déjà tous les deux sur `SetEntry`
(`durationSec`) ou vont y être ajoutés (`distanceM`, nouveau). Lequel des deux
est renseigné **à la création** définit le mode ; l'autre reste vide et c'est
lui que le runner remplit à la fin de la station. Pas de flag de mode
supplémentaire à stocker ni à garder synchronisé.

### 2. Pas de chrono global de bloc

Le temps total du bloc (`resultTimeSec`, déjà présent sur `WorkoutBlock`) est
la somme des temps de chaque station — mesuré pour une station « distance »,
égal à la durée cible pour une station « temps » (elle dure exactement ça par
construction). Pas de second chrono à maintenir en plus des chronos par
station.

### 3. Progression strictement séquentielle, pas de `MovementChecklist`

Contrairement à AMRAP/Pour le temps (une liste de mouvements qu'on peut
cocher dans le désordre, la validation du tour n'étant jamais bloquée),
une station Hyrox impose sa propre mécanique de chrono et une saisie
obligatoire à la fin — on ne peut pas avancer librement dans la liste. Le
runner affiche la station courante par index (comme la Musculation affiche
sa série courante), avec les pastilles de progression déjà fournies par
`RunnerFocus` (`total`/`current`).

### 4. Nouveau runner, pas une généralisation de `ForTimeRunner`

L'idée initiale de réutiliser `ForTimeRunner` avec un simple changement
d'étiquette ne tient plus depuis la mécanique à deux chronos (compte à
rebours vs chronomètre) et la saisie obligatoire par station. `HyroxRunner`
est un nouveau composant, avec deux phases par station (`work` → `log`),
sur le modèle du cycle déjà utilisé par `StrengthRunner`.

### 5. `distanceM` est un champ générique sur `SetEntry`/`UserSessionExercise`

Comme `weightKg`/`reps`, réutilisable plus tard par d'autres formats — mais
pour l'instant seul Hyrox le remplit. Pas de renommage ni de champ
spécifique à Hyrox.

## Portée

| Couche | Changement |
| --- | --- |
| `packages/core` | `BlockFormat` gagne `'hyrox'` ; `SetEntry.distanceM?`, `UserSessionExercise.distanceM?` |
| `packages/shared` | `distanceM` dans `sessionBlockInputSchema`/l'entrée d'exercice |
| `supabase/migrations` | nouvelle migration : colonne `distance_m numeric` sur `workout_sets` **et** `user_session_exercises` |
| `packages/database` | types régénérés ; `updateSetLog` écrit `distance_m`/`duration_sec` |
| `apps/mobile/src/lib/data/repository.ts` | `SetLogInput` gagne `distanceM?`/`durationSec?`, écrits par `logSet` (démo + Supabase) à la fin d'une station ; `distanceM` du set aussi transmis à la création par `addCircuitWorkout` et `addSetsToWorkout` (démo + Supabase) — quatre chemins d'écriture au total, à ne pas oublier comme pour Tabata |
| `blockRunnerEngine.ts` | nouvelle fonction pure `computeHyroxStationState` (station « distance » : chronomètre sans fin auto ; station « temps » : décompte, fin auto à zéro) — pas de chrono global de bloc |
| `apps/mobile/src/features/training/HyroxRunner.tsx` (nouveau) | phases `work`/`log` par station, chronomètre ou décompte selon le mode, pastilles de progression via `RunnerFocus` |
| `CircuitRunnerScreen.tsx` | route `hyrox` vers `HyroxRunner` ; `finishTimedBlock` : `resultTimeSec` = temps déjà additionné par le runner |
| `SessionBlocksEditor.tsx` | format « Hyrox » ; par station, un choix Distance/Temps qui révèle le bon champ (jamais les deux) ; poids toujours optionnel ; aucun champ de repos/plafond/rounds pour ce format |
| `sessionBuilder.ts` | `SetDraft.distance` (nouveau) ; `blocksToWorkoutInput` **et** `blocksToSessionInput` (les deux copies — un oubli similaire s'est déjà produit à l'ajout du Tabata) ; `defaultRestForFormat`/`defaultRoundsForFormat` inchangés (retombent déjà sur vide) ; `formatLabel` |
| `sessionToDrafts.ts` | `draftFor` restitue `distance`/`duration` à l'édition, même logique de déduction du mode |
| `WorkoutDetailScreen.tsx` | étiquette de format, ligne de résultat (temps total), distance par exercice dans `BlockSummaryCard` |
| `i18n` ×5 | libellé « Hyrox », aide du format, libellés Distance/Temps/Poids, textes de la phase de saisie |

## Tests

La logique réellement neuve est le calcul de phase par station — à couvrir
seule, comme `computeTabataState` l'a été pour Tabata :

- station « distance » : phase travail tant que non arrêtée manuellement, pas
  de fin automatique
- station « temps » : décompte plein à `durationSec`, phase de saisie
  automatique à zéro
- dernière station terminée → bloc fini, `resultTimeSec` = somme correcte des
  temps (mesurés + fixes)
- une station sans aucun des deux champs (`distanceM`/`durationSec`) n'est
  pas un cas valide côté création — le formulaire l'empêche, pas le runner

Et `sessionToDrafts`/`blocksToWorkoutInput`/`blocksToSessionInput` : un bloc
Hyrox fait l'aller-retour (création → édition → relance) sans perdre le mode
de ses stations ni son poids.

## Hors périmètre

- Pas de splits/temps intermédiaires affichés par station une fois le bloc
  terminé — seul le temps total est montré, comme demandé.
- Pas de bibliothèque d'agrès dédiée : le sélecteur d'exercice existant
  suffit. Vérifié et complété séparément (commit `db731cd`, avant cette spec) :
  Sled Push, Rameur, Course et Farmer's Walk existaient déjà au catalogue ;
  Wall Ball, Burpee Broad Jump, Sled Pull et SkiErg ont été ajoutés via un
  petit supplément (`hyroxSupplement.ts`), pas mélangés au miroir
  free-exercise-db. Un agrès encore absent reste couvert par un exercice
  personnalisé, déjà fonctionnel.
- Pas de poids « standard de course » suggéré automatiquement par agrès.
- Pas de mode « les deux à la fois » sur une même station (distance ET temps
  cibles simultanément) — non demandé, et contredirait la mécanique de
  déduction du mode.
