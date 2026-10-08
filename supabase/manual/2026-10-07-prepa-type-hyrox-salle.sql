-- Crée le programme catalogue "Prépa type Hyrox (en salle)" — reconstruit
-- de zéro, séance par séance, confirmé à chaque étape avec l'utilisateur
-- (source : exports Garmin de l'entraînement réel + corrections manuelles).
-- Même mécanisme que les autres programmes catalogue : vraies séances
-- publiques (user_sessions/user_session_blocks/user_session_exercises),
-- reliées au programme via program_sessions.
--
-- 4 semaines, 3 séances/semaine : RUN, SIMULATION, STATION. Les 3 noms se
-- répètent chaque semaine mais le contenu est DIFFÉRENT à chaque fois (12
-- séances distinctes en tout) — voulu par l'utilisateur, pas une erreur.
--
-- Convention « mètres vs répétitions » : pour les mouvements de déplacement
-- (burpees broad jump, marche du fermier, fentes en marchant, traîneau), la
-- valeur donnée est une DISTANCE en mètres, pas un nombre de répétitions —
-- confirmé explicitement par l'utilisateur pour plusieurs séances. Wall ball
-- et les mouvements stationnaires (squat, press, curl...) restent en reps.
--
-- À exécuter UNE SEULE FOIS dans l'éditeur SQL Supabase (projet vocumsjilhdmzilokhlq).

-- ---------------------------------------------------------------------------
-- 0. Mouvements absents de public.exercises.
-- ---------------------------------------------------------------------------
insert into public.exercises (id, name, category, primary_muscles, secondary_muscles, equipment, level)
values
  ('Burpees', 'Burpees', 'functional', '{full_body}', '{chest,quads,shoulders}', '{}', 'beginner'),
  ('Burpee Broad Jump', 'Burpee Broad Jump', 'functional', '{full_body}', '{quads,shoulders}', '{}', 'intermediate'),
  ('High Knees', 'High Knees', 'functional', '{quads}', '{core}', '{}', 'beginner'),
  ('Planche Touché Épaules', 'Planche Touché Épaules', 'functional', '{core}', '{shoulders,chest}', '{}', 'intermediate'),
  ('Fente Marchée Lestée', 'Fente Marchée Lestée', 'functional', '{quads,glutes}', '{shoulders,core}', '{dumbbell}', 'intermediate'),
  ('Wall Ball Shots', 'Wall Ball Shots', 'functional', '{quads,shoulders}', '{core,glutes}', '{medicine_ball}', 'intermediate'),
  ('Gainage Chaise', 'Gainage Chaise', 'functional', '{quads}', '{core}', '{}', 'beginner'),
  ('SkiErg', 'SkiErg', 'endurance', '{shoulders,core}', '{triceps,back}', '{machine}', 'beginner'),
  ('Extension de la Hanche', 'Extension de la Hanche', 'functional', '{glutes}', '{hamstrings}', '{}', 'beginner'),
  ('Extension de Triceps', 'Extension de Triceps', 'strength', '{triceps}', '{}', '{dumbbell}', 'beginner'),
  ('Fente Avant', 'Fente Avant', 'functional', '{quads,glutes}', '{core}', '{}', 'beginner'),
  ('Fentes Alternées', 'Fentes Alternées', 'functional', '{quads,glutes}', '{core}', '{}', 'beginner'),
  ('Squat Avant avec Haltère', 'Squat Avant avec Haltère', 'strength', '{quads}', '{glutes,core}', '{dumbbell}', 'intermediate'),
  ('Tirage de Traîneau', 'Tirage de Traîneau', 'functional', '{back,hamstrings}', '{core,shoulders}', '{sled}', 'intermediate')
on conflict (id) do nothing;

with
  -- =========================================================================
  -- SEMAINE 1
  -- =========================================================================
  -- -------------------------------------------------------------------
  -- S1 — RUN (semaine 1)
  -- -------------------------------------------------------------------
  s1_session as (
    insert into public.user_sessions (user_id, name, notes, visibility)
    values (
      '856935cf-dd45-43d7-a42c-b11f6b230886', 'RUN',
      'Course sur tapis : zone FC 2 à l''échauffement, zone FC 3 pour le reste de la séance.',
      'public'
    )
    returning id
  ),
  s1_warmup_spec (exercise_id, ord, duration_sec) as (
    values
      ('Running_Treadmill', 0, 120),
      ('Planche Touché Épaules', 1, 30),
      ('Fentes Alternées', 2, 30),
      ('Bodyweight_Squat', 3, 30),
      ('Front_Plate_Raise', 4, 30),
      ('Double_Leg_Butt_Kick', 5, 30),
      ('High Knees', 6, 30)
  ),
  s1_blocks as (
    insert into public.user_session_blocks (session_id, "order", format, target_rounds)
    select id, b.ord, b.fmt, b.rounds
    from s1_session, (values
      (0, 'strength', null::int),
      (1, 'hyrox', 1),
      (2, 'hyrox', 2),
      (3, 'hyrox', 1),
      (4, 'hyrox', 1),
      (5, 'hyrox', 1)
    ) as b(ord, fmt, rounds)
    returning id, "order"
  ),
  s1_warmup_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", duration_sec)
    select s1_session.id, b.id, sp.exercise_id, sp.ord, sp.duration_sec
    from s1_warmup_spec sp
    join s1_blocks b on b."order" = 0
    cross join s1_session
    returning 1
  ),
  s1_main_spec (block_ord, ord, exercise_id, duration_sec, weight_kg) as (
    values
      (1, 0, 'Burpee Broad Jump', 120, null),
      (1, 1, 'Running_Treadmill', 120, null),
      (2, 0, 'Farmers_Walk', 120, 30),
      (2, 1, 'Running_Treadmill', 120, null),
      (3, 0, 'Fente Marchée Lestée', 120, 30),
      (3, 1, 'Running_Treadmill', 120, null),
      (4, 0, 'Wall Ball Shots', 120, 9),
      (4, 1, 'Running_Treadmill', 120, null),
      (5, 0, 'Gainage Chaise', 60, null),
      (5, 1, 'Plank', 60, null),
      (5, 2, 'Running_Treadmill', 120, null)
  ),
  s1_main_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", duration_sec, weight_kg)
    select s1_session.id, b.id, sp.exercise_id, sp.ord, sp.duration_sec, sp.weight_kg
    from s1_main_spec sp
    join s1_blocks b on b."order" = sp.block_ord
    cross join s1_session
    returning 1
  ),

  -- -------------------------------------------------------------------
  -- S2 — SIMULATION (semaine 1)
  -- -------------------------------------------------------------------
  s2_session as (
    insert into public.user_sessions (user_id, name, visibility)
    values ('856935cf-dd45-43d7-a42c-b11f6b230886', 'SIMULATION', 'public')
    returning id
  ),
  s2_blocks as (
    insert into public.user_session_blocks (session_id, "order", format, time_cap_sec)
    select id, b.ord, b.fmt, b.cap
    from s2_session, (values
      (0, 'strength', null::int),
      (1, 'strength', null::int),
      (2, 'amrap', 120),
      (3, 'strength', null::int),
      (4, 'amrap', 120),
      (5, 'hyrox', null::int)
    ) as b(ord, fmt, cap)
    returning id, "order"
  ),
  -- Repos entre blocs : porté par le dernier exercice de chaque bloc (ce que
  -- lit le lecteur de séance), pas par le bloc — rest_sec sur
  -- user_session_blocks est réservé au repos intra-tabata.
  s2_spec (block_ord, ord, exercise_id, duration_sec, reps, weight_kg, rest_sec) as (
    values
      (0, 0, 'Running_Treadmill', 120, null, null, null),
      (0, 1, 'Front_Plate_Raise', 30, null, null, null),
      (0, 2, 'Fentes Alternées', 30, null, null, null),
      (0, 3, 'Front_Plate_Raise', 30, null, null, null),
      (0, 4, 'Fentes Alternées', 30, null, null, 30),
      (1, 0, 'Running_Treadmill', 300, null, null, null),
      (2, 0, 'Burpees', null, 5, null, null),
      (2, 1, 'Wall Ball Shots', null, 5, null, 20),
      (3, 0, 'Running_Treadmill', 300, null, null, null),
      (4, 0, 'Farmers_Walk', null, 20, 24, null),
      (4, 1, 'Fentes Alternées', null, 10, 30, 20),
      (5, 0, 'Running_Treadmill', 300, null, null, null),
      (5, 1, 'SkiErg', 120, null, null, null)
  ),
  s2_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", duration_sec, reps, weight_kg, rest_sec)
    select s2_session.id, b.id, sp.exercise_id, sp.ord, sp.duration_sec, sp.reps, sp.weight_kg, sp.rest_sec
    from s2_spec sp
    join s2_blocks b on b."order" = sp.block_ord
    cross join s2_session
    returning 1
  ),

  -- -------------------------------------------------------------------
  -- S3 — STATION (semaine 1)
  -- -------------------------------------------------------------------
  s3_session as (
    insert into public.user_sessions (user_id, name, visibility)
    values ('856935cf-dd45-43d7-a42c-b11f6b230886', 'STATION', 'public')
    returning id
  ),
  s3_blocks as (
    insert into public.user_session_blocks (session_id, "order", format)
    select id, b.ord, 'hyrox' from s3_session, (values (0),(1),(2),(3),(4)) as b(ord)
    returning id, "order"
  ),
  s3_spec (block_ord, ord, exercise_id, duration_sec, weight_kg) as (
    values
      (0, 0, 'Running_Treadmill', 120, null),
      (0, 1, 'Front_Plate_Raise', 30, null),
      (0, 2, 'Fente Marchée Lestée', 30, 30),
      (0, 3, 'Front_Plate_Raise', 30, null),
      (0, 4, 'Bodyweight_Squat', 30, null),
      (0, 5, 'Burpees', 30, null),
      (1, 0, 'Rowing_Stationary', 150, null),
      (1, 1, 'Burpees', 150, null),
      (2, 0, 'SkiErg', 150, null),
      (2, 1, 'Farmers_Walk', 150, 24),
      (3, 0, 'Rowing_Stationary', 150, null),
      (3, 1, 'Fente Marchée Lestée', 150, 30),
      (4, 0, 'SkiErg', 150, null),
      (4, 1, 'Wall Ball Shots', 150, 9)
  ),
  s3_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", duration_sec, weight_kg)
    select s3_session.id, b.id, sp.exercise_id, sp.ord, sp.duration_sec, sp.weight_kg
    from s3_spec sp
    join s3_blocks b on b."order" = sp.block_ord
    cross join s3_session
    returning 1
  ),

  -- =========================================================================
  -- SEMAINE 2
  -- =========================================================================
  -- -------------------------------------------------------------------
  -- S4 — RUN (semaine 2)
  -- -------------------------------------------------------------------
  s4_session as (
    insert into public.user_sessions (user_id, name, notes, visibility)
    values (
      '856935cf-dd45-43d7-a42c-b11f6b230886', 'RUN',
      '500m à la machine le plus vite possible, puis course sur le temps restant du bloc (plafond 5 min).',
      'public'
    )
    returning id
  ),
  s4_blocks as (
    insert into public.user_session_blocks (session_id, "order", format, time_cap_sec)
    select id, b.ord, b.fmt, b.cap
    from s4_session, (values (0, 'strength', null::int), (1, 'amrap', 300), (2, 'amrap', 300)) as b(ord, fmt, cap)
    returning id, "order"
  ),
  s4_spec (block_ord, ord, exercise_id, duration_sec, distance_m) as (
    values
      (0, 0, 'Rowing_Stationary', 120, null),
      (0, 1, 'Running_Treadmill', 120, null),
      (0, 2, 'Front_Plate_Raise', 30, null),
      (0, 3, 'Burpees', 30, null),
      (1, 0, 'Rowing_Stationary', null, 500),
      (1, 1, 'Running_Treadmill', null, null),
      (2, 0, 'SkiErg', null, 500),
      (2, 1, 'Running_Treadmill', null, null)
  ),
  s4_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", duration_sec, distance_m)
    select s4_session.id, b.id, sp.exercise_id, sp.ord, sp.duration_sec, sp.distance_m
    from s4_spec sp
    join s4_blocks b on b."order" = sp.block_ord
    cross join s4_session
    returning 1
  ),

  -- -------------------------------------------------------------------
  -- S5 — SIMULATION (semaine 2)
  -- -------------------------------------------------------------------
  s5_session as (
    insert into public.user_sessions (user_id, name, visibility)
    values ('856935cf-dd45-43d7-a42c-b11f6b230886', 'SIMULATION', 'public')
    returning id
  ),
  s5_blocks as (
    insert into public.user_session_blocks (session_id, "order", format, time_cap_sec)
    select id, b.ord, b.fmt, b.cap
    from s5_session, (values (0, 'strength', null::int), (1, 'amrap', 1200)) as b(ord, fmt, cap)
    returning id, "order"
  ),
  s5_spec (block_ord, ord, exercise_id, duration_sec, distance_m, reps, weight_kg) as (
    values
      (0, 0, 'Running_Treadmill', 120, null, null, null),
      (0, 1, 'Rowing_Stationary', 90, null, null, null),
      (0, 2, 'SkiErg', 120, null, null, null),
      (1, 0, 'Running_Treadmill', null, 250, null, null),
      (1, 1, 'Burpee Broad Jump', null, 20, null, null),
      (1, 2, 'Running_Treadmill', null, 250, null, null),
      (1, 3, 'Farmers_Walk', null, 40, null, 24),
      (1, 4, 'Running_Treadmill', null, 250, null, null),
      (1, 5, 'Fente Marchée Lestée', null, 80, null, 30),
      (1, 6, 'Running_Treadmill', null, 250, null, null),
      (1, 7, 'Wall Ball Shots', null, null, 20, 9)
  ),
  s5_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", duration_sec, distance_m, reps, weight_kg)
    select s5_session.id, b.id, sp.exercise_id, sp.ord, sp.duration_sec, sp.distance_m, sp.reps, sp.weight_kg
    from s5_spec sp
    join s5_blocks b on b."order" = sp.block_ord
    cross join s5_session
    returning 1
  ),

  -- -------------------------------------------------------------------
  -- S6 — STATION (semaine 2)
  -- -------------------------------------------------------------------
  s6_session as (
    insert into public.user_sessions (user_id, name, visibility)
    values ('856935cf-dd45-43d7-a42c-b11f6b230886', 'STATION', 'public')
    returning id
  ),
  s6_blocks as (
    insert into public.user_session_blocks (session_id, "order", format)
    select id, b.ord, 'hyrox' from s6_session, (values (0),(1),(2),(3)) as b(ord)
    returning id, "order"
  ),
  s6_spec (block_ord, ord, exercise_id, duration_sec, weight_kg) as (
    values
      (0, 0, 'Running_Treadmill', 60, null),
      (0, 1, 'Bodyweight_Squat', 30, null),
      (0, 2, 'Rowing_Stationary', 60, null),
      (0, 3, 'Planche Touché Épaules', 30, null),
      (0, 4, 'SkiErg', 60, null),
      (1, 0, 'Running_Treadmill', 180, null),
      (1, 1, 'Wall Ball Shots', 120, 9),
      (1, 2, 'Fente Marchée Lestée', 120, 30),
      (2, 0, 'Rowing_Stationary', 180, null),
      (2, 1, 'Burpee Broad Jump', 120, null),
      (2, 2, 'Farmers_Walk', 120, 30),
      (3, 0, 'SkiErg', 180, null),
      (3, 1, 'Sled_Push', 120, 130),
      (3, 2, 'Tirage de Traîneau', 120, 130)
  ),
  s6_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", duration_sec, weight_kg)
    select s6_session.id, b.id, sp.exercise_id, sp.ord, sp.duration_sec, sp.weight_kg
    from s6_spec sp
    join s6_blocks b on b."order" = sp.block_ord
    cross join s6_session
    returning 1
  ),

  -- =========================================================================
  -- SEMAINE 3
  -- =========================================================================
  -- -------------------------------------------------------------------
  -- S7 — RUN (semaine 3)
  -- -------------------------------------------------------------------
  s7_session as (
    insert into public.user_sessions (user_id, name, visibility)
    values ('856935cf-dd45-43d7-a42c-b11f6b230886', 'RUN', 'public')
    returning id
  ),
  s7_blocks as (
    insert into public.user_session_blocks (session_id, "order", format)
    select id, b.ord, b.fmt
    from s7_session, (values
      (0, 'strength'), (1, 'hyrox'), (2, 'hyrox'), (3, 'hyrox'), (4, 'hyrox'),
      (5, 'hyrox'), (6, 'hyrox'), (7, 'hyrox'), (8, 'hyrox')
    ) as b(ord, fmt)
    returning id, "order"
  ),
  s7_warmup_spec (ord, exercise_id, duration_sec) as (
    values
      (0, 'Running_Treadmill', 120),
      (1, 'Bodyweight_Squat', 30),
      (2, 'Planche Touché Épaules', 30),
      (3, 'Front_Plate_Raise', 30),
      (4, 'Rowing_Stationary', 120)
  ),
  s7_warmup_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", duration_sec)
    select s7_session.id, b.id, sp.exercise_id, sp.ord, sp.duration_sec
    from s7_warmup_spec sp
    join s7_blocks b on b."order" = 0
    cross join s7_session
    returning 1
  ),
  s7_main_spec (block_ord, exercise_id, duration_sec, weight_kg) as (
    values
      (1, 'SkiErg', 60, null),
      (2, 'Sled_Push', 60, 130),
      (3, 'Tirage de Traîneau', 60, 130),
      (4, 'Burpee Broad Jump', 60, null),
      (5, 'Rowing_Stationary', 60, null),
      (6, 'Farmers_Walk', 60, 24),
      (7, 'Fente Marchée Lestée', 60, 30),
      (8, 'Wall Ball Shots', 60, 9)
  ),
  s7_main_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", duration_sec, weight_kg)
    select s7_session.id, b.id, sp.exercise_id, 0, sp.duration_sec, sp.weight_kg
    from s7_main_spec sp
    join s7_blocks b on b."order" = sp.block_ord
    cross join s7_session
    returning 1
  ),
  -- Repos 30s après chaque bloc, porté par le dernier exercice (la course)
  -- — rest_sec sur user_session_blocks est réservé au repos intra-tabata.
  s7_run_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", duration_sec, rest_sec)
    select s7_session.id, b.id, 'Running_Treadmill', 1, 60, 30
    from s7_blocks b
    cross join s7_session
    where b."order" between 1 and 8
    returning 1
  ),

  -- -------------------------------------------------------------------
  -- S8 — SIMULATION (semaine 3)
  -- -------------------------------------------------------------------
  s8_session as (
    insert into public.user_sessions (user_id, name, visibility)
    values ('856935cf-dd45-43d7-a42c-b11f6b230886', 'SIMULATION', 'public')
    returning id
  ),
  s8_blocks as (
    insert into public.user_session_blocks (session_id, "order", format, time_cap_sec)
    select id, b.ord, b.fmt, b.cap
    from s8_session, (values
      (0, 'strength', null::int),
      (1, 'amrap', 481),
      (2, 'amrap', 481)
    ) as b(ord, fmt, cap)
    returning id, "order"
  ),
  -- Repos entre blocs : porté par le dernier exercice de chaque bloc, pas
  -- par le bloc — rest_sec sur user_session_blocks est réservé au repos
  -- intra-tabata.
  s8_spec (block_ord, ord, exercise_id, duration_sec, distance_m, weight_kg, rest_sec) as (
    values
      (0, 0, 'Rowing_Stationary', 120, null, null, null),
      (0, 1, 'Extension de la Hanche', 30, null, null, null),
      (0, 2, 'Fentes Alternées', 30, null, null, null),
      (0, 3, 'High Knees', 30, null, null, null),
      (0, 4, 'Bodyweight_Squat', 30, null, null, null),
      (0, 5, 'Running_Treadmill', 60, null, null, 30),
      (1, 0, 'Sled_Push', null, 10, 150, null),
      (1, 1, 'Running_Treadmill', null, 250, null, 140),
      (2, 0, 'Tirage de Traîneau', null, 10, 100, null),
      (2, 1, 'Running_Treadmill', null, 250, null, null)
  ),
  s8_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", duration_sec, distance_m, weight_kg, rest_sec)
    select s8_session.id, b.id, sp.exercise_id, sp.ord, sp.duration_sec, sp.distance_m, sp.weight_kg, sp.rest_sec
    from s8_spec sp
    join s8_blocks b on b."order" = sp.block_ord
    cross join s8_session
    returning 1
  ),

  -- -------------------------------------------------------------------
  -- S9 — STATION (semaine 3)
  -- -------------------------------------------------------------------
  s9_session as (
    insert into public.user_sessions (user_id, name, visibility)
    values ('856935cf-dd45-43d7-a42c-b11f6b230886', 'STATION', 'public')
    returning id
  ),
  s9_blocks as (
    insert into public.user_session_blocks (session_id, "order", format)
    select id, b.ord, 'hyrox'
    from s9_session, (values (0), (1), (2), (3), (4)) as b(ord)
    returning id, "order"
  ),
  s9_warmup_spec (ord, exercise_id, duration_sec) as (
    values
      (0, 'Rowing_Stationary', 120),
      (1, 'Bodyweight_Squat', 30),
      (2, 'Planche Touché Épaules', 30),
      (3, 'Double_Leg_Butt_Kick', 30),
      (4, 'Front_Plate_Raise', 30),
      (5, 'Fentes Alternées', 30),
      (6, 'High Knees', 30)
  ),
  s9_warmup_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", duration_sec)
    select s9_session.id, b.id, sp.exercise_id, sp.ord, sp.duration_sec
    from s9_warmup_spec sp
    join s9_blocks b on b."order" = 0
    cross join s9_session
    returning 1
  ),
  -- Repos 1 min après le bloc 3 seulement, porté par son dernier exercice —
  -- rest_sec sur user_session_blocks est réservé au repos intra-tabata.
  s9_main_spec (block_ord, ord, exercise_id, duration_sec, weight_kg, rest_sec) as (
    values
      (1, 0, 'Dumbbell_Bench_Press', 30, null, null),
      (1, 1, 'Extension de Triceps', 30, null, null),
      (1, 2, 'Sit-Up', 30, null, null),
      (1, 3, 'Burpee Broad Jump', 150, null, null),
      (2, 0, 'Barbell_Shrug', 30, null, null),
      (2, 1, 'Barbell_Curl', 30, null, null),
      (2, 2, 'Farmers_Walk', 180, 24, null),
      (3, 0, 'Gainage Chaise', 120, null, null),
      (3, 1, 'Fente Marchée Lestée', 120, null, 60),
      (4, 0, 'Standing_Dumbbell_Press', 30, null, null),
      (4, 1, 'Front_Barbell_Squat', 45, null, null),
      (4, 2, 'Wall Ball Shots', 165, 9, null)
  ),
  s9_main_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", duration_sec, weight_kg, rest_sec)
    select s9_session.id, b.id, sp.exercise_id, sp.ord, sp.duration_sec, sp.weight_kg, sp.rest_sec
    from s9_main_spec sp
    join s9_blocks b on b."order" = sp.block_ord
    cross join s9_session
    returning 1
  ),

  -- =========================================================================
  -- SEMAINE 4
  -- =========================================================================
  -- -------------------------------------------------------------------
  -- S10 — RUN (semaine 4)
  -- -------------------------------------------------------------------
  s10_session as (
    insert into public.user_sessions (user_id, name, visibility)
    values ('856935cf-dd45-43d7-a42c-b11f6b230886', 'RUN', 'public')
    returning id
  ),
  s10_blocks as (
    insert into public.user_session_blocks (session_id, "order", format, time_cap_sec)
    select id, b.ord, b.fmt, b.cap
    from s10_session, (values (0, 'strength', null::int), (1, 'amrap', 1200)) as b(ord, fmt, cap)
    returning id, "order"
  ),
  s10_spec (block_ord, ord, exercise_id, duration_sec, reps, distance_m, weight_kg) as (
    values
      (0, 0, 'Running_Treadmill', 120, null, null, null),
      (0, 1, 'Rowing_Stationary', 60, null, null, null),
      (0, 2, 'SkiErg', 60, null, null, null),
      (0, 3, 'Bodyweight_Squat', 30, null, null, null),
      (0, 4, 'Fentes Alternées', 30, null, null, null),
      (0, 5, 'Double_Leg_Butt_Kick', 30, null, null, null),
      (0, 6, 'High Knees', 30, null, null, null),
      (1, 0, 'Burpees', null, 5, null, null),
      (1, 1, 'Squat Avant avec Haltère', null, 10, null, null),
      (1, 2, 'Fente Marchée Lestée', null, null, 20, 30),
      (1, 3, 'Running_Treadmill', null, null, 250, null)
  ),
  s10_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", duration_sec, reps, distance_m, weight_kg)
    select s10_session.id, b.id, sp.exercise_id, sp.ord, sp.duration_sec, sp.reps, sp.distance_m, sp.weight_kg
    from s10_spec sp
    join s10_blocks b on b."order" = sp.block_ord
    cross join s10_session
    returning 1
  ),

  -- -------------------------------------------------------------------
  -- S11 — SIMULATION (semaine 4)
  -- -------------------------------------------------------------------
  s11_session as (
    insert into public.user_sessions (user_id, name, visibility)
    values ('856935cf-dd45-43d7-a42c-b11f6b230886', 'SIMULATION', 'public')
    returning id
  ),
  s11_blocks as (
    insert into public.user_session_blocks (session_id, "order", format, time_cap_sec)
    select id, b.ord, b.fmt, b.cap
    from s11_session, (values
      (0, 'strength', null::int),
      (1, 'amrap', 841),
      (2, 'hyrox', null::int)
    ) as b(ord, fmt, cap)
    returning id, "order"
  ),
  -- Repos 30s après l'échauffement seulement, porté par son dernier exercice
  -- — rest_sec sur user_session_blocks est réservé au repos intra-tabata.
  s11_spec (block_ord, ord, exercise_id, duration_sec, distance_m, reps, weight_kg, rest_sec) as (
    values
      (0, 0, 'Running_Treadmill', 120, null, null, null, null),
      (0, 1, 'Fentes Alternées', 30, null, null, null, null),
      (0, 2, 'Bodyweight_Squat', 30, null, null, null, null),
      (0, 3, 'Rowing_Stationary', 90, null, null, null, null),
      (0, 4, 'Planche Touché Épaules', 30, null, null, null, null),
      (0, 5, 'Front_Plate_Raise', 30, null, null, null, null),
      (0, 6, 'SkiErg', 60, null, null, null, 30),
      (1, 0, 'SkiErg', null, 500, null, null, null),
      (1, 1, 'Running_Treadmill', null, 150, null, null, null),
      (1, 2, 'Burpee Broad Jump', null, 15, null, null, null),
      (1, 3, 'Running_Treadmill', null, 150, null, null, null),
      (1, 4, 'Rowing_Stationary', null, 450, null, null, null),
      (1, 5, 'Running_Treadmill', null, 150, null, null, null),
      (1, 6, 'Fente Marchée Lestée', null, 30, null, 30, null),
      (1, 7, 'Running_Treadmill', null, 150, null, null, null),
      (1, 8, 'Wall Ball Shots', null, null, 15, 9, null),
      (1, 9, 'Running_Treadmill', null, 150, null, null, null),
      (2, 0, 'Tirage de Traîneau', 180, null, null, null, null),
      (2, 1, 'Sled_Push', 180, null, null, null, null)
  ),
  s11_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", duration_sec, distance_m, reps, weight_kg, rest_sec)
    select s11_session.id, b.id, sp.exercise_id, sp.ord, sp.duration_sec, sp.distance_m, sp.reps, sp.weight_kg, sp.rest_sec
    from s11_spec sp
    join s11_blocks b on b."order" = sp.block_ord
    cross join s11_session
    returning 1
  ),

  -- -------------------------------------------------------------------
  -- S12 — STATION (semaine 4)
  -- -------------------------------------------------------------------
  s12_session as (
    insert into public.user_sessions (user_id, name, visibility)
    values ('856935cf-dd45-43d7-a42c-b11f6b230886', 'STATION', 'public')
    returning id
  ),
  s12_blocks as (
    insert into public.user_session_blocks (session_id, "order", format, time_cap_sec)
    select id, b.ord, b.fmt, b.cap
    from s12_session, (values (0, 'strength', null::int), (1, 'hyrox', null::int), (2, 'amrap', 601)) as b(ord, fmt, cap)
    returning id, "order"
  ),
  s12_spec (block_ord, ord, exercise_id, duration_sec, distance_m, reps, weight_kg) as (
    values
      (0, 0, 'Running_Treadmill', 60, null, null, null),
      (0, 1, 'Bodyweight_Squat', 30, null, null, null),
      (0, 2, 'Fente Avant', 30, null, null, null),
      (0, 3, 'Front_Plate_Raise', 30, null, null, null),
      (0, 4, 'Burpees', 30, null, null, null),
      (1, 0, 'Running_Treadmill', 300, null, null, null),
      (1, 1, 'Rowing_Stationary', 180, null, null, null),
      (1, 2, 'SkiErg', 180, null, null, null),
      (2, 0, 'Wall Ball Shots', null, null, 20, 9),
      (2, 1, 'Burpee Broad Jump', null, 10, null, null),
      (2, 2, 'Fente Marchée Lestée', null, 20, null, 30),
      (2, 3, 'Farmers_Walk', null, 40, null, 24)
  ),
  s12_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", duration_sec, distance_m, reps, weight_kg)
    select s12_session.id, b.id, sp.exercise_id, sp.ord, sp.duration_sec, sp.distance_m, sp.reps, sp.weight_kg
    from s12_spec sp
    join s12_blocks b on b."order" = sp.block_ord
    cross join s12_session
    returning 1
  ),

  -- =========================================================================
  -- Le programme catalogue lui-même.
  -- =========================================================================
  program as (
    insert into public.programs (id, title, author, focus, level, weeks, sessions_per_week, description, price_cents, published)
    values (
      'prog-hyrox-salle-supotsu', 'Prépa type Hyrox (en salle)', 'Supotsu', 'hyrox', 'confirmed', 4, 3,
      'Quatre semaines de préparation type Hyrox : compromis course-atelier, blocs à plafond de temps et travail de traîneau. 12 séances chronométrées, à faire en salle.',
      0, true
    )
    returning id
  )
insert into public.program_sessions (program_id, session_id, week_number, "order")
select program.id, x.session_id, x.week_number, x."order"
from program
cross join (
  select id, 1, 0 from s1_session union all select id, 1, 1 from s2_session union all select id, 1, 2 from s3_session
  union all
  select id, 2, 0 from s4_session union all select id, 2, 1 from s5_session union all select id, 2, 2 from s6_session
  union all
  select id, 3, 0 from s7_session union all select id, 3, 1 from s8_session union all select id, 3, 2 from s9_session
  union all
  select id, 4, 0 from s10_session union all select id, 4, 1 from s11_session union all select id, 4, 2 from s12_session
) as x(session_id, week_number, "order");
