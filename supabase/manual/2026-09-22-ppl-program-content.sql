-- Crée le contenu réel du programme "Push Pull Legs" — même mécanisme que
-- "Prépa type Hyrox" (prog-hyrox-supotsu) : de vraies séances publiques
-- (user_sessions/user_session_blocks/user_session_exercises), sous le même
-- compte, reliées au programme via program_sessions.
--
-- À exécuter UNE SEULE FOIS dans l'éditeur SQL Supabase (projet vocumsjilhdmzilokhlq).
-- Les migrations 0038/0040 (packages/shared/programs.ts côté code + published=true
-- pour prog-ppl) n'ont aucun effet réel ici — la vraie source de vérité pour le
-- catalogue backend est ce contenu, pas la liste de secours du code.

with
  -- ---------------------------------------------------------------------
  -- Séance 1 : Push
  -- ---------------------------------------------------------------------
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
  push_spec (exercise_id, sets, reps, ord) as (
    values
      ('Barbell_Bench_Press_-_Medium_Grip', 4, 8, 0),
      ('Barbell_Shoulder_Press', 3, 8, 1),
      ('Incline_Dumbbell_Press', 3, 10, 2),
      ('Side_Lateral_Raise', 3, 15, 3),
      ('EZ-Bar_Skullcrusher', 3, 12, 4)
  ),
  push_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", reps)
    select b.session_id, b.block_id, s.exercise_id, (s.ord * 100) + gs - 1, s.reps
    from push_block b
    cross join push_spec s
    cross join lateral generate_series(1, s.sets) as gs
    returning 1
  ),

  -- ---------------------------------------------------------------------
  -- Séance 2 : Pull
  -- ---------------------------------------------------------------------
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
  pull_spec (exercise_id, sets, reps, ord) as (
    values
      ('Barbell_Deadlift', 4, 5, 0),
      ('Bent_Over_Barbell_Row', 4, 8, 1),
      ('One-Arm_Dumbbell_Row', 3, 10, 2),
      ('Barbell_Curl', 3, 12, 3),
      ('Hammer_Curls', 3, 12, 4)
  ),
  pull_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", reps)
    select b.session_id, b.block_id, s.exercise_id, (s.ord * 100) + gs - 1, s.reps
    from pull_block b
    cross join pull_spec s
    cross join lateral generate_series(1, s.sets) as gs
    returning 1
  ),

  -- ---------------------------------------------------------------------
  -- Séance 3 : Jambes
  -- ---------------------------------------------------------------------
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
  legs_spec (exercise_id, sets, reps, ord) as (
    values
      ('Barbell_Squat', 4, 8, 0),
      ('Romanian_Deadlift', 3, 10, 1),
      ('Dumbbell_Lunges', 3, 10, 2),
      ('Standing_Barbell_Calf_Raise', 3, 15, 3)
  ),
  legs_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", reps)
    select b.session_id, b.block_id, s.exercise_id, (s.ord * 100) + gs - 1, s.reps
    from legs_block b
    cross join legs_spec s
    cross join lateral generate_series(1, s.sets) as gs
    returning 1
  ),

  -- ---------------------------------------------------------------------
  -- Le programme catalogue lui-même, déjà publié.
  -- ---------------------------------------------------------------------
  program as (
    insert into public.programs (id, title, author, focus, level, weeks, sessions_per_week, description, price_cents, published)
    values (
      'prog-ppl-supotsu', 'Push Pull Legs', 'Supotsu', 'strength', 'intermediate', 8, 3,
      'Split Push/Pull/Legs à la barre et aux haltères — un cycle complet par semaine.',
      0, true
    )
    returning id
  )

-- 8 semaines, les 3 mêmes séances rejouées chaque semaine (Push, Pull, Jambes).
insert into public.program_sessions (program_id, session_id, week_number, "order")
select p.id, s.id, w.week_number, s.ord
from program p
cross join (values (1), (2), (3), (4), (5), (6), (7), (8)) as w(week_number)
cross join (
  select id, 0 as ord from push_session
  union all
  select id, 1 from pull_session
  union all
  select id, 2 from legs_session
) as s;
