-- Recrée le programme catalogue "Prépa Test Luc Léger" — supprimé par le
-- reset du catalogue (2026-10-07-reset-program-catalog.sql). Contenu
-- confirmé correct par l'utilisateur (transcrit du PDF fourni en tout
-- début de reconstruction) : VMA, technique de demi-tour, endurance de
-- base, fractionné, test à blanc, pliométrie. Même mécanisme que les
-- autres programmes catalogue : vraies séances publiques
-- (user_sessions/user_session_blocks/user_session_exercises), reliées au
-- programme via program_sessions.
--
-- 4 semaines, 3 séances/semaine. Phase 1 (semaines 1-2) : VMA Courte,
-- Spécifique Luc Léger, Endurance de Base. Phase 2 (semaines 3-4) :
-- Fractionné 15/15, Test à Blanc, Endurance + Pliométrie.
--
-- À exécuter UNE SEULE FOIS dans l'éditeur SQL Supabase (projet vocumsjilhdmzilokhlq).

-- Le test lui-même n'est pas un exercice de musculation, donc absent de
-- free-exercise-db.
insert into public.exercises (id, name, category, primary_muscles, secondary_muscles, equipment, level)
values
  ('Test Luc Léger', 'Test Luc Léger', 'sport_specific', '{full_body}', '{quads,calves}', '{}', 'intermediate')
on conflict (id) do nothing;

with
  -- -------------------------------------------------------------------
  -- A1 — VMA Courte
  -- -------------------------------------------------------------------
  a1_session as (
    insert into public.user_sessions (user_id, name, notes, visibility)
    values (
      '856935cf-dd45-43d7-a42c-b11f6b230886', 'VMA Courte',
      '10 min d''échauffement avant de commencer. 3 min de récupération entre les 2 séries de 8×30s/30s.',
      'public'
    )
    returning id
  ),
  a1_blocks as (
    insert into public.user_session_blocks (session_id, "order", format, time_cap_sec, rest_sec, target_rounds)
    select id, b.ord, b.fmt, b.cap, b.rest, b.rounds
    from a1_session, (values
      (0, 'strength', null::int, null::int, null::int),
      (1, 'tabata', 30, 30, 8),
      (2, 'tabata', 30, 30, 8)
    ) as b(ord, fmt, cap, rest, rounds)
    returning id, "order"
  ),
  a1_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", duration_sec)
    select a1_session.id, b.id, 'Trail_Running_Walking', 0, 600 from a1_blocks b cross join a1_session where b."order" = 0
    union all
    select a1_session.id, b.id, 'Wind_Sprints', 0, null from a1_blocks b cross join a1_session where b."order" in (1, 2)
    returning 1
  ),

  -- -------------------------------------------------------------------
  -- A2 — Spécifique Luc Léger
  -- -------------------------------------------------------------------
  a2_session as (
    insert into public.user_sessions (user_id, name, notes, visibility)
    values (
      '856935cf-dd45-43d7-a42c-b11f6b230886', 'Spécifique Luc Léger',
      '10 min d''échauffement avant de commencer. Technique du demi-tour : ne ralentis pas trop tôt, franchis la ligne d''un seul pied, pivote sur le bassin et relance immédiatement — alterne la jambe de pivot à chaque aller-retour. 2 min de récupération entre les séries.',
      'public'
    )
    returning id
  ),
  a2_blocks as (
    insert into public.user_session_blocks (session_id, "order", format)
    select id, b.ord, b.fmt
    from a2_session, (values (0, 'strength'), (1, 'for_time'), (2, 'for_time'), (3, 'for_time')) as b(ord, fmt)
    returning id, "order"
  ),
  -- Repos entre séries : porté par le dernier exercice de chaque bloc (ce que
  -- lit le lecteur de séance), pas par le bloc lui-même — rest_sec sur
  -- user_session_blocks est réservé au repos intra-tabata. Pas de repos après
  -- la 3e série, il n'y a rien après.
  a2_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", duration_sec, reps, distance_m, rest_sec)
    select a2_session.id, b.id, 'Trail_Running_Walking', 0, 600, null, null, null from a2_blocks b cross join a2_session where b."order" = 0
    union all
    select a2_session.id, b.id, 'Wind_Sprints', 0, null, 6, 20, case when b."order" in (1, 2) then 120 else null end
    from a2_blocks b cross join a2_session where b."order" in (1, 2, 3)
    returning 1
  ),

  -- -------------------------------------------------------------------
  -- A3 — Endurance de Base
  -- -------------------------------------------------------------------
  a3_session as (
    insert into public.user_sessions (user_id, name, notes, visibility)
    values (
      '856935cf-dd45-43d7-a42c-b11f6b230886', 'Endurance de Base',
      'Footing continu à aisance respiratoire — tu dois pouvoir tenir une conversation.',
      'public'
    )
    returning id
  ),
  a3_block as (
    insert into public.user_session_blocks (session_id, "order", format)
    select id, 0, 'strength' from a3_session
    returning id as block_id, session_id
  ),
  a3_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", duration_sec)
    select a3_session.id, b.block_id, 'Trail_Running_Walking', 0, 2700 from a3_block b cross join a3_session
    returning 1
  ),

  -- -------------------------------------------------------------------
  -- B1 — Fractionné 15/15
  -- -------------------------------------------------------------------
  b1_session as (
    insert into public.user_sessions (user_id, name, notes, visibility)
    values (
      '856935cf-dd45-43d7-a42c-b11f6b230886', 'Fractionné 15/15',
      '10 min d''échauffement avant de commencer. 3 min de récupération entre les 2 séries de 10×15s/15s.',
      'public'
    )
    returning id
  ),
  b1_blocks as (
    insert into public.user_session_blocks (session_id, "order", format, time_cap_sec, rest_sec, target_rounds)
    select id, b.ord, b.fmt, b.cap, b.rest, b.rounds
    from b1_session, (values
      (0, 'strength', null::int, null::int, null::int),
      (1, 'tabata', 15, 15, 10),
      (2, 'tabata', 15, 15, 10)
    ) as b(ord, fmt, cap, rest, rounds)
    returning id, "order"
  ),
  b1_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", duration_sec)
    select b1_session.id, b.id, 'Trail_Running_Walking', 0, 600 from b1_blocks b cross join b1_session where b."order" = 0
    union all
    select b1_session.id, b.id, 'Wind_Sprints', 0, null from b1_blocks b cross join b1_session where b."order" in (1, 2)
    returning 1
  ),

  -- -------------------------------------------------------------------
  -- B2 — Test à Blanc
  -- -------------------------------------------------------------------
  b2_session as (
    insert into public.user_sessions (user_id, name, notes, visibility)
    values (
      '856935cf-dd45-43d7-a42c-b11f6b230886', 'Test à Blanc',
      'Gestion de l''allure : économise-toi sur les 4 premiers paliers. Cale ta foulée exactement sur le bip sonore sans anticiper ni partir trop vite. Jour du test : 15 min d''échauffement spécifique (montées de genoux, pas chassés, mobilité des chevilles) ; chaussures de course légères à bonne adhérence pour les demi-tours.',
      'public'
    )
    returning id
  ),
  b2_blocks as (
    insert into public.user_session_blocks (session_id, "order", format)
    select id, b.ord, 'strength' from b2_session, (values (0), (1)) as b(ord)
    returning id, "order"
  ),
  b2_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", duration_sec)
    select b2_session.id, b.id, 'Trail_Running_Walking', 0, 600 from b2_blocks b cross join b2_session where b."order" = 0
    union all
    select b2_session.id, b.id, 'Test Luc Léger', 0, null from b2_blocks b cross join b2_session where b."order" = 1
    returning 1
  ),

  -- -------------------------------------------------------------------
  -- B3 — Endurance + Pliométrie
  -- -------------------------------------------------------------------
  b3_session as (
    insert into public.user_sessions (user_id, name, notes, visibility)
    values (
      '856935cf-dd45-43d7-a42c-b11f6b230886', 'Endurance + Pliométrie',
      '30 min de footing avant le circuit pliométrique.',
      'public'
    )
    returning id
  ),
  b3_blocks as (
    insert into public.user_session_blocks (session_id, "order", format, target_rounds)
    select id, b.ord, b.fmt, b.rounds
    from b3_session, (values (0, 'strength', null::int), (1, 'for_time', 4)) as b(ord, fmt, rounds)
    returning id, "order"
  ),
  b3_exercises as (
    insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", duration_sec, reps)
    select b3_session.id, b.id, 'Trail_Running_Walking', 0, 1800, null from b3_blocks b cross join b3_session where b."order" = 0
    union all
    select b3_session.id, b.id, 'Split_Jump', 0, null, 10 from b3_blocks b cross join b3_session where b."order" = 1
    union all
    select b3_session.id, b.id, 'Freehand_Jump_Squat', 1, null, 10 from b3_blocks b cross join b3_session where b."order" = 1
    returning 1
  ),

  -- -------------------------------------------------------------------
  -- Le programme catalogue lui-même.
  -- -------------------------------------------------------------------
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
  select a1_session.id, 1, 0 from a1_session
  union all select a2_session.id, 1, 1 from a2_session
  union all select a3_session.id, 1, 2 from a3_session
  union all select a1_session.id, 2, 0 from a1_session
  union all select a2_session.id, 2, 1 from a2_session
  union all select a3_session.id, 2, 2 from a3_session
  union all select b1_session.id, 3, 0 from b1_session
  union all select b2_session.id, 3, 1 from b2_session
  union all select b3_session.id, 3, 2 from b3_session
  union all select b1_session.id, 4, 0 from b1_session
  union all select b2_session.id, 4, 1 from b2_session
  union all select b3_session.id, 4, 2 from b3_session
) as x(session_id, week_number, "order");
