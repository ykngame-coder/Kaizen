-- SUPOTSU — Étape 14 : Séances et programmes créés par l'utilisateur
-- Principles (docs/superpowers/specs/2026-08-11-user-programs-design.md):
--   * a session is a reusable template, independent of any program, that can
--     be scheduled into any number of the user's programs (or none).
--   * private by default; sharing = the owner flips visibility to 'public'.
--   * another user never edits or lives off someone else's row — they copy
--     it into their own library (plain inserts from the client, no special
--     RPC), which is why there's no "forked_from" tracking here.
--   * quotas (50 sessions / 2 programs per user) are enforced by a trigger,
--     not just client-side, so a modified client can't bypass them.

-- ---------------------------------------------------------------------------
-- user_sessions (+ their exercise prescription) — reusable session templates
-- ---------------------------------------------------------------------------
create table public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  notes text,
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index user_sessions_user_idx on public.user_sessions (user_id);
create index user_sessions_visibility_idx on public.user_sessions (visibility);

create trigger user_sessions_set_updated_at
  before update on public.user_sessions
  for each row execute function public.set_updated_at();

create table public.user_session_exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.user_sessions (id) on delete cascade,
  exercise_id text not null references public.exercises (id),
  "order" smallint not null default 0,
  reps smallint,
  weight_kg numeric(6, 2),
  duration_sec integer,
  rest_sec integer
);

create index user_session_exercises_session_idx on public.user_session_exercises (session_id);

-- ---------------------------------------------------------------------------
-- user_programs (+ week×day schedule of sessions)
-- ---------------------------------------------------------------------------
create table public.user_programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  focus text not null default 'general'
    check (focus in ('strength', 'endurance', 'hyrox', 'weight_loss', 'mobility', 'general')),
  level text not null default 'beginner'
    check (level in ('beginner', 'intermediate', 'confirmed', 'advanced')),
  weeks integer not null check (weeks > 0 and weeks <= 26),
  description text,
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index user_programs_user_idx on public.user_programs (user_id);
create index user_programs_visibility_idx on public.user_programs (visibility);

create trigger user_programs_set_updated_at
  before update on public.user_programs
  for each row execute function public.set_updated_at();

create table public.user_program_sessions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.user_programs (id) on delete cascade,
  session_id uuid not null references public.user_sessions (id) on delete cascade,
  week_number smallint not null check (week_number > 0),
  day_index smallint not null check (day_index between 0 and 6),
  "order" smallint not null default 0
);

create index user_program_sessions_program_idx on public.user_program_sessions (program_id);
create index user_program_sessions_session_idx on public.user_program_sessions (session_id);

-- ---------------------------------------------------------------------------
-- Quotas — enforced server-side, not just in the client UI.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_user_sessions_quota()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.user_sessions where user_id = new.user_id) >= 50 then
    raise exception 'Limite de 50 séances atteinte.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger user_sessions_quota
  before insert on public.user_sessions
  for each row execute function public.enforce_user_sessions_quota();

create or replace function public.enforce_user_programs_quota()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.user_programs where user_id = new.user_id) >= 2 then
    raise exception 'Limite de 2 programmes atteinte.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger user_programs_quota
  before insert on public.user_programs
  for each row execute function public.enforce_user_programs_quota();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.user_sessions enable row level security;
alter table public.user_session_exercises enable row level security;
alter table public.user_programs enable row level security;
alter table public.user_program_sessions enable row level security;

-- user_sessions: public ones (or your own) are readable; only the owner writes.
create policy "user_sessions readable when public or own"
  on public.user_sessions for select
  to authenticated
  using (visibility = 'public' or auth.uid() = user_id);

create policy "user_sessions writable by owner"
  on public.user_sessions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- user_session_exercises: follow the parent session's visibility/ownership.
create policy "user_session_exercises readable via parent session"
  on public.user_session_exercises for select
  to authenticated
  using (
    exists (
      select 1 from public.user_sessions s
      where s.id = session_id and (s.visibility = 'public' or s.user_id = auth.uid())
    )
  );

create policy "user_session_exercises writable via parent session"
  on public.user_session_exercises for all
  using (exists (select 1 from public.user_sessions s where s.id = session_id and s.user_id = auth.uid()))
  with check (exists (select 1 from public.user_sessions s where s.id = session_id and s.user_id = auth.uid()));

-- user_programs: same shape as user_sessions.
create policy "user_programs readable when public or own"
  on public.user_programs for select
  to authenticated
  using (visibility = 'public' or auth.uid() = user_id);

create policy "user_programs writable by owner"
  on public.user_programs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- user_program_sessions: follow the parent program's visibility/ownership.
create policy "user_program_sessions readable via parent program"
  on public.user_program_sessions for select
  to authenticated
  using (
    exists (
      select 1 from public.user_programs p
      where p.id = program_id and (p.visibility = 'public' or p.user_id = auth.uid())
    )
  );

create policy "user_program_sessions writable via parent program"
  on public.user_program_sessions for all
  using (exists (select 1 from public.user_programs p where p.id = program_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.user_programs p where p.id = program_id and p.user_id = auth.uid()));
