-- SUPOTSU — Étape 7 : Communauté + Marketplace
-- Principles (Master Prompt P37, P39, P8/P29 privacy):
--   * challenges are shareable but participation and raw activities stay owned.
--   * leaderboards expose only aggregates (progress), never one user's data to
--     another — enforced by a SECURITY DEFINER function, not by opening RLS.
--   * programs are a world-readable catalogue (like exercises); enrollments are
--     owner-scoped.

-- ---------------------------------------------------------------------------
-- challenges + participants
-- ---------------------------------------------------------------------------
create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  description text,
  metric text not null default 'activity_count' check (metric in ('activity_count', 'active_days')),
  target integer not null check (target > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index challenges_visibility_idx on public.challenges (visibility, ends_at desc);

create trigger challenges_set_updated_at
  before update on public.challenges
  for each row execute function public.set_updated_at();

create table public.challenge_participants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, challenge_id)
);

create index challenge_participants_challenge_idx
  on public.challenge_participants (challenge_id);

create trigger challenge_participants_set_updated_at
  before update on public.challenge_participants
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- programs (world-readable catalogue) + enrollments (owner-scoped)
-- ---------------------------------------------------------------------------
create table public.programs (
  id text primary key,
  title text not null,
  author text not null,
  focus text not null check (focus in ('strength', 'endurance', 'hyrox', 'weight_loss', 'mobility', 'general')),
  level text not null check (level in ('beginner', 'intermediate', 'confirmed', 'advanced')),
  weeks integer not null check (weeks > 0),
  sessions_per_week integer not null check (sessions_per_week > 0),
  description text not null default '',
  price_cents integer not null default 0 check (price_cents >= 0)
);

create table public.program_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  program_id text not null references public.programs (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  started_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, program_id)
);

create index program_enrollments_user_idx on public.program_enrollments (user_id);

create trigger program_enrollments_set_updated_at
  before update on public.program_enrollments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.challenges enable row level security;
alter table public.challenge_participants enable row level security;
alter table public.programs enable row level security;
alter table public.program_enrollments enable row level security;

-- challenges: public ones (or your own) are readable; only the owner writes.
create policy "challenges readable when public or own"
  on public.challenges for select
  to authenticated
  using (visibility = 'public' or auth.uid() = user_id);

create policy "challenges writable by owner"
  on public.challenges for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- participants: you manage only your own membership rows.
create policy "challenge_participants are self-owned"
  on public.challenge_participants for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- programs: world-readable catalogue for authenticated users, no client writes.
create policy "programs are readable by authenticated users"
  on public.programs for select
  to authenticated
  using (true);

-- enrollments: strictly owner-scoped.
create policy "program_enrollments are self-owned"
  on public.program_enrollments for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Leaderboard: aggregates only, computed server-side so one participant's raw
-- activities are never exposed to another (privacy first). Authorized to the
-- challenge owner, its participants, or anyone for a public challenge.
-- ---------------------------------------------------------------------------
create or replace function public.challenge_leaderboard(p_challenge uuid)
returns table (user_id uuid, progress bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_starts timestamptz;
  v_ends timestamptz;
  v_metric text;
  v_visibility text;
  v_owner uuid;
begin
  select starts_at, ends_at, metric, visibility, c.user_id
    into v_starts, v_ends, v_metric, v_visibility, v_owner
    from public.challenges c where c.id = p_challenge;
  if not found then
    return;
  end if;

  if v_visibility <> 'public'
     and auth.uid() <> v_owner
     and not exists (
       select 1 from public.challenge_participants cp
       where cp.challenge_id = p_challenge and cp.user_id = auth.uid()
     )
  then
    return;
  end if;

  if v_metric = 'active_days' then
    return query
      select cp.user_id,
             count(distinct date_trunc('day', a.started_at))::bigint as progress
      from public.challenge_participants cp
      left join public.activities a
        on a.user_id = cp.user_id and a.started_at between v_starts and v_ends
      where cp.challenge_id = p_challenge
      group by cp.user_id;
  else
    return query
      select cp.user_id, count(a.id)::bigint as progress
      from public.challenge_participants cp
      left join public.activities a
        on a.user_id = cp.user_id and a.started_at between v_starts and v_ends
      where cp.challenge_id = p_challenge
      group by cp.user_id;
  end if;
end;
$$;

grant execute on function public.challenge_leaderboard(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Program catalogue seed (slugs shared with packages/shared/programs.ts).
-- ---------------------------------------------------------------------------
insert into public.programs (id, title, author, focus, level, weeks, sessions_per_week, description, price_cents)
values
  ('prog-force-debutant', 'Force Fondations', 'Coach Léa', 'strength', 'beginner', 8, 3,
    'Bases du renforcement full-body : squat, charnière de hanche, poussée, tirage.', 0),
  ('prog-endurance-5k', 'Objectif 5 km', 'Coach Marco', 'endurance', 'beginner', 6, 3,
    'Progression course à pied du fractionné léger à un 5 km continu.', 0),
  ('prog-hyrox-prep', 'Prépa Hyrox', 'Coach Sarah', 'hyrox', 'confirmed', 10, 5,
    'Compromis force-endurance orienté stations Hyrox (wall balls, sled, rameur).', 2900),
  ('prog-recomp', 'Recomposition 12 semaines', 'Coach Léa', 'weight_loss', 'intermediate', 12, 4,
    'Musculation + cardio raisonné pour perdre du gras en gardant le muscle.', 1900),
  ('prog-mobilite', 'Mobilité quotidienne', 'Coach Yuki', 'mobility', 'beginner', 4, 6,
    '10 minutes par jour pour les hanches, les épaules et le dos.', 0)
on conflict (id) do nothing;
