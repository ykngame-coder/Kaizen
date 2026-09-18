-- ---------------------------------------------------------------------------
-- Hyrox block format.
--
-- Chaque station a un objectif fixé à la création dans distance_m OU
-- duration_sec (jamais les deux) ; le runner remplit l'autre à la fin de la
-- station. Pas de nouvelle colonne de "mode" : lequel des deux est renseigné
-- suffit à le déduire (voir SetEntry.distanceM).
--
-- Les contraintes de format sont déjà nommées explicitement depuis 0030
-- (workout_blocks_format_valid, user_session_blocks_format_valid) : ajouter
-- un format est donc un changement d'une ligne par table, pas une danse de
-- renommage.
-- ---------------------------------------------------------------------------

alter table public.workout_blocks
  drop constraint if exists workout_blocks_format_valid;
alter table public.workout_blocks
  add constraint workout_blocks_format_valid
  check (format in ('strength', 'amrap', 'emom', 'for_time', 'tabata', 'hyrox'));

alter table public.user_session_blocks
  drop constraint if exists user_session_blocks_format_valid;
alter table public.user_session_blocks
  add constraint user_session_blocks_format_valid
  check (format in ('strength', 'amrap', 'emom', 'for_time', 'tabata', 'hyrox'));

alter table public.workout_sets
  add column if not exists distance_m numeric;

alter table public.user_session_exercises
  add column if not exists distance_m numeric;
