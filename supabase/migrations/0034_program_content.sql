-- SUPOTSU — Contenu des programmes de coach, en base plutôt qu'en dur
--
-- Le catalogue existait déjà, mais le contenu des séances vivait dans le code
-- (packages/shared/src/programs.ts) : publier ou corriger un programme exigeait
-- un build et une revue Apple. Les séances deviennent des données.
--
-- Principes, dans la lignée de 0004 :
--   * catalogue lisible par tout utilisateur connecté, jamais écrit depuis le
--     client — un programme se publie côté serveur.
--   * `published` laisse préparer un programme sans que personne ne le voie.

alter table public.programs
  add column published boolean not null default false;

comment on column public.programs.published is
  'Visible dans le catalogue. Faux tant que le programme se prépare.';

-- ---------------------------------------------------------------------------
-- Séances d'un programme, et leur prescription
-- ---------------------------------------------------------------------------
create table public.program_sessions (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references public.programs (id) on delete cascade,
  -- Position dans le programme : l'inscription les déroule dans cet ordre.
  "order" smallint not null default 0,
  title text not null,
  notes text
);

create index program_sessions_program_idx on public.program_sessions (program_id, "order");

create table public.program_session_exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.program_sessions (id) on delete cascade,
  -- Le catalogue intégré uniquement : un exercice personnalisé appartient à un
  -- utilisateur et resterait invisible pour tous les autres.
  exercise_id text not null references public.exercises (id),
  "order" smallint not null default 0,
  sets smallint not null default 3 check (sets > 0),
  reps smallint not null default 10 check (reps > 0)
);

create index program_session_exercises_session_idx
  on public.program_session_exercises (session_id, "order");

-- ---------------------------------------------------------------------------
-- Row level security — lecture seule, comme le catalogue d'exercices
-- ---------------------------------------------------------------------------
alter table public.program_sessions enable row level security;
alter table public.program_session_exercises enable row level security;

create policy "program_sessions readable when published"
  on public.program_sessions for select
  to authenticated
  using (exists (select 1 from public.programs p where p.id = program_id and p.published));

create policy "program_session_exercises readable via published program"
  on public.program_session_exercises for select
  to authenticated
  using (
    exists (
      select 1
      from public.program_sessions s
      join public.programs p on p.id = s.program_id
      where s.id = session_id and p.published
    )
  );

-- Le catalogue lui-même ne montre que ce qui est publié.
drop policy if exists "programs are readable by authenticated users" on public.programs;

create policy "programs are readable when published"
  on public.programs for select
  to authenticated
  using (published);
