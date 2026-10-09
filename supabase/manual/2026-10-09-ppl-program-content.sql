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
--
-- Si « prog-ppl-supotsu » existe déjà en base (un script antérieur du
-- 22/09 a créé ce même id) : relancer d'abord
-- 2026-10-07-reset-program-catalog.sql, ou supprimer cette ligne de
-- public.programs — sinon l'insertion du programme échoue sur un conflit
-- de clé primaire (les 11 exercices personnalisés du bloc 0, eux, auront
-- déjà été insérés avec succès avant cet échec : pas de rollback entre les
-- deux instructions).

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
