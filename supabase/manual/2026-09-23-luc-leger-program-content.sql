-- "Prépa Test Luc Léger" — 4 semaines, 3 séances/semaine, même mécanisme que
-- Prépa Hyrox / Home Prépa Hyrox : vraies séances publiques, reliées à un
-- programme catalogue via program_sessions. Contenu transcrit du PDF fourni.
-- À exécuter UNE SEULE FOIS dans l'éditeur SQL Supabase (projet vocumsjilhdmzilokhlq).

-- ---------------------------------------------------------------------------
-- 0. Un seul mouvement absent de public.exercises : le test lui-même n'est
--    pas un exercice de musculation, donc absent de free-exercise-db.
--    Wind_Sprints, Split_Jump et Freehand_Jump_Squat existent déjà en base.
-- ---------------------------------------------------------------------------
insert into public.exercises (id, name, category, primary_muscles, secondary_muscles, equipment, level)
values
  ('Test Luc Léger', 'Test Luc Léger', 'sport_specific', '{full_body}', '{quads,calves}', '{}', 'intermediate')
on conflict (id) do nothing;

with
  -- ---------------------------------------------------------------------
  -- Phase 1 (semaines 1 & 2) — Séance 1 : VMA Courte
  -- ---------------------------------------------------------------------
  s1_session as (
    insert into public.user_sessions (user_id, name, notes, visibility)
    values (
      '856935cf-dd45-43d7-a42c-b11f6b230886', 'VMA Courte',
      '10 min d''échauffement avant de commencer. 3 min de récupération entre les 2 séries.',
      'public'
    )
    returning id
  ),
  s1_blocks as (
    insert into public.user_session_blocks (session_id, "order", format, time_cap_sec, rest_sec, target_rounds)
    select id, b.ord, 'tabata', 30, 30, 8
    from s1_session, (values (0), (1)) as b(ord)
    returning id, "order"
  ),
  s1_spec (block_ord, ord, exercise_id, reps, distance_m, duration_sec, weight_kg) as (
    values
      (0, 0, 'Wind_Sprints', null, null, null, null),
      (1, 0, 'Wind_Sprints', null, null, null, null)
  ),
  s1_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", reps, distance_m, duration_sec, weight_kg)
    select s1_session.id, b.id, sp.exercise_id, sp.ord, sp.reps::smallint, sp.distance_m::numeric, sp.duration_sec::integer, sp.weight_kg::numeric(6,2)
    from s1_spec sp
    join s1_blocks b on b."order" = sp.block_ord
    cross join s1_session
    returning 1
  ),

  -- ---------------------------------------------------------------------
  -- Phase 1 — Séance 2 : Spécifique Luc Léger
  -- ---------------------------------------------------------------------
  s2_session as (
    insert into public.user_sessions (user_id, name, notes, visibility)
    values (
      '856935cf-dd45-43d7-a42c-b11f6b230886', 'Spécifique Luc Léger',
      'Technique du demi-tour : ne ralentis pas trop tôt. Franchis la ligne d''un seul pied, pivote sur le bassin et relance immédiatement. Alterne la jambe de pivot à chaque aller-retour. 10 min d''échauffement avant de commencer, 2 min de récupération entre les séries.',
      'public'
    )
    returning id
  ),
  s2_blocks as (
    insert into public.user_session_blocks (session_id, "order", format)
    select id, 0, 'hyrox'
    from s2_session
    returning id, "order"
  ),
  s2_spec (block_ord, ord, exercise_id, reps, distance_m, duration_sec, weight_kg) as (
    values
      -- 3 séries de 6 allers-retours de 20 m
      (0, 0, 'Wind_Sprints', 6, 20, null, null),
      (0, 1, 'Wind_Sprints', 6, 20, null, null),
      (0, 2, 'Wind_Sprints', 6, 20, null, null)
  ),
  s2_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", reps, distance_m, duration_sec, weight_kg)
    select s2_session.id, b.id, sp.exercise_id, sp.ord, sp.reps::smallint, sp.distance_m::numeric, sp.duration_sec::integer, sp.weight_kg::numeric(6,2)
    from s2_spec sp
    join s2_blocks b on b."order" = sp.block_ord
    cross join s2_session
    returning 1
  ),

  -- ---------------------------------------------------------------------
  -- Phase 1 — Séance 3 : Endurance de Base
  -- ---------------------------------------------------------------------
  s3_session as (
    insert into public.user_sessions (user_id, name, notes, visibility)
    values (
      '856935cf-dd45-43d7-a42c-b11f6b230886', 'Endurance de Base',
      '40 à 45 min de footing continu à aisance respiratoire — tu dois pouvoir tenir une conversation.',
      'public'
    )
    returning id
  ),
  s3_blocks as (
    insert into public.user_session_blocks (session_id, "order", format)
    select id, 0, 'hyrox'
    from s3_session
    returning id, "order"
  ),
  s3_spec (block_ord, ord, exercise_id, reps, distance_m, duration_sec, weight_kg) as (
    values
      (0, 0, 'Running_Treadmill', null, null, 2700, null)
  ),
  s3_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", reps, distance_m, duration_sec, weight_kg)
    select s3_session.id, b.id, sp.exercise_id, sp.ord, sp.reps::smallint, sp.distance_m::numeric, sp.duration_sec::integer, sp.weight_kg::numeric(6,2)
    from s3_spec sp
    join s3_blocks b on b."order" = sp.block_ord
    cross join s3_session
    returning 1
  ),

  -- ---------------------------------------------------------------------
  -- Phase 2 (semaines 3 & 4) — Séance 1 : Fractionné 15/15
  -- ---------------------------------------------------------------------
  s4_session as (
    insert into public.user_sessions (user_id, name, notes, visibility)
    values (
      '856935cf-dd45-43d7-a42c-b11f6b230886', 'Fractionné 15/15',
      '10 min d''échauffement avant de commencer. 3 min de récupération entre les 2 séries.',
      'public'
    )
    returning id
  ),
  s4_blocks as (
    insert into public.user_session_blocks (session_id, "order", format, time_cap_sec, rest_sec, target_rounds)
    select id, b.ord, 'tabata', 15, 15, 10
    from s4_session, (values (0), (1)) as b(ord)
    returning id, "order"
  ),
  s4_spec (block_ord, ord, exercise_id, reps, distance_m, duration_sec, weight_kg) as (
    values
      (0, 0, 'Wind_Sprints', null, null, null, null),
      (1, 0, 'Wind_Sprints', null, null, null, null)
  ),
  s4_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", reps, distance_m, duration_sec, weight_kg)
    select s4_session.id, b.id, sp.exercise_id, sp.ord, sp.reps::smallint, sp.distance_m::numeric, sp.duration_sec::integer, sp.weight_kg::numeric(6,2)
    from s4_spec sp
    join s4_blocks b on b."order" = sp.block_ord
    cross join s4_session
    returning 1
  ),

  -- ---------------------------------------------------------------------
  -- Phase 2 — Séance 2 : Test à Blanc
  -- ---------------------------------------------------------------------
  s5_session as (
    insert into public.user_sessions (user_id, name, notes, visibility)
    values (
      '856935cf-dd45-43d7-a42c-b11f6b230886', 'Test à Blanc',
      'Gestion de l''allure : économise-toi sur les 4 premiers paliers. Cale ta foulée exactement sur le bip sonore sans chercher à anticiper ou courir trop vite au démarrage. Le jour du test : 15 min d''échauffement spécifique (montées de genoux, pas chassés, mobilité des chevilles) ; privilégie des chaussures de course légères avec une bonne adhérence pour les demi-tours.',
      'public'
    )
    returning id
  ),
  s5_blocks as (
    insert into public.user_session_blocks (session_id, "order", format)
    select id, 0, 'hyrox'
    from s5_session
    returning id, "order"
  ),
  s5_spec (block_ord, ord, exercise_id, reps, distance_m, duration_sec, weight_kg) as (
    values
      -- Échauffement complet + Test Luc Léger en conditions réelles (bande sonore officielle) — pas de distance/temps fixe, ça dépend du palier atteint.
      (0, 0, 'Test Luc Léger', null, null, null, null)
  ),
  s5_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", reps, distance_m, duration_sec, weight_kg)
    select s5_session.id, b.id, sp.exercise_id, sp.ord, sp.reps::smallint, sp.distance_m::numeric, sp.duration_sec::integer, sp.weight_kg::numeric(6,2)
    from s5_spec sp
    join s5_blocks b on b."order" = sp.block_ord
    cross join s5_session
    returning 1
  ),

  -- ---------------------------------------------------------------------
  -- Phase 2 — Séance 3 : Endurance + Pliométrie
  -- ---------------------------------------------------------------------
  s6_session as (
    insert into public.user_sessions (user_id, name, notes, visibility)
    values (
      '856935cf-dd45-43d7-a42c-b11f6b230886', 'Endurance + Pliométrie',
      '30 min de footing avant le circuit pliométrique.',
      'public'
    )
    returning id
  ),
  s6_blocks as (
    insert into public.user_session_blocks (session_id, "order", format, target_rounds)
    select id, b.ord, b.fmt, b.rounds
    from s6_session, (values (0, 'hyrox', null::int), (1, 'for_time', 4)) as b(ord, fmt, rounds)
    returning id, "order"
  ),
  s6_spec (block_ord, ord, exercise_id, reps, distance_m, duration_sec, weight_kg) as (
    values
      (0, 0, 'Running_Treadmill', null, null, 1800, null),
      (1, 0, 'Split_Jump', 10, null, null, null),
      (1, 1, 'Freehand_Jump_Squat', 10, null, null, null)
  ),
  s6_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", reps, distance_m, duration_sec, weight_kg)
    select s6_session.id, b.id, sp.exercise_id, sp.ord, sp.reps::smallint, sp.distance_m::numeric, sp.duration_sec::integer, sp.weight_kg::numeric(6,2)
    from s6_spec sp
    join s6_blocks b on b."order" = sp.block_ord
    cross join s6_session
    returning 1
  ),

  -- ---------------------------------------------------------------------
  -- Le programme catalogue, déjà publié.
  -- ---------------------------------------------------------------------
  program as (
    insert into public.programs (id, title, author, focus, level, weeks, sessions_per_week, description, price_cents, published)
    values (
      'prog-luc-leger-supotsu', 'Prépa Test Luc Léger', 'Supotsu', 'endurance', 'intermediate', 4, 3,
      'Préparation au test Luc Léger (VMA navette) sur 4 semaines — VMA, technique de demi-tour et endurance de base, puis intensification et test à blanc.',
      0, true
    )
    returning id
  )
insert into public.program_sessions (program_id, session_id, week_number, "order")
select program.id, x.session_id, x.week_number, x."order"
from program
cross join (
  -- Phase 1 rejouée semaines 1 et 2 ; Phase 2 rejouée semaines 3 et 4.
  select s1_session.id, 1, 0 from s1_session
union all
  select s2_session.id, 1, 1 from s2_session
union all
  select s3_session.id, 1, 2 from s3_session
union all
  select s1_session.id, 2, 0 from s1_session
union all
  select s2_session.id, 2, 1 from s2_session
union all
  select s3_session.id, 2, 2 from s3_session
union all
  select s4_session.id, 3, 0 from s4_session
union all
  select s5_session.id, 3, 1 from s5_session
union all
  select s6_session.id, 3, 2 from s6_session
union all
  select s4_session.id, 4, 0 from s4_session
union all
  select s5_session.id, 4, 1 from s5_session
union all
  select s6_session.id, 4, 2 from s6_session
) as x(session_id, week_number, "order");
