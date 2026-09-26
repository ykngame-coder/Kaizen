-- Corrige le CONTENU (blocs + exercices) des 6 séances du programme
-- CATALOGUE "Prépa Test Luc Léger" (public.programs id 'prog-luc-leger-supotsu',
-- créé par 2026-09-23-luc-leger-program-content.sql) — un programme public
-- comme Prépa Hyrox / Home Prépa Hyrox, PAS un programme personnel
-- (user_programs). Rien à voir avec les données d'un utilisateur particulier.
--
-- Ce que ce script corrige, constaté à l'écran :
--   - "Spécifique Luc Léger" et "Endurance de Base" utilisaient le format de
--     bloc 'hyrox' (d'où le tag "Hyrox" affiché) au lieu d'un format course.
--   - "Endurance de Base" utilisait Running_Treadmill (tapis) au lieu d'un
--     footing extérieur (Trail_Running_Walking).
--   - "Spécifique Luc Léger" empilait 3 répétitions du même exercice dans UN
--     seul bloc hyrox (affiché "×3") au lieu de 3 séries (blocs) distinctes
--     avec repos entre elles.
--   - Aucune des 6 séances n'avait de bloc d'échauffement visible (seulement
--     une phrase dans les notes).
-- Les notes de séance, déjà correctes, ne sont pas touchées.
--
-- À exécuter dans le SQL Editor de Supabase (projet vocumsjilhdmzilokhlq),
-- connecté en admin — PAS avec la clé service_role depuis un script/API.
-- Résolu par id de programme (littéral, déjà connu, pas une donnée
-- personnelle) puis par nom de séance au sein de CE programme, avec un
-- contrôle strict (RAISE EXCEPTION) qui arrête tout si ça ne tombe pas
-- exactement sur ce qui est attendu. Une seule transaction : un échec à
-- n'importe quelle étape annule tout (ROLLBACK).

-- ---------------------------------------------------------------------------
-- ÉTAPE 0 (facultatif, recommandé) — vérifier l'état actuel AVANT de corriger.
-- Lance ce SELECT seul d'abord (sans le begin/commit ci-dessous).
-- ---------------------------------------------------------------------------
-- select us.name as seance, usb."order" as bloc, usb.format, usb.time_cap_sec,
--        usb.rest_sec as bloc_rest_sec, usb.target_rounds,
--        use.exercise_id, use.reps, use.distance_m, use.duration_sec
-- from public.user_sessions us
-- join public.program_sessions ps on ps.session_id = us.id
-- left join public.user_session_blocks usb on usb.session_id = us.id
-- left join public.user_session_exercises use on use.block_id = usb.id
-- where ps.program_id = 'prog-luc-leger-supotsu'
-- order by us.name, usb."order", use."order";

-- ---------------------------------------------------------------------------
-- ÉTAPE 1 — la correction, dans une transaction.
-- ---------------------------------------------------------------------------
begin;

-- Idempotent — déjà inséré par 2026-09-23-luc-leger-program-content.sql,
-- sans effet si déjà présent.
insert into public.exercises (id, name, category, primary_muscles, secondary_muscles, equipment, level)
values
  ('Test Luc Léger', 'Test Luc Léger', 'sport_specific', '{full_body}', '{quads,calves}', '{}', 'intermediate')
on conflict (id) do nothing;

do $$
declare
  v_program_id text := 'prog-luc-leger-supotsu';
  v_vma uuid;
  v_specifique uuid;
  v_endurance_base uuid;
  v_fractionne uuid;
  v_test_blanc uuid;
  v_endurance_plio uuid;
  v_count int;
  v_session_ids uuid[];
begin
  select count(*) into v_count from public.programs where id = v_program_id;
  if v_count <> 1 then
    raise exception 'Programme catalogue % introuvable — a-t-il été renommé ou pas encore créé ?', v_program_id;
  end if;

  -- Résout chaque séance par son nom, restreint aux séances DE CE PROGRAMME
  -- (pas une recherche globale) : si le nom ne correspond pas exactement, le
  -- script s'arrête ici plutôt que de deviner ou de toucher autre chose.
  select count(*), min(us.id) into v_count, v_vma
  from public.user_sessions us join public.program_sessions ps on ps.session_id = us.id
  where ps.program_id = v_program_id and us.name = 'VMA Courte';
  if v_count <> 1 then raise exception 'Séance "VMA Courte" : attendu 1 correspondance, trouvé %.', v_count; end if;

  select count(*), min(us.id) into v_count, v_specifique
  from public.user_sessions us join public.program_sessions ps on ps.session_id = us.id
  where ps.program_id = v_program_id and us.name = 'Spécifique Luc Léger';
  if v_count <> 1 then raise exception 'Séance "Spécifique Luc Léger" : attendu 1 correspondance, trouvé %.', v_count; end if;

  select count(*), min(us.id) into v_count, v_endurance_base
  from public.user_sessions us join public.program_sessions ps on ps.session_id = us.id
  where ps.program_id = v_program_id and us.name = 'Endurance de Base';
  if v_count <> 1 then raise exception 'Séance "Endurance de Base" : attendu 1 correspondance, trouvé %.', v_count; end if;

  select count(*), min(us.id) into v_count, v_fractionne
  from public.user_sessions us join public.program_sessions ps on ps.session_id = us.id
  where ps.program_id = v_program_id and us.name = 'Fractionné 15/15';
  if v_count <> 1 then raise exception 'Séance "Fractionné 15/15" : attendu 1 correspondance, trouvé %.', v_count; end if;

  select count(*), min(us.id) into v_count, v_test_blanc
  from public.user_sessions us join public.program_sessions ps on ps.session_id = us.id
  where ps.program_id = v_program_id and us.name = 'Test à Blanc';
  if v_count <> 1 then raise exception 'Séance "Test à Blanc" : attendu 1 correspondance, trouvé %.', v_count; end if;

  select count(*), min(us.id) into v_count, v_endurance_plio
  from public.user_sessions us join public.program_sessions ps on ps.session_id = us.id
  where ps.program_id = v_program_id and us.name = 'Endurance + Pliométrie';
  if v_count <> 1 then raise exception 'Séance "Endurance + Pliométrie" : attendu 1 correspondance, trouvé %.', v_count; end if;

  v_session_ids := array[v_vma, v_specifique, v_endurance_base, v_fractionne, v_test_blanc, v_endurance_plio];

  -- ---------------------------------------------------------------------
  -- Vide le contenu des 6 séances (exercices puis blocs) avant de le
  -- reconstruire. Les séances elles-mêmes (id, lien programme) restent
  -- intactes ; les notes existantes ne sont pas touchées.
  -- ---------------------------------------------------------------------
  delete from public.user_session_exercises where session_id = any (v_session_ids);
  delete from public.user_session_blocks where session_id = any (v_session_ids);

  -- ---------------------------------------------------------------------
  -- A1 — VMA Courte : échauffement 10 min + 2 séries de (8×30s effort/30s
  -- repos). Le format tabata porte le repos INTRA-série (30s) ; la pause de
  -- 3 min ENTRE les deux séries reste documentée dans les notes existantes.
  -- ---------------------------------------------------------------------
  with b as (
    insert into public.user_session_blocks (session_id, "order", format, time_cap_sec, rest_sec, target_rounds)
    values
      (v_vma, 0, 'strength', null, null, null),
      (v_vma, 1, 'tabata', 30, 30, 8),
      (v_vma, 2, 'tabata', 30, 30, 8)
    returning id, "order"
  )
  insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", duration_sec)
  select v_vma, b.id, 'Trail_Running_Walking', 0, 600 from b where b."order" = 0
  union all
  select v_vma, b.id, 'Wind_Sprints', 0, null from b where b."order" in (1, 2);

  -- ---------------------------------------------------------------------
  -- A2 — Spécifique Luc Léger : échauffement 10 min + 3 séries de 6
  -- allers-retours de 20 m, 2 min de récupération entre les séries.
  -- ---------------------------------------------------------------------
  with b as (
    insert into public.user_session_blocks (session_id, "order", format, rest_sec)
    values
      (v_specifique, 0, 'strength', null),
      (v_specifique, 1, 'for_time', 120),
      (v_specifique, 2, 'for_time', 120),
      (v_specifique, 3, 'for_time', null)
    returning id, "order"
  )
  insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", duration_sec, reps, distance_m)
  select v_specifique, b.id, 'Trail_Running_Walking', 0, 600, null, null from b where b."order" = 0
  union all
  select v_specifique, b.id, 'Wind_Sprints', 0, null, 6, 20 from b where b."order" in (1, 2, 3);

  -- ---------------------------------------------------------------------
  -- A3 — Endurance de Base : 40 à 45 min de footing continu EXTÉRIEUR
  -- (Trail_Running_Walking, pas Running_Treadmill / tapis).
  -- ---------------------------------------------------------------------
  with b as (
    insert into public.user_session_blocks (session_id, "order", format)
    values (v_endurance_base, 0, 'strength')
    returning id, "order"
  )
  insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", duration_sec)
  select v_endurance_base, b.id, 'Trail_Running_Walking', 0, 2700 from b;

  -- ---------------------------------------------------------------------
  -- B1 — Fractionné 15/15 : échauffement 10 min + 2 séries de (10×15s
  -- sprint/15s repos), 3 min de récupération entre les séries (en notes).
  -- ---------------------------------------------------------------------
  with b as (
    insert into public.user_session_blocks (session_id, "order", format, time_cap_sec, rest_sec, target_rounds)
    values
      (v_fractionne, 0, 'strength', null, null, null),
      (v_fractionne, 1, 'tabata', 15, 15, 10),
      (v_fractionne, 2, 'tabata', 15, 15, 10)
    returning id, "order"
  )
  insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", duration_sec)
  select v_fractionne, b.id, 'Trail_Running_Walking', 0, 600 from b where b."order" = 0
  union all
  select v_fractionne, b.id, 'Wind_Sprints', 0, null from b where b."order" in (1, 2);

  -- ---------------------------------------------------------------------
  -- B2 — Test à Blanc : échauffement complet + Test Luc Léger en conditions
  -- réelles (pas de reps/durée fixe : effort jusqu'au palier atteint).
  -- ---------------------------------------------------------------------
  with b as (
    insert into public.user_session_blocks (session_id, "order", format)
    values
      (v_test_blanc, 0, 'strength'),
      (v_test_blanc, 1, 'strength')
    returning id, "order"
  )
  insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", duration_sec)
  select v_test_blanc, b.id, 'Trail_Running_Walking', 0, 600 from b where b."order" = 0
  union all
  select v_test_blanc, b.id, 'Test Luc Léger', 0, null from b where b."order" = 1;

  -- ---------------------------------------------------------------------
  -- B3 — Endurance + Pliométrie : 30 min de footing + 4 séries de (10
  -- fentes sautées + 10 squats sautés).
  -- ---------------------------------------------------------------------
  with b as (
    insert into public.user_session_blocks (session_id, "order", format, target_rounds)
    values
      (v_endurance_plio, 0, 'strength', null),
      (v_endurance_plio, 1, 'for_time', 4)
    returning id, "order"
  )
  insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", duration_sec, reps)
  select v_endurance_plio, b.id, 'Trail_Running_Walking', 0, 1800, null from b where b."order" = 0
  union all
  select v_endurance_plio, b.id, 'Split_Jump', 0, null, 10 from b where b."order" = 1
  union all
  select v_endurance_plio, b.id, 'Freehand_Jump_Squat', 1, null, 10 from b where b."order" = 1;

  raise notice 'OK — programme % corrigé : 6 séances reconstruites (VMA %, Spécifique %, Endurance base %, Fractionné %, Test à blanc %, Endurance+plio %).',
    v_program_id, v_vma, v_specifique, v_endurance_base, v_fractionne, v_test_blanc, v_endurance_plio;
end $$;

commit;
