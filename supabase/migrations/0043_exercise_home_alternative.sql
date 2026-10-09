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
