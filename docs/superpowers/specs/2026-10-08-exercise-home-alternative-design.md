# Alternative "à la maison" par exercice — design

## Contexte et motivation

Le programme PPL fourni par l'utilisateur (PDF) est conçu comme un guide
« hybride » : chaque exercice y a deux colonnes, l'exercice en salle et une
alternative stricte au poids du corps (ex. Développé couché → Dips ou
Pompes élevées). L'utilisateur veut qu'à l'ouverture de n'importe quelle
séance — pas seulement PPL — il puisse choisir « Salle » ou « Maison », et
que l'app affiche les bons exercices en conséquence.

Aucun mécanisme de substitution d'exercice n'existe aujourd'hui dans l'app.

## Contrainte clé découverte en explorant le code

Quand un utilisateur s'inscrit à un programme catalogue, ses séances sont
**copiées** dans sa Planification personnelle (`workouts` / `workout_sets`)
via `sessionToWorkoutBlocks` (`apps/mobile/src/lib/data/sessionWorkout.ts`).
Le lien vers le programme catalogue disparaît à ce moment-là. Pour qu'un
choix « salle/maison » fonctionne au moment de LANCER la séance (plus tard,
potentiellement plusieurs semaines après l'inscription), l'alternative doit
être copiée en même temps que le reste — elle ne peut pas rester seulement
sur la donnée catalogue.

## Décisions validées avec l'utilisateur

1. Un nouveau champ optionnel `homeAlternativeExerciseId` sur l'exercice
   prescrit, porté à la fois par `user_session_exercises` (catalogue) et
   `workout_sets` (séance personnelle copiée).
2. Le choix se fait juste avant de lancer le lecteur de séance
   (`CircuitRunnerScreen`), via un petit écran « Salle / Maison » —
   affiché **seulement si** la séance contient au moins un exercice avec
   une alternative définie. Aucun changement pour toutes les autres
   séances. Le choix n'est **pas mémorisé** : redemandé à chaque lancement.
3. Portée : le mécanisme général (migration, copie, choix, substitution)
   + les données pour PPL. Pas d'interface pour qu'un utilisateur définisse
   ses propres alternatives sur une séance qu'il crée lui-même (ajoutable
   plus tard, hors scope ici).

## Modèle de données

### Migration (`supabase/migrations/0043_exercise_home_alternative.sql`)

```sql
alter table public.user_session_exercises
  add column home_alternative_exercise_id text references public.exercises (id);

alter table public.workout_sets
  add column home_alternative_exercise_id text references public.exercises (id);
```

Nullable, pas de défaut — la grande majorité des exercices n'ont pas
d'alternative. Pas de contrainte de format : n'importe quel exercice du
catalogue peut être désigné comme alternative.

### Types (`packages/core`)

`UserSessionExercise` et `SetEntry` gagnent chacun :
```ts
/** Exercice de repli si l'utilisateur choisit "Maison" au lancement de la séance. */
homeAlternativeExerciseId?: string;
```

### Repository (`packages/database`, `apps/mobile/src/lib/data`)

- `rowToUserSessionExercise` / l'équivalent côté `workout_sets` : lit la
  nouvelle colonne.
- `writeSessionBlocks` (écriture de séance catalogue) et l'insertion de
  `workout_sets` à l'inscription : écrivent la colonne si fournie.
- `sessionToWorkoutBlocks` (`sessionWorkout.ts`) : `setOf()` copie
  `e.homeAlternativeExerciseId` dans le `SetEntry` généré — c'est le point
  qui fait survivre l'alternative à l'inscription à un programme.

## Flux à l'ouverture d'une séance

1. `WorkoutDetailScreen` (où vit le bouton "Démarrer") calcule
   `hasAlternatives = sets.some(s => s.homeAlternativeExerciseId != null)`.
2. Si `false` : comportement actuel inchangé, le bouton navigue direct vers
   `/sport/workout/[id]/run`.
3. Si `true` : le bouton ouvre d'abord une modale sur place (pas un nouvel
   écran/route) avec deux boutons "Salle" / "Maison", pas de valeur par
   défaut sélectionnée. Chaque bouton navigue vers
   `/sport/workout/[id]/run` en ajoutant `?mode=home` pour "Maison" (rien
   pour "Salle").
4. `CircuitRunnerScreen` lit le paramètre `mode` de la route.
   `CircuitRunnerScreen` construit sa liste de sets en substituant, pour
   chaque set où `homeAlternativeExerciseId` est renseigné,
   `exerciseId → homeAlternativeExerciseId` — une transformation en
   mémoire, rien n'est réécrit en base. Rejouer la séance plus tard permet
   de choisir différemment.
5. "Salle" (ou séance sans alternative) : aucun changement, `exerciseId`
   original utilisé tel quel.

## Contenu PPL (données)

Les 3 séances (Push/Pull/Legs) sont transcrites depuis le PDF avec, pour
CHAQUE exercice, `exercise_id` = la version salle et
`home_alternative_exercise_id` = l'alternative poids du corps du PDF. Les
exercices alternatifs absents du catalogue (Pike Push-ups, Pompes Archer,
Élévations en planche, Pompes diamant, Tractions australiennes, Reverse fly
au sol, Pistol Squat, Fentes bulgares, Single-leg Romanian Deadlift,
Relevé de bassin au sol, etc.) sont insérés comme exercices personnalisés
dans `public.exercises`, même mécanisme que pour Hyrox/Luc Léger.

## Hors scope

- Interface de création d'alternative sur une séance personnelle
  (SessionBuilder) — l'utilisateur crée ses propres séances sans ce champ
  pour l'instant.
- Mémorisation du dernier choix salle/maison.
- Alternatives multiples (plus d'une par exercice) — le PDF n'en propose
  qu'une par exercice, le champ reste singulier.

## Tests

- `packages/database` : la fonction d'écriture/lecture reporte bien
  `homeAlternativeExerciseId` (aller-retour).
- `sessionWorkout.ts` : `sessionToWorkoutBlocks` copie
  `homeAlternativeExerciseId` du `UserSessionExercise` source vers le
  `SetEntry` généré.
- Nouveau composant de choix salle/maison : ne s'affiche pas quand aucun
  set n'a d'alternative ; affiche les deux options sinon.
- `CircuitRunnerScreen` (ou la fonction de substitution extraite) : avec
  `mode=home`, substitue `exerciseId` uniquement là où une alternative
  existe ; laisse les autres sets inchangés.
