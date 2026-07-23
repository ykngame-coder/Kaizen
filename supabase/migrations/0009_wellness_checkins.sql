-- SUPOTSU — Étape 8 : Sommeil & bien-être mental
-- Subjective daily check-ins (Master Prompt P14). Same principles as 0001/0003:
--   * owner-scoped rows; RLS = owner-only.
--   * additive history — one row per check-in, never overwritten.
-- Sleep itself needs no new table: it is derived from health_metrics
-- (sleep_duration / sleep_efficiency) already imported by the connectors.

create table public.wellness_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  mood smallint not null check (mood between 1 and 5),
  energy smallint not null check (energy between 1 and 5),
  stress smallint not null check (stress between 1 and 5),
  note text,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index wellness_checkins_user_checked_idx
  on public.wellness_checkins (user_id, checked_at desc);

alter table public.wellness_checkins enable row level security;

create policy "wellness_checkins are self-owned"
  on public.wellness_checkins for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
