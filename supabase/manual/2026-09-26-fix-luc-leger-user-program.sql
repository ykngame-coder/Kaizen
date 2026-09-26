-- Corrige la transcription du programme personnel "Test Luc Léger" de
-- l'utilisateur, dans SES données (user_programs / user_program_sessions /
-- user_sessions), pas dans le catalogue public ni le code. Le programme
-- avait été mappé à tort sur des exercices/format
-- force-Hyrox (Tabata isolé, tags Hyrox, tapis, "×3" au lieu de "3 séries de
-- 6") au lieu du programme course/VMA réel (voir le PDF fourni).
--
-- À exécuter dans le SQL Editor de Supabase (projet vocumsjilhdmzilokhlq),
-- connecté en admin — PAS avec la clé service_role depuis un script/API.
--
-- Le script REMPLACE le contenu (blocs + exercices) des 6 séances existantes
-- du programme, sans créer de doublons ni toucher au planning
-- (user_program_sessions), et sans jamais lire/écrire les données d'un autre
-- utilisateur : tout est résolu par email → user_id → program_id →
-- session_id, avec un contrôle strict (RAISE EXCEPTION) à chaque étape si la
-- résolution ne tombe pas exactement sur ce qui est attendu. Tout est dans
-- une seule transaction : un échec à n'importe quelle étape annule tout
-- (ROLLBACK), les séances ne restent jamais vidées à mi-chemin.

-- ---------------------------------------------------------------------------
-- ⚠️ Remplace TON_EMAIL@exemple.com par ton adresse de connexion à l'app,
-- aux DEUX endroits marqués ci-dessous (vérification + correction), avant
-- d'exécuter quoi que ce soit. Volontairement pas pré-rempli : ce fichier est
-- committé dans le dépôt, autant ne pas y laisser une adresse en clair.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- ÉTAPE 0 (facultatif, recommandé) — vérifier l'état actuel AVANT de corriger.
-- Lance ce SELECT seul d'abord (sans le begin/commit ci-dessous).
-- ---------------------------------------------------------------------------
-- select us.name as seance, usb."order" as bloc, usb.format, usb.time_cap_sec,
--        usb.rest_sec as bloc_rest_sec, usb.target_rounds,
--        use.exercise_id, use.reps, use.distance_m, use.duration_sec
-- from public.user_sessions us
-- join public.user_program_sessions ups on ups.session_id = us.id
-- join public.user_programs up on up.id = ups.program_id
-- left join public.user_session_blocks usb on usb.session_id = us.id
-- left join public.user_session_exercises use on use.block_id = usb.id
-- where up.user_id = (select id from auth.users where email = 'TON_EMAIL@exemple.com')  -- ⚠️ remplace ici
--   and up.title ilike '%luc%l%ger%'
-- order by us.name, usb."order", use."order";

-- ---------------------------------------------------------------------------
-- ÉTAPE 1 — la correction, dans une transaction.
-- ---------------------------------------------------------------------------
begin;

-- Le test lui-même n'est pas un exercice de musculation, donc absent de
-- free-exercise-db — idempotent, sans effet si déjà présent (déjà inséré par
-- 2026-09-23-luc-leger-program-content.sql pour le catalogue public).
insert into public.exercises (id, name, category, primary_muscles, secondary_muscles, equipment, level)
values
  ('Test Luc Léger', 'Test Luc Léger', 'sport_specific', '{full_body}', '{quads,calves}', '{}', 'intermediate')
on conflict (id) do nothing;

do $$
declare
  v_user_id uuid;
  v_program_id uuid;
  v_vma uuid;
  v_specifique uuid;
  v_endurance_base uuid;
  v_fractionne uuid;
  v_test_blanc uuid;
  v_endurance_plio uuid;
  v_count int;
  v_session_ids uuid[];
begin
  select id into v_user_id from auth.users where email = 'TON_EMAIL@exemple.com'; -- ⚠️ remplace ici aussi
  if v_user_id is null then
    raise exception 'Aucun compte trouvé pour cette adresse — as-tu bien remplacé TON_EMAIL@exemple.com par ta vraie adresse ?';
  end if;

  select count(*), min(id) into v_count, v_program_id
  from public.user_programs
  where user_id = v_user_id and title ilike '%luc%l%ger%';
  if v_count <> 1 then
    raise exception 'Attendu exactement 1 programme "Luc Léger" pour cet utilisateur, trouvé %.', v_count;
  end if;

  -- Résout chaque séance par son nom, restreint aux séances DE CE PROGRAMME
  -- (pas une recherche globale) : si le nom ne correspond pas exactement, le
  -- script s'arrête ici plutôt que de deviner ou de toucher autre chose.
  select count(*), min(us.id) into v_count, v_vma
  from public.user_sessions us join public.user_program_sessions ups on ups.session_id = us.id
  where ups.program_id = v_program_id and us.name = 'VMA Courte';
  if v_count <> 1 then raise exception 'Séance "VMA Courte" : attendu 1 correspondance, trouvé %.', v_count; end if;

  select count(*), min(us.id) into v_count, v_specifique
  from public.user_sessions us join public.user_program_sessions ups on ups.session_id = us.id
  where ups.program_id = v_program_id and us.name = 'Spécifique Luc Léger';
  if v_count <> 1 then raise exception 'Séance "Spécifique Luc Léger" : attendu 1 correspondance, trouvé %.', v_count; end if;

  select count(*), min(us.id) into v_count, v_endurance_base
  from public.user_sessions us join public.user_program_sessions ups on ups.session_id = us.id
  where ups.program_id = v_program_id and us.name = 'Endurance de Base';
  if v_count <> 1 then raise exception 'Séance "Endurance de Base" : attendu 1 correspondance, trouvé %.', v_count; end if;

  select count(*), min(us.id) into v_count, v_fractionne
  from public.user_sessions us join public.user_program_sessions ups on ups.session_id = us.id
  where ups.program_id = v_program_id and us.name = 'Fractionné 15/15';
  if v_count <> 1 then raise exception 'Séance "Fractionné 15/15" : attendu 1 correspondance, trouvé %.', v_count; end if;

  select count(*), min(us.id) into v_count, v_test_blanc
  from public.user_sessions us join public.user_program_sessions ups on ups.session_id = us.id
  where ups.program_id = v_program_id and us.name = 'Test à Blanc';
  if v_count <> 1 then raise exception 'Séance "Test à Blanc" : attendu 1 correspondance, trouvé %.', v_count; end if;

  select count(*), min(us.id) into v_count, v_endurance_plio
  from public.user_sessions us join public.user_program_sessions ups on ups.session_id = us.id
  where ups.program_id = v_program_id and us.name = 'Endurance + Pliométrie';
  if v_count <> 1 then raise exception 'Séance "Endurance + Pliométrie" : attendu 1 correspondance, trouvé %.', v_count; end if;

  v_session_ids := array[v_vma, v_specifique, v_endurance_base, v_fractionne, v_test_blanc, v_endurance_plio];

  -- ---------------------------------------------------------------------
  -- Vide le contenu des 6 séances (exercices puis blocs) avant de le
  -- reconstruire. Les séances elles-mêmes (id, planning) restent intactes.
  -- ---------------------------------------------------------------------
  delete from public.user_session_exercises where session_id = any (v_session_ids);
  delete from public.user_session_blocks where session_id = any (v_session_ids);

  -- ---------------------------------------------------------------------
  -- A1 — VMA Courte : échauffement 10 min + 2 séries de (8×30s effort/30s
  -- repos). Le format tabata porte le repos INTRA-série (30s) ; la pause de
  -- 3 min ENTRE les deux séries est documentée en note (pas de champ dédié).
  -- ---------------------------------------------------------------------
  update public.user_sessions set
    notes = '10 min d''échauffement avant de commencer. 3 min de récupération entre les 2 séries de 8×30s/30s.'
  where id = v_vma;

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
  update public.user_sessions set
    notes = '10 min d''échauffement avant de commencer. Technique du demi-tour : ne ralentis pas trop tôt, franchis la ligne d''un seul pied, pivote sur le bassin et relance immédiatement — alterne la jambe de pivot à chaque aller-retour. 2 min de récupération entre les séries.'
  where id = v_specifique;

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
  -- A3 — Endurance de Base : 40 à 45 min de footing continu.
  -- ---------------------------------------------------------------------
  update public.user_sessions set
    notes = 'Footing continu à aisance respiratoire — tu dois pouvoir tenir une conversation.'
  where id = v_endurance_base;

  with b as (
    insert into public.user_session_blocks (session_id, "order", format)
    values (v_endurance_base, 0, 'strength')
    returning id, "order"
  )
  insert into public.user_session_exercises (session_id, block_id, exercise_id, "order", duration_sec)
  select v_endurance_base, b.id, 'Trail_Running_Walking', 0, 2700 from b;

  -- ---------------------------------------------------------------------
  -- B1 — Fractionné 15/15 : échauffement 10 min + 2 séries de (10×15s
  -- sprint/15s repos), 3 min de récupération entre les séries.
  -- ---------------------------------------------------------------------
  update public.user_sessions set
    notes = '10 min d''échauffement avant de commencer. 3 min de récupération entre les 2 séries de 10×15s/15s.'
  where id = v_fractionne;

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
  update public.user_sessions set
    notes = 'Gestion de l''allure : économise-toi sur les 4 premiers paliers. Cale ta foulée exactement sur le bip sonore sans anticiper ni partir trop vite. Jour du test : 15 min d''échauffement spécifique (montées de genoux, pas chassés, mobilité des chevilles) ; chaussures de course légères à bonne adhérence pour les demi-tours.'
  where id = v_test_blanc;

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
  update public.user_sessions set
    notes = '30 min de footing avant le circuit pliométrique.'
  where id = v_endurance_plio;

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

  -- ---------------------------------------------------------------------
  -- Programme : focus endurance (pas hyrox), 4 semaines, description
  -- résumée + consignes tactiques générales. `level` n'est PAS touché : il
  -- reste celui choisi par l'utilisateur.
  -- ---------------------------------------------------------------------
  update public.user_programs set
    focus = 'endurance',
    weeks = 4,
    description = 'Préparation au test Luc Léger (VMA navette) sur 4 semaines, 3 séances par semaine. Phase 1 (semaines 1-2) : développement de la VMA et de la technique de demi-tour, endurance de base. Phase 2 (semaines 3-4) : intensification et gestion des paliers, avec un test à blanc en conditions réelles. Sur le demi-tour : ne pas ralentir trop tôt, franchir la ligne d''un seul pied et relancer immédiatement en alternant la jambe de pivot. Sur les paliers : s''économiser sur les 4 premiers, caler sa foulée sur le bip sans anticiper. Le jour du test : 15 min d''échauffement spécifique, chaussures légères à bonne adhérence.'
  where id = v_program_id;

  raise notice 'OK — programme % corrigé : 6 séances reconstruites (VMA %, Spécifique %, Endurance base %, Fractionné %, Test à blanc %, Endurance+plio %).',
    v_program_id, v_vma, v_specifique, v_endurance_base, v_fractionne, v_test_blanc, v_endurance_plio;
end $$;

commit;
