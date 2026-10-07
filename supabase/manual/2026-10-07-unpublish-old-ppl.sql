-- Dépublie l'ancien "Push Pull Legs" codé en dur (`prog-ppl`, packages/shared/
-- src/programs.ts), resté publié (migration 0040) en même temps que sa
-- version migrée vers le contenu réel (`prog-ppl-supotsu`,
-- 2026-09-22-ppl-program-content.sql) — les deux étaient visibles en double
-- dans le catalogue sous le même titre.
--
-- `prog-ppl-supotsu` est gardé (vraies séances, modèle à blocs, déjà aligné
-- avec Luc Léger / Home Prépa Hyrox / Prépa Hyrox).
--
-- Dépublication plutôt que suppression : réversible (UPDATE), et si des
-- utilisateurs sont inscrits sur `prog-ppl`, leur inscription reste intacte
-- — seule la visibilité dans le catalogue change.
--
-- À exécuter UNE SEULE FOIS dans l'éditeur SQL Supabase (projet vocumsjilhdmzilokhlq).

update public.programs set published = false where id = 'prog-ppl';
