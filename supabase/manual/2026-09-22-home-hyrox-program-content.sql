-- "Home Prépa Hyrox" — variante maison de la prépa Hyrox (sans sled/wall ball,
-- kettlebells + tapis + rameur). Même mécanisme que "Prépa type Hyrox" :
-- vraies séances publiques, reliées à un programme catalogue via program_sessions.
-- À exécuter UNE SEULE FOIS dans l'éditeur SQL Supabase (projet vocumsjilhdmzilokhlq).

-- ---------------------------------------------------------------------------
-- 0. Trois mouvements absents de public.exercises (vérifié : Burpee Broad Jump
--    existe côté app dans hyroxSupplement.ts mais jamais semé côté serveur ;
--    High Knees et un KB Deadlift bilatéral propre n'existent nulle part).
-- ---------------------------------------------------------------------------
insert into public.exercises (id, name, category, primary_muscles, secondary_muscles, equipment, level)
values
  ('Burpee Broad Jump', 'Burpee Broad Jump', 'functional', '{full_body}', '{quads,shoulders}', '{}', 'intermediate'),
  ('High Knees', 'High Knees', 'functional', '{quads}', '{core}', '{}', 'beginner'),
  ('Kettlebell Deadlift', 'Kettlebell Deadlift', 'functional', '{back,hamstrings,glutes}', '{core}', '{kettlebell}', 'beginner')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------

-- SEMAINE 1..4 : une seule requête, du début à la fin, pour que le lien
-- final (program_sessions) référence directement chaque séance par sa CTE
-- plutôt que par un repérage nom+horodatage.
with
  s1_session as (
    insert into public.user_sessions (user_id, name, notes, visibility)
    values ('856935cf-dd45-43d7-a42c-b11f6b230886', 'Focus Run compromis S1', null, 'public')
    returning id
  ),
  s1_blocks as (
    insert into public.user_session_blocks (session_id, "order", format, time_cap_sec)
    select id, b.ord, 'hyrox', b.cap
    from s1_session, (values (0, null::int), (1, null), (2, null), (3, null), (4, null), (5, null)) as b(ord, cap)
    returning id, "order"
  ),
  s1_spec (block_ord, ord, exercise_id, reps, distance_m, duration_sec, weight_kg) as (
    values
      -- Échauffement HYROX
      (0, 0, 'Running_Treadmill', null, null, 120, null),
      (0, 1, 'Plank', null, null, 30, null),
      (0, 2, 'Dumbbell_Lunges', null, null, 30, null),
      (0, 3, 'Bodyweight_Squat', null, null, 30, null),
      (0, 4, 'Front_Dumbbell_Raise', null, null, 30, 6),
      (0, 5, 'Double_Leg_Butt_Kick', null, null, 30, null),
      (0, 6, 'High Knees', null, null, 30, null),
      -- Bloc 1
      (1, 0, 'Burpee Broad Jump', null, null, 120, null),
      (1, 1, 'Running_Treadmill', null, null, 120, null),
      -- Bloc 2
      (2, 0, 'Farmers_Walk', null, null, 120, 24),
      (2, 1, 'Running_Treadmill', null, null, 120, null),
      (2, 2, 'Farmers_Walk', null, null, 120, 24),
      (2, 3, 'Running_Treadmill', null, null, 120, null),
      -- Bloc 3
      (3, 0, 'Dumbbell_Lunges', null, null, 120, 24),
      (3, 1, 'Running_Treadmill', null, null, 120, null),
      -- Bloc 4 — remplacement Wall Ball
      (4, 0, 'Kettlebell_Thruster', null, null, 120, 8),
      (4, 1, 'Running_Treadmill', null, null, 120, null),
      -- Fin
      (5, 0, 'Plank', null, null, 60, null),
      (5, 1, 'Plank', null, null, 60, null),
      (5, 2, 'Running_Treadmill', null, null, 120, null)
  ),
  s1_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", reps, distance_m, duration_sec, weight_kg)
select s1_session.id, b.id, sp.exercise_id, sp.ord, sp.reps, sp.distance_m, sp.duration_sec, sp.weight_kg
from s1_spec sp
join s1_blocks b on b."order" = sp.block_ord
cross join s1_session
    returning 1
  ),

  s2_session as (
    insert into public.user_sessions (user_id, name, notes, visibility)
    values (
      '856935cf-dd45-43d7-a42c-b11f6b230886', 'Focus HYROX Stimulus S1',
      'AMRAP 2 min : 5 Burpees + 5 KB Thrusters (8 kg), répété sans arrêt — ne cherche pas un nombre maximal de répétitions au détriment de la technique.',
      'public'
    )
    returning id
  ),
  s2_blocks as (
    insert into public.user_session_blocks (session_id, "order", format, time_cap_sec)
    select id, b.ord, 'hyrox', b.cap
    from s2_session, (values (0, null::int), (1, null), (2, 120), (3, null), (4, null), (5, null)) as b(ord, cap)
    returning id, "order"
  ),
  s2_spec (block_ord, ord, exercise_id, reps, distance_m, duration_sec, weight_kg) as (
    values
      -- Échauffement
      (0, 0, 'Running_Treadmill', null, null, 120, null),
      (0, 1, 'Front_Dumbbell_Raise', null, null, 30, 6),
      (0, 2, 'Dumbbell_Lunges', null, null, 30, null),
      (0, 3, 'Front_Dumbbell_Raise', null, null, 30, null),
      (0, 4, 'Dumbbell_Lunges', null, null, 30, null),
      -- Bloc
      (1, 0, 'Running_Treadmill', null, null, 300, null),
      -- AMRAP 2 min
      (2, 0, 'Burpees', 5, null, null, null),
      (2, 1, 'Kettlebell_Thruster', 5, null, null, 8),
      -- Bloc
      (3, 0, 'Running_Treadmill', null, null, 300, null),
      -- HYROX 2 min
      (4, 0, 'Farmers_Walk', null, 20, null, 24),
      (4, 1, 'Dumbbell_Lunges', null, 10, null, 24),
      -- Fin
      (5, 0, 'Running_Treadmill', null, null, 300, null),
      (5, 1, 'Rowing_Stationary', null, null, 120, null)
  ),
  s2_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", reps, distance_m, duration_sec, weight_kg)
select s2_session.id, b.id, sp.exercise_id, sp.ord, sp.reps, sp.distance_m, sp.duration_sec, sp.weight_kg
from s2_spec sp
join s2_blocks b on b."order" = sp.block_ord
cross join s2_session
    returning 1
  ),

  s3_session as (
    insert into public.user_sessions (user_id, name, visibility)
    values ('856935cf-dd45-43d7-a42c-b11f6b230886', 'Focus atelier compromis S2', 'public')
    returning id
  ),
  s3_blocks as (
    insert into public.user_session_blocks (session_id, "order", format, time_cap_sec)
    select id, b.ord, 'hyrox', b.cap
    from s3_session, (values (0, null::int), (1, null), (2, null), (3, null), (4, 120), (5, null)) as b(ord, cap)
    returning id, "order"
  ),
  s3_spec (block_ord, ord, exercise_id, reps, distance_m, duration_sec, weight_kg) as (
    values
      -- Échauffement
      (0, 0, 'Running_Treadmill', null, null, 60, null),
      (0, 1, 'Bodyweight_Squat', null, null, 30, null),
      (0, 2, 'Rowing_Stationary', null, null, 60, null),
      (0, 3, 'Plank', null, null, 30, null),
      (0, 4, 'Rowing_Stationary', null, null, 60, null),
      -- Bloc
      (1, 0, 'Running_Treadmill', null, null, 180, null),
      (1, 1, 'Kettlebell_Thruster', null, null, 120, 8),
      (1, 2, 'Dumbbell_Lunges', null, null, 120, 24),
      -- Bloc
      (2, 0, 'Rowing_Stationary', null, null, 180, null),
      (2, 1, 'Burpee Broad Jump', null, null, 120, null),
      (2, 2, 'Farmers_Walk', null, null, 120, 24),
      -- Remplacement Sled Push
      (3, 0, 'Front_Squats_With_Two_Kettlebells', null, null, 120, 24),
      -- Remplacement Sled Pull — pendant 2 min, répéter
      (4, 0, 'Kettlebell Deadlift', 6, null, null, 24),
      (4, 1, 'Two-Arm_Kettlebell_Row', 6, null, null, 12),
      -- Fin
      (5, 0, 'Rowing_Stationary', null, null, 180, null)
  ),
  s3_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", reps, distance_m, duration_sec, weight_kg)
select s3_session.id, b.id, sp.exercise_id, sp.ord, sp.reps, sp.distance_m, sp.duration_sec, sp.weight_kg
from s3_spec sp
join s3_blocks b on b."order" = sp.block_ord
cross join s3_session
    returning 1
  ),

  s4_session as (
    insert into public.user_sessions (user_id, name, notes, visibility)
    values (
      '856935cf-dd45-43d7-a42c-b11f6b230886', 'Focus Run compromis S2',
      'Ne cherche pas nécessairement à terminer les deux distances dans exactement 5 minutes — le bloc dure 5 min, l''objectif est de conserver l''enchaînement et de progresser avec le temps.',
      'public'
    )
    returning id
  ),
  s4_blocks as (
    insert into public.user_session_blocks (session_id, "order", format, time_cap_sec)
    select id, b.ord, 'hyrox', b.cap
    from s4_session, (values (0, null::int), (1, 300), (2, 300)) as b(ord, cap)
    returning id, "order"
  ),
  s4_spec (block_ord, ord, exercise_id, reps, distance_m, duration_sec, weight_kg) as (
    values
      -- Échauffement
      (0, 0, 'Rowing_Stationary', null, null, 120, null),
      (0, 1, 'Running_Treadmill', null, null, 120, null),
      (0, 2, 'Front_Dumbbell_Raise', null, null, 30, 6),
      (0, 3, 'Burpees', null, null, 30, null),
      -- HYROX 5 min (x2)
      (1, 0, 'Rowing_Stationary', null, 500, null, null),
      (1, 1, 'Running_Treadmill', null, 500, null, null),
      (2, 0, 'Rowing_Stationary', null, 500, null, null),
      (2, 1, 'Running_Treadmill', null, 500, null, null)
  ),
  s4_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", reps, distance_m, duration_sec, weight_kg)
select s4_session.id, b.id, sp.exercise_id, sp.ord, sp.reps, sp.distance_m, sp.duration_sec, sp.weight_kg
from s4_spec sp
join s4_blocks b on b."order" = sp.block_ord
cross join s4_session
    returning 1
  ),

  s5_session as (
    insert into public.user_sessions (user_id, name, notes, visibility)
    values (
      '856935cf-dd45-43d7-a42c-b11f6b230886', 'Focus HYROX Stimulus S2',
      'Objectif : terminer le circuit dans les 20 minutes.',
      'public'
    )
    returning id
  ),
  s5_blocks as (
    insert into public.user_session_blocks (session_id, "order", format, time_cap_sec)
    select id, b.ord, 'hyrox', b.cap
    from s5_session, (values (0, null::int), (1, 1200)) as b(ord, cap)
    returning id, "order"
  ),
  s5_spec (block_ord, ord, exercise_id, reps, distance_m, duration_sec, weight_kg) as (
    values
      -- Échauffement (Rameur/SkiErg remplacé par rameur)
      (0, 0, 'Running_Treadmill', null, null, 120, null),
      (0, 1, 'Rowing_Stationary', null, null, 90, null),
      (0, 2, 'Rowing_Stationary', null, null, 120, null),
      -- HYROX 20 min, dans l'ordre
      (1, 0, 'Running_Treadmill', null, 250, null, null),
      (1, 1, 'Burpees', 20, null, null, null),
      (1, 2, 'Running_Treadmill', null, 250, null, null),
      (1, 3, 'Farmers_Walk', null, 40, null, 24),
      (1, 4, 'Running_Treadmill', null, 250, null, null),
      (1, 5, 'Dumbbell_Lunges', null, 80, null, 24),
      (1, 6, 'Running_Treadmill', null, 250, null, null),
      (1, 7, 'Kettlebell_Thruster', 20, null, null, 8)
  ),
  s5_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", reps, distance_m, duration_sec, weight_kg)
select s5_session.id, b.id, sp.exercise_id, sp.ord, sp.reps, sp.distance_m, sp.duration_sec, sp.weight_kg
from s5_spec sp
join s5_blocks b on b."order" = sp.block_ord
cross join s5_session
    returning 1
  ),

  s6_session as (
    insert into public.user_sessions (user_id, name, notes, visibility)
    values (
      '856935cf-dd45-43d7-a42c-b11f6b230886', 'Focus HYROX Stimulus S3',
      'Bloc 1 (remplacement Sled Push) : effort jambes puis course sous fatigue. Bloc 2 (remplacement Sled Pull) : chaîne postérieure/tirage puis course. Chaque bloc dure 8 min 01 s, à répéter.',
      'public'
    )
    returning id
  ),
  s6_blocks as (
    insert into public.user_session_blocks (session_id, "order", format, time_cap_sec)
    select id, b.ord, 'hyrox', b.cap
    from s6_session, (values (0, null::int), (1, 481), (2, 481)) as b(ord, cap)
    returning id, "order"
  ),
  s6_spec (block_ord, ord, exercise_id, reps, distance_m, duration_sec, weight_kg) as (
    values
      -- Échauffement
      (0, 0, 'Rowing_Stationary', null, null, 120, null),
      (0, 1, 'Hip_Extension_with_Bands', null, null, 30, null),
      (0, 2, 'Dumbbell_Lunges', null, null, 30, null),
      (0, 3, 'High Knees', null, null, 30, null),
      (0, 4, 'Bodyweight_Squat', null, null, 30, null),
      (0, 5, 'Running_Treadmill', null, null, 60, null),
      -- Remplacement Sled Push — répéter 8 min 01 s
      (1, 0, 'Front_Squats_With_Two_Kettlebells', null, null, null, 24),
      (1, 1, 'Running_Treadmill', null, 250, null, null),
      -- Remplacement Sled Pull — répéter 8 min 01 s
      (2, 0, 'Kettlebell Deadlift', 8, null, null, 24),
      (2, 1, 'Two-Arm_Kettlebell_Row', 8, null, null, 12),
      (2, 2, 'Running_Treadmill', null, 250, null, null)
  ),
  s6_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", reps, distance_m, duration_sec, weight_kg)
select s6_session.id, b.id, sp.exercise_id, sp.ord, sp.reps, sp.distance_m, sp.duration_sec, sp.weight_kg
from s6_spec sp
join s6_blocks b on b."order" = sp.block_ord
cross join s6_session
    returning 1
  ),

  s7_session as (
    insert into public.user_sessions (user_id, name, visibility)
    values ('856935cf-dd45-43d7-a42c-b11f6b230886', 'Focus Run compromis S3', 'public')
    returning id
  ),
  s7_blocks as (
    insert into public.user_session_blocks (session_id, "order", format, time_cap_sec)
    select id, b.ord, 'hyrox', null
    from s7_session, (values (0), (1), (2), (3), (4), (5), (6), (7)) as b(ord)
    returning id, "order"
  ),
  s7_spec (block_ord, ord, exercise_id, reps, distance_m, duration_sec, weight_kg) as (
    values
      -- Échauffement
      (0, 0, 'Running_Treadmill', null, null, 120, null),
      (0, 1, 'Bodyweight_Squat', null, null, 30, null),
      (0, 2, 'Plank', null, null, 30, null),
      (0, 3, 'Front_Dumbbell_Raise', null, null, 30, 6),
      (0, 4, 'Rowing_Stationary', null, null, 120, null),
      -- Bloc 1
      (1, 0, 'Rowing_Stationary', null, null, 60, null),
      (1, 1, 'Running_Treadmill', null, null, 60, null),
      -- Bloc 2 — remplacement Sled Push
      (2, 0, 'Front_Squats_With_Two_Kettlebells', null, null, 60, 24),
      (2, 1, 'Running_Treadmill', null, null, 60, null),
      -- Bloc 3 — remplacement Sled Pull (KB Deadlift + Row, 1 min à deux)
      (3, 0, 'Kettlebell Deadlift', null, null, 30, null),
      (3, 1, 'Two-Arm_Kettlebell_Row', null, null, 30, null),
      (3, 2, 'Running_Treadmill', null, null, 60, null),
      -- Bloc 4
      (4, 0, 'Burpees', null, null, 60, null),
      (4, 1, 'Running_Treadmill', null, null, 60, null),
      -- Bloc 5
      (5, 0, 'Rowing_Stationary', null, null, 60, null),
      (5, 1, 'Running_Treadmill', null, null, 60, null),
      -- Bloc 6
      (6, 0, 'Farmers_Walk', null, null, 60, 24),
      (6, 1, 'Running_Treadmill', null, null, 60, null),
      -- Bloc 7
      (7, 0, 'Dumbbell_Lunges', null, null, 60, 24),
      (7, 1, 'Running_Treadmill', null, null, 60, null)
  ),
  s7_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", reps, distance_m, duration_sec, weight_kg)
select s7_session.id, b.id, sp.exercise_id, sp.ord, sp.reps, sp.distance_m, sp.duration_sec, sp.weight_kg
from s7_spec sp
join s7_blocks b on b."order" = sp.block_ord
cross join s7_session
    returning 1
  ),

  s8_session as (
    insert into public.user_sessions (user_id, name, notes, visibility)
    values (
      '856935cf-dd45-43d7-a42c-b11f6b230886', 'Focus HYROX Stimulus S4',
      'HYROX 14 min : objectif réaliser le circuit dans le temps.',
      'public'
    )
    returning id
  ),
  s8_blocks as (
    insert into public.user_session_blocks (session_id, "order", format, time_cap_sec)
    select id, b.ord, 'hyrox', b.cap
    from s8_session, (values (0, null::int), (1, 840), (2, null)) as b(ord, cap)
    returning id, "order"
  ),
  s8_spec (block_ord, ord, exercise_id, reps, distance_m, duration_sec, weight_kg) as (
    values
      -- Échauffement
      (0, 0, 'Running_Treadmill', null, null, 60, null),
      (0, 1, 'Dumbbell_Lunges', null, null, 30, null),
      (0, 2, 'Bodyweight_Squat', null, null, 30, null),
      (0, 3, 'Rowing_Stationary', null, null, 90, null),
      (0, 4, 'Plank', null, null, 30, null),
      (0, 5, 'Front_Dumbbell_Raise', null, null, 30, 6),
      (0, 6, 'Rowing_Stationary', null, null, 60, null),
      -- HYROX 14 min
      (1, 0, 'Rowing_Stationary', null, 500, null, null),
      (1, 1, 'Running_Treadmill', null, 150, null, null),
      (1, 2, 'Burpees', 15, null, null, null),
      (1, 3, 'Running_Treadmill', null, 150, null, null),
      (1, 4, 'Rowing_Stationary', null, 500, null, null),
      (1, 5, 'Running_Treadmill', null, 150, null, null),
      (1, 6, 'Dumbbell_Lunges', null, 30, null, 24),
      (1, 7, 'Running_Treadmill', null, 150, null, null),
      (1, 8, 'Kettlebell_Thruster', 15, null, null, 8),
      (1, 9, 'Running_Treadmill', null, 150, null, null),
      -- Fin — remplacement Sled
      (2, 0, 'Kettlebell Deadlift', null, null, 90, null),
      (2, 1, 'Two-Arm_Kettlebell_Row', null, null, 90, null),
      (2, 2, 'Front_Squats_With_Two_Kettlebells', null, null, 180, null)
  ),
  s8_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", reps, distance_m, duration_sec, weight_kg)
select s8_session.id, b.id, sp.exercise_id, sp.ord, sp.reps, sp.distance_m, sp.duration_sec, sp.weight_kg
from s8_spec sp
join s8_blocks b on b."order" = sp.block_ord
cross join s8_session
    returning 1
  ),

  s9_session as (
    insert into public.user_sessions (user_id, name, notes, visibility)
    values (
      '856935cf-dd45-43d7-a42c-b11f6b230886', 'Focus Run compromis S4',
      'Recommence le circuit autant que possible pendant 20 min 03 s — conserve le circuit original plutôt que de chercher un nombre fixe de tours.',
      'public'
    )
    returning id
  ),
  s9_blocks as (
    insert into public.user_session_blocks (session_id, "order", format, time_cap_sec)
    select id, b.ord, 'hyrox', b.cap
    from s9_session, (values (0, null::int), (1, 1203)) as b(ord, cap)
    returning id, "order"
  ),
  s9_spec (block_ord, ord, exercise_id, reps, distance_m, duration_sec, weight_kg) as (
    values
      -- Échauffement
      (0, 0, 'Running_Treadmill', null, null, 120, null),
      (0, 1, 'Rowing_Stationary', null, null, 60, null),
      (0, 2, 'Rowing_Stationary', null, null, 60, null),
      (0, 3, 'Bodyweight_Squat', null, null, 30, null),
      (0, 4, 'Dumbbell_Lunges', null, null, 30, null),
      (0, 5, 'Double_Leg_Butt_Kick', null, null, 30, null),
      (0, 6, 'High Knees', null, null, 30, null),
      -- HYROX 20 min 03 s, circuit répété
      (1, 0, 'Burpees', 5, null, null, null),
      (1, 1, 'Bodyweight_Squat', 10, null, null, null),
      (1, 2, 'Farmers_Walk', null, 20, null, 24),
      (1, 3, 'Running_Treadmill', null, 500, null, null)
  ),
  s9_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", reps, distance_m, duration_sec, weight_kg)
select s9_session.id, b.id, sp.exercise_id, sp.ord, sp.reps, sp.distance_m, sp.duration_sec, sp.weight_kg
from s9_spec sp
join s9_blocks b on b."order" = sp.block_ord
cross join s9_session
    returning 1
  ),

  s10_session as (
    insert into public.user_sessions (user_id, name, notes, visibility)
    values (
      '856935cf-dd45-43d7-a42c-b11f6b230886', 'Focus atelier compromis S4',
      'Rameur à résistance ~9 kg si possible, sinon résistance habituelle. HYROX 10 min 01 s maximum.',
      'public'
    )
    returning id
  ),
  s10_blocks as (
    insert into public.user_session_blocks (session_id, "order", format, time_cap_sec)
    select id, b.ord, 'hyrox', b.cap
    from s10_session, (values (0, null::int), (1, null), (2, 601)) as b(ord, cap)
    returning id, "order"
  ),
  s10_spec (block_ord, ord, exercise_id, reps, distance_m, duration_sec, weight_kg) as (
    values
      -- Échauffement
      (0, 0, 'Running_Treadmill', null, null, 60, null),
      (0, 1, 'Bodyweight_Squat', null, null, 30, null),
      (0, 2, 'Dumbbell_Lunges', null, null, 30, null),
      (0, 3, 'Front_Dumbbell_Raise', null, null, 30, 6),
      (0, 4, 'Burpees', null, null, 30, null),
      -- Bloc cardio
      (1, 0, 'Running_Treadmill', null, null, 300, null),
      (1, 1, 'Rowing_Stationary', null, null, 180, null),
      (1, 2, 'Rowing_Stationary', null, null, 180, null),
      -- HYROX 10 min 01 s, dans l'ordre — Wall Ball remplacé par KB Thruster
      (2, 0, 'Kettlebell_Thruster', 20, null, null, 8),
      (2, 1, 'Burpee Broad Jump', null, 10, null, null),
      (2, 2, 'Dumbbell_Lunges', null, 20, null, 24),
      (2, 3, 'Farmers_Walk', null, 40, null, null)
  ),
  s10_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", reps, distance_m, duration_sec, weight_kg)
select s10_session.id, b.id, sp.exercise_id, sp.ord, sp.reps, sp.distance_m, sp.duration_sec, sp.weight_kg
from s10_spec sp
join s10_blocks b on b."order" = sp.block_ord
cross join s10_session
    returning 1
  ),

  program as (
    insert into public.programs (id, title, author, focus, level, weeks, sessions_per_week, description, price_cents, published)
    values (
      'prog-home-hyrox-supotsu', 'Home Prépa Hyrox', 'Supotsu', 'hyrox', 'confirmed', 4, 3,
      'Prépa Hyrox à faire à la maison — kettlebells, tapis, rameur, sans sled ni wall ball.',
      0, true
    )
    returning id
  )
insert into public.program_sessions (program_id, session_id, week_number, "order")
select program.id, x.session_id, x.week_number, x."order"
from program
cross join (
  select s1_session.id, 1, 0 from s1_session
union all
  select s2_session.id, 1, 1 from s2_session
union all
  select s3_session.id, 2, 0 from s3_session
union all
  select s4_session.id, 2, 1 from s4_session
union all
  select s5_session.id, 2, 2 from s5_session
union all
  select s6_session.id, 3, 0 from s6_session
union all
  select s7_session.id, 3, 1 from s7_session
union all
  select s8_session.id, 4, 0 from s8_session
union all
  select s9_session.id, 4, 1 from s9_session
union all
  select s10_session.id, 4, 2 from s10_session
) as x(session_id, week_number, "order");
