-- SUPOTSU — Sleep Suite : phases de sommeil & timeline
-- One row per night, complementing the derived sleep_duration / sleep_efficiency
-- metrics with the stage composition a device provides (Apple Santé / Garmin).
-- Same principles as 0001/0009:
--   * owner-scoped rows; RLS = owner-only.
--   * additive history — one row per (night start, source), never overwritten.
--   * `segments` holds the minute-by-minute hypnogram *only* when the source
--     exposes it; nightly-aggregated exports leave it null (no fabricated data).

create table public.sleep_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  source text not null default 'manual',
  reliability text check (reliability in ('high', 'medium', 'low')),
  started_at timestamptz not null,          -- bedtime
  ended_at timestamptz not null,            -- wake time
  deep_min numeric not null default 0 check (deep_min >= 0),
  light_min numeric not null default 0 check (light_min >= 0),
  rem_min numeric not null default 0 check (rem_min >= 0),
  awake_min numeric not null default 0 check (awake_min >= 0),
  asleep_min numeric not null check (asleep_min >= 0),
  in_bed_min numeric not null check (in_bed_min >= 0),
  segments jsonb,                           -- SleepSegment[] | null
  created_at timestamptz not null default now()
);

create index sleep_sessions_user_started_idx
  on public.sleep_sessions (user_id, started_at desc);

-- Idempotent import: re-importing an overlapping export adds nothing.
create unique index sleep_sessions_dedup_idx
  on public.sleep_sessions (user_id, started_at, source);

alter table public.sleep_sessions enable row level security;

create policy "sleep_sessions are self-owned"
  on public.sleep_sessions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
