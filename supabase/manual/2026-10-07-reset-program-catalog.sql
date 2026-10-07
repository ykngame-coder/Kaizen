-- Remet le catalogue de programmes à zéro, pour reconstruire un programme à
-- la fois, calmement, au lieu d'empiler des variantes qui finissent par se
-- marcher dessus (3 programmes "Hyrox" différents, dont un sans aucune trace
-- écrite ; un doublon "Push Pull Legs" ; des erreurs dans Luc Léger et PPL).
--
-- Supprime TOUT le catalogue (public.programs), y compris les programmes
-- d'origine codés en dur (prog-ppl, prog-hyrox-prep, prog-recomp,
-- prog-mobilite, etc.) — leur ligne en base disparaît, donc ils ne
-- s'affichent plus dans l'app connectée à Supabase. Le code
-- (packages/shared/src/programs.ts, PROGRAM_CATALOG) n'est PAS touché : il
-- reste la source de données du mode démo (hors Supabase), sans lien avec ce
-- que tu vois dans l'app réelle. Si un jour il faut aussi le vider côté
-- code, c'est un changement séparé, à faire exprès.
--
-- Supprime également les séances catalogue devenues orphelines (créées par
-- les scripts précédents sous le compte auteur partagé) — pas les séances
-- personnelles d'un vrai utilisateur (user_programs), qui n'ont jamais rien
-- à voir avec ce catalogue.
--
-- Les inscriptions en cours (program_enrollments) disparaissent avec leur
-- programme (contrainte en cascade) ; les exercices personnalisés déjà
-- insérés dans public.exercises (Wall Ball Shots, Burpees, etc.) restent —
-- inoffensifs, et probablement réutiles pour reconstruire.
--
-- À exécuter UNE SEULE FOIS dans l'éditeur SQL Supabase (projet vocumsjilhdmzilokhlq).

begin;

-- 1. Tout le catalogue — cascade sur program_sessions et program_enrollments.
delete from public.programs;

-- 2. Les séances catalogue qui n'appartiennent plus à aucun programme
--    (cascade sur leurs blocs et exercices). Scopé au compte auteur partagé
--    des scripts précédents, jamais aux séances d'un vrai utilisateur.
delete from public.user_sessions
where user_id = '856935cf-dd45-43d7-a42c-b11f6b230886'
  and not exists (
    select 1 from public.program_sessions ps where ps.session_id = user_sessions.id
  );

commit;
