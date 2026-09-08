# Bloc Tabata — conception

Demandé le 2026-09-08 : « Il faut ajouter un type de bloc "tabatha" ».

## Ce qui existe déjà

Tabata est **déjà dans l'app**, mais comme outil autonome :
`IntervalTimerScreen.tsx` propose un préréglage `tabata` (20 s / 10 s × 8) avec
toute la mécanique de phases `prep → work → rest`, à côté de HIIT, EMOM et
Perso.

Ce qui manque, c'est un **format de bloc** utilisable à l'intérieur d'une
séance, aux côtés de `strength`, `amrap`, `emom` et `for_time`. Un bloc est
créé dans `SessionBlocksEditor`, exécuté par `CircuitRunnerScreen`, et sa
logique de temps vit dans `blockRunnerEngine.ts`.

## Contrainte structurante

Un bloc ne sait stocker que `time_cap_sec` et `target_rounds`. Il n'a **aucun
emplacement pour une durée de repos**, qui est exactement ce qui distingue
Tabata d'un EMOM. C'est ce qui impose une migration.

## Décisions

### 1. Paramétrable, pas figé

Travail / repos / rounds sont modifiables, préremplis à 20-10-8. Le minuteur
autonome propose déjà HIIT et Perso : livrer un bloc figé créerait un écart que
les utilisateurs signaleraient, et le rendre paramétrable ensuite coûterait une
seconde migration.

### 2. `time_cap_sec` porte les secondes de travail

Ce champ a déjà un sens variable selon le format (plafond en AMRAP, longueur
d'intervalle en EMOM) ; y loger le travail suit cette convention plutôt que de
la contredire. Une colonne `work_sec` dédiée serait plus lisible mais laisserait
`time_cap_sec` vide pour Tabata, et ajouterait une colonne de plus.

Contrepartie assumée : le champ a désormais trois significations. Les commentaires
de `WorkoutBlock` doivent les énumérer.

### 3. Pas de repos final

Le bloc s'arrête à la fin de la dernière phase de travail. Durée totale :

    rounds × travail + (rounds − 1) × repos

soit 3:50 pour un 20/10 × 8, et non les 4:00 canoniques.

C'est la convention déjà appliquée par `IntervalTimerScreen.tsx:91`. Deux Tabata
de durées différentes dans la même app serait pire que l'un ou l'autre choix.

### 4. Phases dans le runner, pas de renvoi vers le minuteur

Le bloc se déroule dans `CircuitRunnerScreen` comme les autres, sinon ses rounds
échappent à l'enregistrement de la séance.

## Portée

| Couche | Changement |
| --- | --- |
| `packages/core` | `BlockFormat` gagne `'tabata'` ; `WorkoutBlock.restSec` |
| `packages/shared` | enum zod, `restSec` dans l'entrée de bloc |
| `supabase/migrations` | `0030` : `CHECK` renommées et étendues, colonne `rest_sec` sur `workout_blocks` et `user_session_blocks` |
| `packages/database` | types régénérés, lecture/écriture de `rest_sec` |
| `blockRunnerEngine.ts` | `computeTabataState`, `BlockRunnerState.phase` |
| `CircuitRunnerScreen` | affichage de la phase et de son décompte |
| `SessionBlocksEditor` | format « Tabata » + 3 champs + durée calculée |
| `sessionBuilder.ts` | `blocksToSessionInput`, `defaultTimeCapForFormat`, `formatLabel` |
| `sessionToDrafts.ts` | restitution du repos à l'édition |
| `BlockTimeline`, `WorkoutDetailScreen` | libellés |
| `i18n` ×5 | libellé du format, aide, libellés des champs, phases |

## Les contraintes CHECK sont anonymes

`0023` et `0028` déclarent `check (format in (...))` en ligne, sans nom :
Postgres les nomme lui-même (`workout_blocks_format_check`). La migration doit
donc les supprimer par ce nom auto-généré puis les recréer sous un nom explicite,
sans quoi elle n'est pas rejouable.

## Tests

`computeTabataState` est la seule logique réellement neuve et concentre le
risque, donc elle est couverte seule :

- t = 0 → round 1, phase travail, décompte plein
- frontière exacte travail → repos, et repos → round suivant
- dernier round : fin à la fin du travail, jamais de repos final
- durée totale = `rounds × travail + (rounds − 1) × repos`
- au-delà de la fin → terminé, décompte à 0
- repos à 0 s (dégénère en EMOM) → jamais de phase repos

Et `sessionToDrafts` : un bloc Tabata fait l'aller-retour sans perdre son repos.

## Hors périmètre

- `IntervalTimerScreen` garde sa propre boucle `setTimeout`. Elle fonctionne, et
  la convertir au moteur pur est un refactor à part — les deux partagent la
  convention (pas de repos final), pas encore le code.
- Raccourcir un bloc n'efface pas les rounds déjà enregistrés.
