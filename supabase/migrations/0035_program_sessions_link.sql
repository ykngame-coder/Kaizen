-- SUPOTSU — Le contenu d'un programme, ce sont des séances Supotsu
--
-- 0034 stockait la prescription en séries × répétitions. Les vraies séances de
-- coach ne s'écrivent pas comme ça : elles sont chronométrées (2:00 de marche
-- du fermier à 30 kg), avec des blocs à plafond de temps, des repos et des
-- notes. Ce modèle existe déjà pour les séances de l'app
-- (user_session_blocks + user_session_exercises), et le lecteur de séance sait
-- l'exécuter.
--
-- Une séance de programme est donc une séance publique comme une autre, et
-- program_sessions ne garde que le lien, la semaine et l'ordre. Un seul modèle
-- de contenu, une seule chose à faire évoluer.

drop table if exists public.program_session_exercises;
drop table if exists public.program_sessions;

create table public.program_sessions (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references public.programs (id) on delete cascade,
  -- La séance elle-même. `restrict` : supprimer une séance encore employée par
  -- un programme le laisserait troué.
  session_id uuid not null references public.user_sessions (id) on delete restrict,
  week_number smallint not null default 1 check (week_number > 0),
  "order" smallint not null default 0,
  unique (program_id, week_number, "order")
);

create index program_sessions_program_idx on public.program_sessions (program_id, week_number, "order");

alter table public.program_sessions enable row level security;

create policy "program_sessions readable when published"
  on public.program_sessions for select
  to authenticated
  using (exists (select 1 from public.programs p where p.id = program_id and p.published));
