-- Migre "Prépa Hyrox" (id existant `prog-hyrox-prep`, créé par la migration
-- 0004, jusqu'ici servi depuis le code via PROGRAM_CATALOG) vers le même
-- mécanisme que Luc Léger / Home Prépa Hyrox / PPL : de vraies séances
-- publiques (user_sessions/user_session_blocks/user_session_exercises),
-- reliées au programme via program_sessions.
--
-- Contrairement à ces trois-là, ce script NE CRÉE PAS de nouveau programme
-- catalogue : il réutilise l'id `prog-hyrox-prep` déjà publié (migration
-- 0040), pour que le contenu bascule proprement sans dupliquer la fiche ni
-- casser une inscription déjà en cours. Dès que des lignes program_sessions
-- existent pour cet id, l'app ignore automatiquement le repli codé en dur
-- (voir rowToProgram, apps/mobile/src/lib/data/repository.ts) — rien
-- d'autre à changer côté app.
--
-- Contenu transcrit fidèlement de HYROX_PATTERN (packages/shared/src/programs.ts,
-- ~L89), traduit dans le modèle à blocs (le format sets/reps à plat ne
-- permettait pas les circuits chronométrés/à distance du Hyrox réel).
-- À exécuter UNE SEULE FOIS dans l'éditeur SQL Supabase (projet vocumsjilhdmzilokhlq).

-- ---------------------------------------------------------------------------
-- 0. Mouvements absents de public.exercises (Wall Ball et le swing kettlebell
--    à deux mains n'existent pas dans free-exercise-db — même style que les
--    inserts déjà faits pour Luc Léger / Home Prépa Hyrox).
-- ---------------------------------------------------------------------------
insert into public.exercises (id, name, category, primary_muscles, secondary_muscles, equipment, level)
values
  ('Wall Ball Shots', 'Wall Ball Shots', 'functional', '{quads,shoulders}', '{core,glutes}', '{medicine_ball}', 'intermediate'),
  ('Kettlebell Swing', 'Kettlebell Swing', 'functional', '{glutes,hamstrings}', '{shoulders,core}', '{kettlebell}', 'beginner')
on conflict (id) do nothing;

with
  -- ---------------------------------------------------------------------
  -- Séance 1 : Force stations
  -- ---------------------------------------------------------------------
  s1_session as (
    insert into public.user_sessions (user_id, name, visibility)
    values ('856935cf-dd45-43d7-a42c-b11f6b230886', 'Force stations', 'public')
    returning id
  ),
  s1_block as (
    insert into public.user_session_blocks (session_id, "order", format)
    select id, 0, 'strength' from s1_session
    returning id as block_id, session_id
  ),
  s1_spec (exercise_id, sets, reps, ord) as (
    values
      ('Barbell_Squat', 5, 5, 0),
      ('Farmers_Walk', 4, 1, 1),
      ('Kettlebell Swing', 4, 15, 2),
      ('Wall Ball Shots', 4, 15, 3)
  ),
  s1_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", reps)
    select b.session_id, b.block_id, s.exercise_id, (s.ord * 100) + gs - 1, s.reps
    from s1_block b
    cross join s1_spec s
    cross join lateral generate_series(1, s.sets) as gs
    returning 1
  ),

  -- ---------------------------------------------------------------------
  -- Séance 2 : Engine & sled — 4 tours de (400 m rameur + 20 m traîneau),
  -- 2 min de récup entre les tours, puis un bloc burpees.
  -- ---------------------------------------------------------------------
  s2_session as (
    insert into public.user_sessions (user_id, name, visibility)
    values ('856935cf-dd45-43d7-a42c-b11f6b230886', 'Engine & sled', 'public')
    returning id
  ),
  s2_blocks as (
    insert into public.user_session_blocks (session_id, "order", format, target_rounds, rest_sec)
    select id, b.ord, b.fmt, b.rounds, b.rest
    from s2_session, (values (0, 'hyrox', 4, 120), (1, 'strength', null::int, null::int)) as b(ord, fmt, rounds, rest)
    returning id, "order"
  ),
  -- Bloc 0 (hyrox, 4 tours) : rameur + traîneau, un tour = une ligne chacun.
  s2_circuit_spec (ord, exercise_id, distance_m) as (
    values
      (0, 'Rowing_Stationary', 400),
      (1, 'Sled_Push', 20)
  ),
  s2_circuit_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", distance_m)
    select s2_session.id, b.id, sp.exercise_id, sp.ord, sp.distance_m
    from s2_circuit_spec sp
    join s2_blocks b on b."order" = 0
    cross join s2_session
    returning 1
  ),
  -- Bloc 1 (strength) : 4 séries de burpees, même pattern generate_series que
  -- les autres séances (une ligne par série, "order" incrémenté).
  s2_burpee_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", reps)
    select s2_session.id, b.id, 'Burpees', gs - 1, 10
    from s2_blocks b
    cross join s2_session
    cross join lateral generate_series(1, 4) as gs
    where b."order" = 1
    returning 1
  ),

  -- ---------------------------------------------------------------------
  -- Séance 3 : Hyrox simulation — 4 tours de (250 m course + stations),
  -- soit 1 km de course cumulé sur la séance, comme en vraie course Hyrox.
  -- ---------------------------------------------------------------------
  s3_session as (
    insert into public.user_sessions (user_id, name, notes, visibility)
    values (
      '856935cf-dd45-43d7-a42c-b11f6b230886', 'Hyrox simulation',
      'Enchaîne course et stations sans pause entre les deux — seule la transition d''une station à l''autre se repose.',
      'public'
    )
    returning id
  ),
  s3_block as (
    insert into public.user_session_blocks (session_id, "order", format, target_rounds)
    select id, 0, 'hyrox', 4 from s3_session
    returning id as block_id, session_id
  ),
  s3_spec (exercise_id, reps, distance_m, ord) as (
    values
      ('Running_Treadmill', null, 250, 0),
      ('Wall Ball Shots', 20, null, 1),
      ('Kettlebell Swing', 20, null, 2),
      ('Burpees', 15, null, 3)
  ),
  s3_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", reps, distance_m)
    select b.session_id, b.block_id, s.exercise_id, s.ord, s.reps, s.distance_m
    from s3_block b
    cross join s3_spec s
    returning 1
  ),

  -- ---------------------------------------------------------------------
  -- Séance 4 : Full body force
  -- ---------------------------------------------------------------------
  s4_session as (
    insert into public.user_sessions (user_id, name, visibility)
    values ('856935cf-dd45-43d7-a42c-b11f6b230886', 'Full body force', 'public')
    returning id
  ),
  s4_block as (
    insert into public.user_session_blocks (session_id, "order", format)
    select id, 0, 'strength' from s4_session
    returning id as block_id, session_id
  ),
  s4_spec (exercise_id, sets, reps, ord) as (
    values
      ('Barbell_Deadlift', 5, 5, 0),
      -- Pas de thruster barre dans le catalogue : la variante kettlebell,
      -- déjà utilisée côté Home Prépa Hyrox, est la plus proche disponible.
      ('Kettlebell_Thruster', 4, 10, 1),
      ('Mountain_Climbers', 4, 20, 2)
  ),
  s4_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", reps)
    select b.session_id, b.block_id, s.exercise_id, (s.ord * 100) + gs - 1, s.reps
    from s4_block b
    cross join s4_spec s
    cross join lateral generate_series(1, s.sets) as gs
    returning 1
  ),

  -- ---------------------------------------------------------------------
  -- Séance 5 : Cardio engine — 30 min à allure soutenue, intensité variée.
  -- ---------------------------------------------------------------------
  s5_session as (
    insert into public.user_sessions (user_id, name, notes, visibility)
    values (
      '856935cf-dd45-43d7-a42c-b11f6b230886', 'Cardio engine',
      '30 min à allure soutenue (course, rameur ou vélo), en variant l''intensité toutes les 5 min.',
      'public'
    )
    returning id
  ),
  s5_block as (
    insert into public.user_session_blocks (session_id, "order", format)
    select id, 0, 'strength' from s5_session
    returning id as block_id, session_id
  ),
  s5_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", duration_sec)
    select b.session_id, b.block_id, 'Running_Treadmill', 0, 1800
    from s5_block b
    returning 1
  )

-- ---------------------------------------------------------------------------
-- Planning : les 5 mêmes séances rejouées chaque semaine, sur 10 semaines
-- (identique à repeatWeekly(HYROX_PATTERN, 10, 5) côté code).
-- ---------------------------------------------------------------------------
insert into public.program_sessions (program_id, session_id, week_number, "order")
select 'prog-hyrox-prep', x.session_id, w.week_number, x."order"
from (values (1), (2), (3), (4), (5), (6), (7), (8), (9), (10)) as w(week_number)
cross join (
  select id as session_id, 0 as "order" from s1_session
  union all
  select id, 1 from s2_session
  union all
  select id, 2 from s3_session
  union all
  select id, 3 from s4_session
  union all
  select id, 4 from s5_session
) as x(session_id, "order");
